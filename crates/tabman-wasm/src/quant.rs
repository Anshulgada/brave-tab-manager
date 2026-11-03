//! Int8 Scalar Quantization (SQ8) & SIMD Integer Vector Search.
//!
//! Compresses Float32 embedding vectors to 8-bit signed integers (4x memory reduction)
//! and accelerates vector similarity search using 128-bit SIMD integer multiply-accumulate.

use std::collections::BinaryHeap;

#[cfg(target_arch = "wasm32")]
use core::arch::wasm32::*;

/// Quantizes `n` vectors of dimension `dim` from `Float32` into `Int8` with per-vector scales.
///
/// `out_quant` must have length >= `n * dim`.
/// `out_scales` must have length >= `n`.
pub fn quantize_sq8(
    vectors: &[f32],
    n: usize,
    dim: usize,
    out_quant: &mut [i8],
    out_scales: &mut [f32],
) {
    if n == 0 || dim == 0 {
        return;
    }

    for i in 0..n {
        let v = &vectors[i * dim..(i + 1) * dim];

        // Find max absolute value
        let mut max_abs = 0.0f32;
        for &val in v {
            let abs_val = val.abs();
            if abs_val > max_abs {
                max_abs = abs_val;
            }
        }

        if max_abs < 1e-9 {
            out_scales[i] = 1.0;
            out_quant[i * dim..(i + 1) * dim].fill(0);
            continue;
        }

        let scale = max_abs / 127.0;
        let inv_scale = 127.0 / max_abs;
        out_scales[i] = scale;

        let out_slice = &mut out_quant[i * dim..(i + 1) * dim];
        for d in 0..dim {
            let scaled = (v[d] * inv_scale).round();
            out_slice[d] = scaled.clamp(-127.0, 127.0) as i8;
        }
    }
}

/// Dequantizes `n` vectors of dimension `dim` from `Int8` back into `Float32`.
pub fn dequantize_sq8(
    quant: &[i8],
    scales: &[f32],
    n: usize,
    dim: usize,
    out_vectors: &mut [f32],
) {
    if n == 0 || dim == 0 {
        return;
    }

    for i in 0..n {
        let scale = scales[i];
        let q_slice = &quant[i * dim..(i + 1) * dim];
        let out_slice = &mut out_vectors[i * dim..(i + 1) * dim];

        for d in 0..dim {
            out_slice[d] = (q_slice[d] as f32) * scale;
        }
    }
}

/// Computes the dot product between two Int8 quantized vectors scaled by their factors.
#[inline]
pub fn dot_product_sq8(a: &[i8], b: &[i8], scale_a: f32, scale_b: f32) -> f32 {
    let len = a.len().min(b.len());
    let mut sum = 0i32;

    #[cfg(target_arch = "wasm32")]
    {
        let chunks = len / 16;
        let mut acc = i32x4_splat(0);

        unsafe {
            let mut ptr_a = a.as_ptr() as *const v128;
            let mut ptr_b = b.as_ptr() as *const v128;

            for _ in 0..chunks {
                let va = v128_load(ptr_a);
                let vb = v128_load(ptr_b);

                // Lower 8 bytes multiplied to i16
                let prod_lo = i16x8_extmul_low_i8x16(va, vb);
                // Upper 8 bytes multiplied to i16
                let prod_hi = i16x8_extmul_high_i8x16(va, vb);

                // Extend i16 to i32 and add to accumulator
                let add_lo_lo = i32x4_extend_low_i16x8(prod_lo);
                let add_lo_hi = i32x4_extend_high_i16x8(prod_lo);
                let add_hi_lo = i32x4_extend_low_i16x8(prod_hi);
                let add_hi_hi = i32x4_extend_high_i16x8(prod_hi);

                acc = i32x4_add(acc, add_lo_lo);
                acc = i32x4_add(acc, add_lo_hi);
                acc = i32x4_add(acc, add_hi_lo);
                acc = i32x4_add(acc, add_hi_hi);

                ptr_a = ptr_a.add(1);
                ptr_b = ptr_b.add(1);
            }
        }

        sum += i32x4_extract_lane::<0>(acc);
        sum += i32x4_extract_lane::<1>(acc);
        sum += i32x4_extract_lane::<2>(acc);
        sum += i32x4_extract_lane::<3>(acc);

        let remainder = chunks * 16;
        for i in remainder..len {
            sum += (a[i] as i32) * (b[i] as i32);
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        for i in 0..len {
            sum += (a[i] as i32) * (b[i] as i32);
        }
    }

    (sum as f32) * scale_a * scale_b
}

#[derive(Clone, Copy, PartialEq)]
struct QuantCandidate {
    index: u32,
    score: f32,
}

impl PartialOrd for QuantCandidate {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        other.score.partial_cmp(&self.score)
    }
}

impl Eq for QuantCandidate {}

impl Ord for QuantCandidate {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.partial_cmp(other).unwrap_or(core::cmp::Ordering::Equal)
    }
}

/// Top-K nearest neighbor search directly over an Int8 quantized embedding database.
pub fn topk_search_sq8(
    query_quant: &[i8],
    query_scale: f32,
    db_quant: &[i8],
    db_scales: &[f32],
    m: usize,
    dim: usize,
    k: usize,
    out_indices: &mut [u32],
    out_scores: &mut [f32],
) -> usize {
    if m == 0 || k == 0 || dim == 0 || query_quant.len() < dim || db_quant.len() < m * dim {
        return 0;
    }

    let actual_k = k.min(m).min(out_indices.len()).min(out_scores.len());
    let mut heap: BinaryHeap<QuantCandidate> = BinaryHeap::with_capacity(actual_k + 1);

    for i in 0..m {
        let candidate_q = &db_quant[i * dim..(i + 1) * dim];
        let score = dot_product_sq8(query_quant, candidate_q, query_scale, db_scales[i]);

        if heap.len() < actual_k {
            heap.push(QuantCandidate {
                index: i as u32,
                score,
            });
        } else if let Some(min_top) = heap.peek() {
            if score > min_top.score {
                heap.pop();
                heap.push(QuantCandidate {
                    index: i as u32,
                    score,
                });
            }
        }
    }

    let count = heap.len();
    let mut sorted = heap.into_vec();
    sorted.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(core::cmp::Ordering::Equal));

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
    fn test_quantize_dequantize() {
        let original = vec![0.5f32, -0.8, 0.1, 0.95];
        let mut quant = vec![0i8; 4];
        let mut scales = vec![0.0f32; 1];
        let mut reconstructed = vec![0.0f32; 4];

        quantize_sq8(&original, 1, 4, &mut quant, &mut scales);
        dequantize_sq8(&quant, &scales, 1, 4, &mut reconstructed);

        for i in 0..4 {
            assert!((original[i] - reconstructed[i]).abs() < 0.02);
        }
    }

    #[test]
    fn test_dot_product_sq8() {
        let a = vec![1.0f32, 0.0, 0.0, 0.0];
        let b = vec![0.9f32, 0.1, 0.0, 0.0];

        let mut qa = vec![0i8; 4];
        let mut sa = vec![0.0f32; 1];
        quantize_sq8(&a, 1, 4, &mut qa, &mut sa);

        let mut qb = vec![0i8; 4];
        let mut sb = vec![0.0f32; 1];
        quantize_sq8(&b, 1, 4, &mut qb, &mut sb);

        let sim = dot_product_sq8(&qa, &qb, sa[0], sb[0]);
        assert!((sim - 0.9).abs() < 0.02);
    }
}
