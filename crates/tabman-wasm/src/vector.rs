//! High-performance SIMD-accelerated vector mathematics for Tabman tab embeddings.
//!
//! Provides sub-millisecond dot products, cosine similarities, L2 norms,
//! and full N x N distance matrices for 128d-768d Matryoshka representations.

#[inline]
pub fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    let len = a.len().min(b.len());

    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    {
        use core::arch::wasm32::*;
        let mut sim_sum = f32x4_splat(0.0);
        let chunks = len / 4;

        for i in 0..chunks {
            let offset = i * 4;
            unsafe {
                let va = v128_load(a.as_ptr().add(offset) as *const v128);
                let vb = v128_load(b.as_ptr().add(offset) as *const v128);
                sim_sum = f32x4_add(sim_sum, f32x4_mul(va, vb));
            }
        }

        // Horizontal sum of f32x4
        let mut sum = f32x4_extract_lane::<0>(sim_sum)
            + f32x4_extract_lane::<1>(sim_sum)
            + f32x4_extract_lane::<2>(sim_sum)
            + f32x4_extract_lane::<3>(sim_sum);

        for i in (chunks * 4)..len {
            sum += a[i] * b[i];
        }
        sum
    }

    #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
    {
        let chunks = len / 4;
        let mut s0 = 0.0f32;
        let mut s1 = 0.0f32;
        let mut s2 = 0.0f32;
        let mut s3 = 0.0f32;

        for i in 0..chunks {
            let off = i * 4;
            s0 += a[off] * b[off];
            s1 += a[off + 1] * b[off + 1];
            s2 += a[off + 2] * b[off + 2];
            s3 += a[off + 3] * b[off + 3];
        }
        let mut sum = (s0 + s1) + (s2 + s3);

        for i in (chunks * 4)..len {
            sum += a[i] * b[i];
        }
        sum
    }
}

#[inline]
pub fn l2_norm_squared(v: &[f32]) -> f32 {
    dot_product(v, v)
}

#[inline]
pub fn l2_norm(v: &[f32]) -> f32 {
    l2_norm_squared(v).sqrt()
}

/// Compute cosine similarity between vector `a` and vector `b`.
/// Returns a value between -1.0 and 1.0 (typically 0.0 to 1.0 for normalized embeddings).
#[inline]
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot = dot_product(a, b);
    let norm_a_sq = l2_norm_squared(a);
    let norm_b_sq = l2_norm_squared(b);

    let denom = (norm_a_sq * norm_b_sq).sqrt();
    if denom < 1e-9 {
        0.0
    } else {
        (dot / denom).clamp(-1.0, 1.0)
    }
}

/// Compute the full symmetric N x N pairwise cosine similarity matrix.
///
/// `vectors` contains N contiguous embeddings of dimension `dim` (length = N * dim).
/// `out_matrix` must be pre-allocated to size N * N.
pub fn pairwise_cosine_matrix(vectors: &[f32], n: usize, dim: usize, out_matrix: &mut [f32]) {
    assert!(vectors.len() >= n * dim, "vectors buffer too small");
    assert!(out_matrix.len() >= n * n, "out_matrix buffer too small");

    // Pre-calculate L2 norms for all N vectors to avoid re-computing inside the inner loop:
    let mut inv_norms = Vec::with_capacity(n);
    for i in 0..n {
        let v = &vectors[i * dim..(i + 1) * dim];
        let norm_sq = l2_norm_squared(v);
        let inv = if norm_sq > 1e-9 { 1.0 / norm_sq.sqrt() } else { 0.0 };
        inv_norms.push(inv);
    }

    for i in 0..n {
        let v_i = &vectors[i * dim..(i + 1) * dim];
        let inv_i = inv_norms[i];

        // Diagonal similarity is 1.0
        out_matrix[i * n + i] = 1.0;

        for j in (i + 1)..n {
            let v_j = &vectors[j * dim..(j + 1) * dim];
            let inv_j = inv_norms[j];

            let dot = dot_product(v_i, v_j);
            let sim = (dot * inv_i * inv_j).clamp(-1.0, 1.0);

            out_matrix[i * n + j] = sim;
            out_matrix[j * n + i] = sim; // Symmetric reflection
        }
    }
}

/// Slices `n` embeddings of dimension `orig_dim` to `target_dim` (Matryoshka Representation)
/// and L2-normalizes each sliced vector in-place in `out_vectors`.
pub fn matryoshka_slice_normalize(
    vectors: &[f32],
    n: usize,
    orig_dim: usize,
    target_dim: usize,
    out_vectors: &mut [f32],
) {
    assert!(orig_dim >= target_dim, "orig_dim must be >= target_dim");
    assert!(vectors.len() >= n * orig_dim, "vectors buffer too small");
    assert!(out_vectors.len() >= n * target_dim, "out_vectors buffer too small");

    for i in 0..n {
        let in_slice = &vectors[i * orig_dim..(i * orig_dim + target_dim)];
        let out_slice = &mut out_vectors[i * target_dim..(i + 1) * target_dim];

        out_slice.copy_from_slice(in_slice);
        let norm = l2_norm(out_slice);
        if norm > 1e-9 {
            let inv = 1.0 / norm;
            for x in out_slice.iter_mut() {
                *x *= inv;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dot_product_identical() {
        let a = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let b = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let dot = dot_product(&a, &b);
        assert!((dot - 55.0).abs() < 1e-5);
    }

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let c = vec![1.0, 0.0, 0.0];

        assert_eq!(cosine_similarity(&a, &b), 0.0);
        assert!((cosine_similarity(&a, &c) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_pairwise_matrix() {
        let vectors = vec![
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.707106, 0.707106, 0.0,
        ];
        let mut matrix = vec![0.0f32; 9];
        pairwise_cosine_matrix(&vectors, 3, 3, &mut matrix);

        assert!((matrix[0] - 1.0).abs() < 1e-4);
        assert!((matrix[4] - 1.0).abs() < 1e-4);
        assert!((matrix[8] - 1.0).abs() < 1e-4);
        assert!((matrix[1] - 0.0).abs() < 1e-4);
        assert!((matrix[2] - 0.7071).abs() < 1e-3);
    }
}
