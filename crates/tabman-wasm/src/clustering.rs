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

#[cfg(test)]
mod tests {
    use super::*;

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
