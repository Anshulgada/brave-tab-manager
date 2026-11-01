//! Tabman Rust WASM SIMD Acceleration Engine.
//!
//! Exposes zero-copy, C-ABI WebAssembly functions for browser extension
//! and CLI workflows, executing vector math, clustering, and tokenization
//! at native silicon speeds.

pub mod clustering;
pub mod index;
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
