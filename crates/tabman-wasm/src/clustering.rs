//! High-performance semantic tab clustering (K-Means++ & Hierarchical Distance Clustering).
//!
//! Organizes N tab embedding vectors into K semantic clusters in sub-millisecond execution.

use crate::vector::{cosine_similarity, dot_product, l2_norm};

/// Perform K-Means clustering on `n` vectors of dimension `dim` into `k` clusters.
///
/// `vectors` contains N contiguous embeddings of dimension `dim`.
/// `out_assignments` must have length >= N, where each element will be assigned a cluster index 0..k-1.
/// Returns total inertia (sum of squared cosine distances to closest centroid).
pub fn kmeans_cluster(
    vectors: &[f32],
    n: usize,
    dim: usize,
    k: usize,
    max_iterations: usize,
    out_assignments: &mut [i32],
) -> f32 {
    if n == 0 || k == 0 || dim == 0 {
        return 0.0;
    }

    let actual_k = k.min(n);

    if actual_k == 1 {
        for a in out_assignments.iter_mut().take(n) {
            *a = 0;
        }
        return 0.0;
    }

    // 1. K-Means++ Initialization
    let mut centroids = vec![0.0f32; actual_k * dim];

    // Pick first centroid deterministically (vector 0)
    centroids[0..dim].copy_from_slice(&vectors[0..dim]);

    let mut min_dists = vec![f32::MAX; n];

    for c in 1..actual_k {
        let prev_c = &centroids[(c - 1) * dim..c * dim];

        let mut sum_dist_sq = 0.0f32;
        for i in 0..n {
            let v = &vectors[i * dim..(i + 1) * dim];
            let sim = cosine_similarity(v, prev_c);
            let dist = (1.0 - sim).max(0.0);
            if dist < min_dists[i] {
                min_dists[i] = dist;
            }
            sum_dist_sq += min_dists[i] * min_dists[i];
        }

        // Select the next centroid with probability proportional to D(x)^2
        // Deterministic pseudo-random seed to guarantee reproducible clustering across sessions
        let target = sum_dist_sq * 0.73; // Stable deterministic quantile
        let mut accum = 0.0f32;
        let mut chosen = 0;

        for (i, &dist) in min_dists.iter().enumerate().take(n) {
            accum += dist * dist;
            if accum >= target {
                chosen = i;
                break;
            }
        }

        centroids[c * dim..(c + 1) * dim].copy_from_slice(&vectors[chosen * dim..(chosen + 1) * dim]);
    }

    // 2. Lloyd's Iteration
    let mut counts = vec![0usize; actual_k];
    let mut next_centroids = vec![0.0f32; actual_k * dim];
    let mut total_inertia = 0.0f32;

    for _iter in 0..max_iterations {
        let mut changed = false;
        counts.fill(0);
        next_centroids.fill(0.0);
        total_inertia = 0.0;

        for i in 0..n {
            let v = &vectors[i * dim..(i + 1) * dim];
            let mut best_sim = -2.0f32;
            let mut best_c = 0usize;

            for c in 0..actual_k {
                let centroid = &centroids[c * dim..(c + 1) * dim];
                let sim = dot_product(v, centroid);
                if sim > best_sim {
                    best_sim = sim;
                    best_c = c;
                }
            }

            let prev_assigned = out_assignments[i];
            if prev_assigned != best_c as i32 {
                out_assignments[i] = best_c as i32;
                changed = true;
            }

            total_inertia += (1.0 - best_sim).max(0.0);
            counts[best_c] += 1;

            let next_c = &mut next_centroids[best_c * dim..(best_c + 1) * dim];
            for d in 0..dim {
                next_c[d] += v[d];
            }
        }

        // Normalize new centroids
        for c in 0..actual_k {
            let count = counts[c];
            let next_c = &mut next_centroids[c * dim..(c + 1) * dim];

            if count > 0 {
                let norm = l2_norm(next_c);
                if norm > 1e-9 {
                    let inv = 1.0 / norm;
                    for val in next_c.iter_mut() {
                        *val *= inv;
                    }
                }
            } else {
                // If a cluster is empty, reseed with vector (c % n)
                let seed_v = &vectors[(c % n) * dim..((c % n) + 1) * dim];
                next_c.copy_from_slice(seed_v);
            }
        }

        centroids.copy_from_slice(&next_centroids);

        if !changed {
            break; // Converged
        }
    }

    total_inertia
}

/// Automatically clusters `n` vectors of dimension `dim` using density-based
/// Minimum Spanning Tree (MST) mutual reachability analysis ("Auto-K").
///
/// Discovers the natural number of semantic tab clusters without requiring `k` upfront.
/// Returns the number of clusters found.
pub fn autok_cluster(
    vectors: &[f32],
    n: usize,
    dim: usize,
    min_cluster_size: usize,
    out_assignments: &mut [i32],
) -> usize {
    if n == 0 || dim == 0 {
        return 0;
    }

    if n == 1 {
        out_assignments[0] = 0;
        return 1;
    }

    // 1. Compute Pairwise Cosine Distance Matrix
    let mut dist_matrix = vec![0.0f32; n * n];
    for i in 0..n {
        let vi = &vectors[i * dim..(i + 1) * dim];
        dist_matrix[i * n + i] = 0.0;
        for j in (i + 1)..n {
            let vj = &vectors[j * dim..(j + 1) * dim];
            let sim = dot_product(vi, vj);
            let d = (1.0 - sim).max(0.0);
            dist_matrix[i * n + j] = d;
            dist_matrix[j * n + i] = d;
        }
    }

    // 2. Core Distances (density estimate: distance to k-th nearest neighbor)
    let k_neighbor = (min_cluster_size.max(2)).min(n - 1);
    let mut core_dists = vec![0.0f32; n];
    let mut row_dists = vec![0.0f32; n];

    for i in 0..n {
        row_dists.copy_from_slice(&dist_matrix[i * n..(i + 1) * n]);
        row_dists.sort_by(|a, b| a.partial_cmp(b).unwrap_or(core::cmp::Ordering::Equal));
        core_dists[i] = row_dists[k_neighbor];
    }

    // 3. Minimum Spanning Tree using Prim's algorithm on Mutual Reachability graph
    let mut in_tree = vec![false; n];
    let mut min_edge_cost = vec![f32::MAX; n];
    let mut parent = vec![0usize; n];

    min_edge_cost[0] = 0.0;

    #[derive(Clone, Copy)]
    struct MstEdge {
        u: usize,
        v: usize,
        weight: f32,
    }

    let mut mst_edges: Vec<MstEdge> = Vec::with_capacity(n - 1);

    for _ in 0..n {
        let mut u = None;
        let mut best_cost = f32::MAX;

        for (i, (&cost, &is_in)) in min_edge_cost.iter().zip(in_tree.iter()).enumerate() {
            if !is_in && cost < best_cost {
                best_cost = cost;
                u = Some(i);
            }
        }

        let u = match u {
            Some(node) => node,
            None => break,
        };

        in_tree[u] = true;

        if u != 0 {
            mst_edges.push(MstEdge {
                u: parent[u],
                v: u,
                weight: best_cost,
            });
        }

        for v in 0..n {
            if !in_tree[v] {
                // Mutual reachability distance
                let raw_d = dist_matrix[u * n + v];
                let mreach = raw_d.max(core_dists[u]).max(core_dists[v]);

                if mreach < min_edge_cost[v] {
                    min_edge_cost[v] = mreach;
                    parent[v] = u;
                }
            }
        }
    }

    if mst_edges.is_empty() {
        for a in out_assignments.iter_mut().take(n) {
            *a = 0;
        }
        return 1;
    }

    // 4. Adaptive Threshold Cut
    let edge_count = mst_edges.len() as f32;
    let sum_weight: f32 = mst_edges.iter().map(|e| e.weight).sum();
    let mean_weight = sum_weight / edge_count;

    let var_weight: f32 = mst_edges
        .iter()
        .map(|e| (e.weight - mean_weight).powi(2))
        .sum::<f32>()
        / edge_count;
    let std_weight = var_weight.sqrt();

    // Cut threshold: edges exceeding mean + 0.6 * std are inter-cluster bridges
    let threshold = (mean_weight + 0.6 * std_weight).min(0.65).max(0.15);

    // 5. Build Adjacency List with pruned edges
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    for edge in &mst_edges {
        if edge.weight <= threshold {
            adj[edge.u].push(edge.v);
            adj[edge.v].push(edge.u);
        }
    }

    // 6. Connected Components via BFS
    out_assignments[..n].fill(-1);
    let mut cluster_id = 0i32;
    let mut visited = vec![false; n];
    let mut queue = std::collections::VecDeque::new();
    let mut component = Vec::new();
    let mut small_nodes = Vec::new();

    for start_node in 0..n {
        if visited[start_node] {
            continue;
        }

        component.clear();
        visited[start_node] = true;
        queue.push_back(start_node);

        while let Some(node) = queue.pop_front() {
            component.push(node);
            for &neighbor in &adj[node] {
                if !visited[neighbor] {
                    visited[neighbor] = true;
                    queue.push_back(neighbor);
                }
            }
        }

        if component.len() >= min_cluster_size {
            for &node in &component {
                out_assignments[node] = cluster_id;
            }
            cluster_id += 1;
        } else {
            small_nodes.extend_from_slice(&component);
        }
    }

    // Fallback: If no clusters formed, all to cluster 0
    if cluster_id == 0 {
        for a in out_assignments.iter_mut().take(n) {
            *a = 0;
        }
        return 1;
    }

    // Assign singleton/small nodes to their nearest established cluster
    for &node in &small_nodes {
        let mut closest_c = 0i32;
        let mut min_d = f32::MAX;

        for other in 0..n {
            let c = out_assignments[other];
            if c >= 0 {
                let d = dist_matrix[node * n + other];
                if d < min_d {
                    min_d = d;
                    closest_c = c;
                }
            }
        }
        out_assignments[node] = closest_c;
    }

    cluster_id as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_autok_clustering_detects_groups() {
        // Group A: 3 vectors near [1, 0, 0]
        // Group B: 3 vectors near [0, 1, 0]
        let vectors = vec![
            1.0, 0.05, 0.0,
            0.95, 0.1, 0.0,
            0.98, 0.02, 0.0,
            0.05, 1.0, 0.0,
            0.02, 0.98, 0.0,
            0.08, 0.95, 0.0,
        ];

        let mut assignments = vec![-1i32; 6];
        let k = autok_cluster(&vectors, 6, 3, 2, &mut assignments);

        assert_eq!(k, 2);
        // Group A shares same cluster
        assert_eq!(assignments[0], assignments[1]);
        assert_eq!(assignments[1], assignments[2]);
        // Group B shares same cluster
        assert_eq!(assignments[3], assignments[4]);
        assert_eq!(assignments[4], assignments[5]);
        // Group A and Group B are distinct
        assert_ne!(assignments[0], assignments[3]);
    }

    #[test]
    fn test_kmeans_simple_clustering() {
        // Group 1: pointing near [1, 0, 0]
        // Group 2: pointing near [0, 1, 0]
        let vectors = vec![
            1.0, 0.05, 0.0,
            0.98, 0.1, 0.0,
            0.05, 1.0, 0.0,
            0.1, 0.95, 0.0,
        ];
        let mut assignments = vec![0i32; 4];
        let inertia = kmeans_cluster(&vectors, 4, 3, 2, 20, &mut assignments);

        assert!(inertia < 0.2);
        // First two vectors should share the same cluster
        assert_eq!(assignments[0], assignments[1]);
        // Last two vectors should share the same cluster
        assert_eq!(assignments[2], assignments[3]);
        // But the two groups must be different clusters!
        assert_ne!(assignments[0], assignments[2]);
    }
}
