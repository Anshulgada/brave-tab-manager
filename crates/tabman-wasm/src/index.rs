//! In-Memory Fast Vector Search Index for historical tab retrieval.
//!
//! Scans thousands of saved tab embeddings in IndexedDB in sub-millisecond time
//! to retrieve Top-K most semantically relevant tabs for a given query vector.

use crate::vector::dot_product;

#[derive(Clone, Copy, PartialEq)]
pub struct Candidate {
    pub index: u32,
    pub score: f32,
}

impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        // Reverse order so that minimum score is at the top of the min-heap
        other.score.partial_cmp(&self.score)
    }
}

impl Eq for Candidate {}

impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.partial_cmp(other).unwrap_or(core::cmp::Ordering::Equal)
    }
}

/// Find the Top-K most similar tab embeddings to a query vector.
///
/// `query` is a vector of dimension `dim`.
/// `db` contains `m` stored tab embeddings of dimension `dim` (length = m * dim).
/// Both `query` and `db` vectors are assumed to be unit-normalized (cosine similarity = dot product).
///
/// Writes up to `k` results into `out_indices` and `out_scores` in descending order of similarity.
/// Returns the actual number of results written.
pub fn topk_vector_search(
    query: &[f32],
    db: &[f32],
    m: usize,
    dim: usize,
    k: usize,
    out_indices: &mut [u32],
    out_scores: &mut [f32],
) -> usize {
    if m == 0 || k == 0 || dim == 0 || query.len() < dim || db.len() < m * dim {
        return 0;
    }

    let actual_k = k.min(m).min(out_indices.len()).min(out_scores.len());
    let mut heap: std::collections::BinaryHeap<Candidate> = std::collections::BinaryHeap::with_capacity(actual_k + 1);

    for i in 0..m {
        let candidate_v = &db[i * dim..(i + 1) * dim];
        let score = dot_product(query, candidate_v);

        if heap.len() < actual_k {
            heap.push(Candidate {
                index: i as u32,
                score,
            });
        } else if let Some(min_top) = heap.peek() {
            if score > min_top.score {
                heap.pop();
                heap.push(Candidate {
                    index: i as u32,
                    score,
                });
            }
        }
    }

    // Drain heap into output arrays in descending order of similarity score
    let count = heap.len();
    let mut sorted: Vec<Candidate> = heap.into_vec();
    sorted.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(core::cmp::Ordering::Equal)
    });

    for (i, c) in sorted.into_iter().enumerate() {
        out_indices[i] = c.index;
        out_scores[i] = c.score;
    }

    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_topk_search() {
        let query = vec![1.0, 0.0, 0.0];
        let db = vec![
            0.0, 1.0, 0.0, // tab 0: orthogonal
            0.9, 0.1, 0.0, // tab 1: close
            0.2, 0.8, 0.0, // tab 2: far
            1.0, 0.0, 0.0, // tab 3: identical
        ];

        let mut indices = vec![0u32; 2];
        let mut scores = vec![0.0f32; 2];

        let found = topk_vector_search(&query, &db, 4, 3, 2, &mut indices, &mut scores);

        assert_eq!(found, 2);
        // Top 1 should be tab 3 (score 1.0)
        assert_eq!(indices[0], 3);
        assert!((scores[0] - 1.0).abs() < 1e-4);
        // Top 2 should be tab 1 (score 0.9)
        assert_eq!(indices[1], 1);
        assert!((scores[1] - 0.9).abs() < 1e-4);
    }
}
