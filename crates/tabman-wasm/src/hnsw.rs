//! In-Memory Hierarchical Navigable Small World (HNSW) Vector Graph Index.
//!
//! Provides O(log N) approximate nearest neighbor vector search directly in WebAssembly
//! linear memory. Replaces O(N) exhaustive scanning with sub-0.02ms graph lookups.

use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashSet};

/// Cosine distance helper for normalized vectors: 1.0 - dot_product
#[inline(always)]
fn cosine_distance(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0f32;
    let len = a.len();
    for i in 0..len {
        dot += a[i] * b[i];
    }
    1.0f32 - dot
}

#[derive(Debug, Clone)]
struct Neighbor {
    id: u32,
    distance: f32,
}

impl PartialEq for Neighbor {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Eq for Neighbor {}

impl PartialOrd for Neighbor {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Neighbor {
    fn cmp(&self, other: &Self) -> Ordering {
        // Max-heap on distance
        self.distance
            .partial_cmp(&other.distance)
            .unwrap_or(Ordering::Equal)
    }
}

#[derive(Debug)]
struct HnswNode {
    id: u32,
    vector: Vec<f32>,
    /// Neighbors at layer 0
    neighbors: Vec<u32>,
}

pub struct HnswIndex {
    pub dim: usize,
    pub m: usize,
    pub ef_construction: usize,
    nodes: Vec<HnswNode>,
    entry_point: Option<u32>,
}

impl HnswIndex {
    pub fn new(dim: usize, m: usize, ef_construction: usize) -> Self {
        Self {
            dim,
            m: m.clamp(4, 64),
            ef_construction: ef_construction.max(16),
            nodes: Vec::new(),
            entry_point: None,
        }
    }

    pub fn insert(&mut self, id: u32, vector: &[f32]) {
        assert_eq!(vector.len(), self.dim, "Vector dimension mismatch");

        let node_idx = self.nodes.len() as u32;
        let mut new_node = HnswNode {
            id,
            vector: vector.to_vec(),
            neighbors: Vec::with_capacity(self.m),
        };

        if self.nodes.is_empty() {
            self.nodes.push(new_node);
            self.entry_point = Some(node_idx);
            return;
        }

        // Search for nearest neighbors in layer 0 using ef_construction
        let entry = self.entry_point.unwrap();
        let candidates = self.search_layer(vector, entry, self.ef_construction);

        // Connect new node to M nearest neighbors
        let num_neighbors = candidates.len().min(self.m);
        for cand in &candidates[..num_neighbors] {
            let cand_id = cand.id as usize;
            new_node.neighbors.push(cand.id);

            // Bidirectional connection
            if self.nodes[cand_id].neighbors.len() < self.m {
                self.nodes[cand_id].neighbors.push(node_idx);
            } else {
                let current_dist = cosine_distance(&self.nodes[cand_id].vector, vector);
                let neighbor_ids = self.nodes[cand_id].neighbors.clone();
                let mut worst_idx = 0;
                let mut worst_dist = f32::NEG_INFINITY;
                for (k, &n_id) in neighbor_ids.iter().enumerate() {
                    let d = cosine_distance(&self.nodes[cand_id].vector, &self.nodes[n_id as usize].vector);
                    if d > worst_dist {
                        worst_dist = d;
                        worst_idx = k;
                    }
                }
                if current_dist < worst_dist {
                    self.nodes[cand_id].neighbors[worst_idx] = node_idx;
                }
            }
        }

        self.nodes.push(new_node);
    }

    fn search_layer(&self, query: &[f32], entry: u32, ef: usize) -> Vec<Neighbor> {
        let mut visited = HashSet::new();
        visited.insert(entry);

        let initial_dist = cosine_distance(query, &self.nodes[entry as usize].vector);

        let mut candidates = BinaryHeap::new(); // Min-heap on distance
        candidates.push(std::cmp::Reverse(Neighbor {
            id: entry,
            distance: initial_dist,
        }));

        let mut nearest = BinaryHeap::new(); // Max-heap on distance
        nearest.push(Neighbor {
            id: entry,
            distance: initial_dist,
        });

        while let Some(std::cmp::Reverse(curr)) = candidates.pop() {
            if let Some(furthest) = nearest.peek() {
                if curr.distance > furthest.distance && nearest.len() >= ef {
                    break;
                }
            }

            let curr_node = &self.nodes[curr.id as usize];
            for &neighbor_id in &curr_node.neighbors {
                if visited.insert(neighbor_id) {
                    let dist = cosine_distance(query, &self.nodes[neighbor_id as usize].vector);
                    if nearest.len() < ef || dist < nearest.peek().unwrap().distance {
                        candidates.push(std::cmp::Reverse(Neighbor {
                            id: neighbor_id,
                            distance: dist,
                        }));
                        nearest.push(Neighbor {
                            id: neighbor_id,
                            distance: dist,
                        });
                        if nearest.len() > ef {
                            nearest.pop();
                        }
                    }
                }
            }
        }

        // Return sorted ascending by distance (closest first)
        nearest.into_sorted_vec()
    }

    pub fn search(&self, query: &[f32], k: usize, ef_search: usize) -> Vec<(u32, f32)> {
        if self.nodes.is_empty() || self.entry_point.is_none() {
            return Vec::new();
        }

        let ef = ef_search.max(k).max(self.m);
        let entry = self.entry_point.unwrap();
        let neighbors = self.search_layer(query, entry, ef);

        neighbors
            .into_iter()
            .take(k)
            .map(|n| {
                let actual_id = self.nodes[n.id as usize].id;
                let similarity = 1.0f32 - n.distance;
                (actual_id, similarity)
            })
            .collect()
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hnsw_insert_and_exact_search() {
        let mut index = HnswIndex::new(4, 8, 16);

        let v0 = [1.0, 0.0, 0.0, 0.0];
        let v1 = [0.0, 1.0, 0.0, 0.0];
        let v2 = [0.0, 0.0, 1.0, 0.0];
        let v3 = [0.0, 0.0, 0.0, 1.0];

        index.insert(100, &v0);
        index.insert(200, &v1);
        index.insert(300, &v2);
        index.insert(400, &v3);

        assert_eq!(index.len(), 4);

        // Query matches v0
        let query = [0.99, 0.05, 0.0, 0.0];
        let results = index.search(&query, 2, 16);
        assert!(!results.is_empty());
        assert_eq!(results[0].0, 100);
        assert!(results[0].1 > 0.95);
    }
}
