//! Tabman Rust WASM SIMD Acceleration Engine.
//!
//! Exposes zero-copy, C-ABI WebAssembly functions for browser extension
//! and CLI workflows, executing vector math, clustering, and tokenization
//! at native silicon speeds.

pub mod clustering;
pub mod fuzzy;
pub mod index;
pub mod quant;
pub mod tokenizer;
pub mod vector;

use core::slice;
use std::alloc::{alloc, dealloc, Layout};

/// Allocate `size` bytes in WebAssembly linear memory.
#[no_mangle]
pub extern "C" fn tabman_alloc(size: usize) -> *mut u8 {
    if size == 0 {
        return core::ptr::null_mut();
    }
    let layout = Layout::from_size_align(size, 8).unwrap_or(Layout::new::<u8>());
    unsafe { alloc(layout) }
}

/// Deallocate memory previously allocated with `tabman_alloc`.
#[no_mangle]
pub extern "C" fn tabman_dealloc(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    let layout = Layout::from_size_align(size, 8).unwrap_or(Layout::new::<u8>());
    unsafe { dealloc(ptr, layout) }
}

/// Compute full N x N pairwise cosine similarity distance matrix in WASM SIMD.
#[no_mangle]
pub extern "C" fn tabman_pairwise_cosine(
    vectors_ptr: *const f32,
    n: usize,
    dim: usize,
    out_ptr: *mut f32,
) {
    if vectors_ptr.is_null() || out_ptr.is_null() || n == 0 || dim == 0 {
        return;
    }
    unsafe {
        let vectors = slice::from_raw_parts(vectors_ptr, n * dim);
        let out_matrix = slice::from_raw_parts_mut(out_ptr, n * n);
        vector::pairwise_cosine_matrix(vectors, n, dim, out_matrix);
    }
}

/// Perform K-Means clustering on N embeddings of dimension `dim` into `k` clusters.
#[no_mangle]
pub extern "C" fn tabman_kmeans(
    vectors_ptr: *const f32,
    n: usize,
    dim: usize,
    k: usize,
    max_iter: usize,
    out_ptr: *mut i32,
) -> f32 {
    if vectors_ptr.is_null() || out_ptr.is_null() || n == 0 || dim == 0 || k == 0 {
        return 0.0;
    }
    unsafe {
        let vectors = slice::from_raw_parts(vectors_ptr, n * dim);
        let assignments = slice::from_raw_parts_mut(out_ptr, n);
        clustering::kmeans_cluster(vectors, n, dim, k, max_iter, assignments)
    }
}

/// Top-K Nearest Neighbor vector search across `m` stored embeddings.
#[no_mangle]
pub extern "C" fn tabman_topk_search(
    query_ptr: *const f32,
    db_ptr: *const f32,
    m: usize,
    dim: usize,
    k: usize,
    out_idx_ptr: *mut u32,
    out_scores_ptr: *mut f32,
) -> usize {
    if query_ptr.is_null() || db_ptr.is_null() || out_idx_ptr.is_null() || out_scores_ptr.is_null() {
        return 0;
    }
    unsafe {
        let query = slice::from_raw_parts(query_ptr, dim);
        let db = slice::from_raw_parts(db_ptr, m * dim);
        let out_indices = slice::from_raw_parts_mut(out_idx_ptr, k);
        let out_scores = slice::from_raw_parts_mut(out_scores_ptr, k);
        index::topk_vector_search(query, db, m, dim, k, out_indices, out_scores)
    }
}

/// Slices `n` vectors of dimension `orig_dim` down to `target_dim` (Matryoshka Representation)
/// and L2-normalizes each sliced vector in-place.
#[no_mangle]
pub extern "C" fn tabman_matryoshka_slice(
    vectors_ptr: *const f32,
    n: usize,
    orig_dim: usize,
    target_dim: usize,
    out_ptr: *mut f32,
) {
    if vectors_ptr.is_null() || out_ptr.is_null() || n == 0 || orig_dim < target_dim {
        return;
    }
    unsafe {
        let vectors = slice::from_raw_parts(vectors_ptr, n * orig_dim);
        let out = slice::from_raw_parts_mut(out_ptr, n * target_dim);
        vector::matryoshka_slice_normalize(vectors, n, orig_dim, target_dim, out);
    }
}

/// Fast tokenization and sequence bounding ([B, 32]).
#[no_mangle]
pub extern "C" fn tabman_tokenize(
    title_ptr: *const u8,
    title_len: usize,
    max_len: usize,
    out_tokens_ptr: *mut i64,
    out_mask_ptr: *mut i64,
) -> usize {
    if title_ptr.is_null() || out_tokens_ptr.is_null() || out_mask_ptr.is_null() {
        return 0;
    }
    unsafe {
        let bytes = slice::from_raw_parts(title_ptr, title_len);
        let title = std::str::from_utf8_unchecked(bytes);
        let out_tokens = slice::from_raw_parts_mut(out_tokens_ptr, max_len);
        let out_mask = slice::from_raw_parts_mut(out_mask_ptr, max_len);
        tokenizer::tokenize_title_simple(title, max_len, out_tokens, out_mask)
    }
}

/// Auto-K density/MST semantic clustering without requiring K upfront.
#[no_mangle]
pub extern "C" fn tabman_autok_cluster(
    vectors_ptr: *const f32,
    n: usize,
    dim: usize,
    min_cluster_size: usize,
    out_assignments_ptr: *mut i32,
) -> usize {
    if vectors_ptr.is_null() || out_assignments_ptr.is_null() || n == 0 || dim == 0 {
        return 0;
    }
    unsafe {
        let vectors = slice::from_raw_parts(vectors_ptr, n * dim);
        let assignments = slice::from_raw_parts_mut(out_assignments_ptr, n);
        clustering::autok_cluster(vectors, n, dim, min_cluster_size, assignments)
    }
}

/// Compute fuzzy match score between query and target string.
/// Returns -1 if no match, or positive score if matched.
#[no_mangle]
pub extern "C" fn tabman_fuzzy_score(
    query_ptr: *const u8,
    query_len: usize,
    target_ptr: *const u8,
    target_len: usize,
) -> i32 {
    if query_ptr.is_null() || target_ptr.is_null() {
        return -1;
    }
    unsafe {
        let query_bytes = slice::from_raw_parts(query_ptr, query_len);
        let target_bytes = slice::from_raw_parts(target_ptr, target_len);
        let query = match std::str::from_utf8(query_bytes) {
            Ok(s) => s,
            Err(_) => return -1,
        };
        let target = match std::str::from_utf8(target_bytes) {
            Ok(s) => s,
            Err(_) => return -1,
        };
        fuzzy::fuzzy_score(query, target).unwrap_or(-1)
    }
}

/// Batch fuzzy tab search across N candidate strings.
/// Targets blob contains contiguous UTF-8 bytes for all candidates.
/// `offsets_ptr` and `lengths_ptr` contain the byte offset and length of each candidate.
#[no_mangle]
pub extern "C" fn tabman_fuzzy_search(
    query_ptr: *const u8,
    query_len: usize,
    targets_blob_ptr: *const u8,
    offsets_ptr: *const u32,
    lengths_ptr: *const u32,
    count: usize,
    k: usize,
    out_indices_ptr: *mut u32,
    out_scores_ptr: *mut i32,
) -> usize {
    if query_ptr.is_null()
        || targets_blob_ptr.is_null()
        || offsets_ptr.is_null()
        || lengths_ptr.is_null()
        || out_indices_ptr.is_null()
        || out_scores_ptr.is_null()
        || count == 0
        || k == 0
    {
        return 0;
    }
    unsafe {
        let query_bytes = slice::from_raw_parts(query_ptr, query_len);
        let query = match std::str::from_utf8(query_bytes) {
            Ok(s) => s,
            Err(_) => return 0,
        };

        let offsets = slice::from_raw_parts(offsets_ptr, count);
        let lengths = slice::from_raw_parts(lengths_ptr, count);
        let out_indices = slice::from_raw_parts_mut(out_indices_ptr, k);
        let out_scores = slice::from_raw_parts_mut(out_scores_ptr, k);

        let mut targets_vec = Vec::with_capacity(count);
        for i in 0..count {
            let start = offsets[i] as usize;
            let len = lengths[i] as usize;
            let bytes = slice::from_raw_parts(targets_blob_ptr.add(start), len);
            let s = std::str::from_utf8(bytes).unwrap_or("");
            targets_vec.push(s);
        }

        fuzzy::fuzzy_search_topk(query, &targets_vec, k, out_indices, out_scores)
    }
}

/// Quantizes Float32 vectors to Int8 (SQ8) representation.
#[no_mangle]
pub extern "C" fn tabman_quantize_sq8(
    vectors_ptr: *const f32,
    n: usize,
    dim: usize,
    out_quant_ptr: *mut i8,
    out_scales_ptr: *mut f32,
) {
    if vectors_ptr.is_null()
        || out_quant_ptr.is_null()
        || out_scales_ptr.is_null()
        || n == 0
        || dim == 0
    {
        return;
    }
    unsafe {
        let vectors = slice::from_raw_parts(vectors_ptr, n * dim);
        let out_quant = slice::from_raw_parts_mut(out_quant_ptr, n * dim);
        let out_scales = slice::from_raw_parts_mut(out_scales_ptr, n);
        quant::quantize_sq8(vectors, n, dim, out_quant, out_scales);
    }
}

/// Dequantizes Int8 vectors back to Float32.
#[no_mangle]
pub extern "C" fn tabman_dequantize_sq8(
    quant_ptr: *const i8,
    scales_ptr: *const f32,
    n: usize,
    dim: usize,
    out_vectors_ptr: *mut f32,
) {
    if quant_ptr.is_null()
        || scales_ptr.is_null()
        || out_vectors_ptr.is_null()
        || n == 0
        || dim == 0
    {
        return;
    }
    unsafe {
        let quant_slice = slice::from_raw_parts(quant_ptr, n * dim);
        let scales_slice = slice::from_raw_parts(scales_ptr, n);
        let out_vectors = slice::from_raw_parts_mut(out_vectors_ptr, n * dim);
        quant::dequantize_sq8(quant_slice, scales_slice, n, dim, out_vectors);
    }
}

/// Top-K search directly over an Int8 quantized embedding database using SIMD.
#[no_mangle]
pub extern "C" fn tabman_topk_search_sq8(
    query_quant_ptr: *const i8,
    query_scale: f32,
    db_quant_ptr: *const i8,
    db_scales_ptr: *const f32,
    m: usize,
    dim: usize,
    k: usize,
    out_indices_ptr: *mut u32,
    out_scores_ptr: *mut f32,
) -> usize {
    if query_quant_ptr.is_null()
        || db_quant_ptr.is_null()
        || db_scales_ptr.is_null()
        || out_indices_ptr.is_null()
        || out_scores_ptr.is_null()
        || m == 0
        || k == 0
        || dim == 0
    {
        return 0;
    }
    unsafe {
        let query = slice::from_raw_parts(query_quant_ptr, dim);
        let db = slice::from_raw_parts(db_quant_ptr, m * dim);
        let scales = slice::from_raw_parts(db_scales_ptr, m);
        let out_indices = slice::from_raw_parts_mut(out_indices_ptr, k);
        let out_scores = slice::from_raw_parts_mut(out_scores_ptr, k);
        quant::topk_search_sq8(
            query,
            query_scale,
            db,
            scales,
            m,
            dim,
            k,
            out_indices,
            out_scores,
        )
    }
}
