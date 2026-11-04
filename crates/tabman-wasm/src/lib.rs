//! Tabman Rust WASM SIMD Acceleration Engine.
//!
//! Exposes zero-copy, C-ABI WebAssembly functions for browser extension
//! and CLI workflows, executing vector math, clustering, and tokenization
//! at native silicon speeds.

pub mod clustering;
pub mod compress;
pub mod fuzzy;
pub mod hnsw;
pub mod html;
pub mod index;
pub mod minhash;
pub mod quant;
pub mod store;
pub mod tokenizer;
pub mod url;
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

/// Canonicalize a single URL, stripping tracking parameters (UTM, fbclid, etc.).
/// Returns bytes written to `out_ptr`.
#[no_mangle]
pub extern "C" fn tabman_canonicalize_url(
    url_ptr: *const u8,
    url_len: usize,
    strip_fragment: bool,
    out_ptr: *mut u8,
    out_max_len: usize,
) -> usize {
    if url_ptr.is_null() || out_ptr.is_null() || url_len == 0 || out_max_len == 0 {
        return 0;
    }
    unsafe {
        let raw_bytes = slice::from_raw_parts(url_ptr, url_len);
        let raw_str = match std::str::from_utf8(raw_bytes) {
            Ok(s) => s,
            Err(_) => return 0,
        };
        let canon = url::canonicalize_url(raw_str, strip_fragment);
        let bytes = canon.as_bytes();
        let write_len = bytes.len().min(out_max_len);
        let out_slice = slice::from_raw_parts_mut(out_ptr, write_len);
        out_slice.copy_from_slice(&bytes[..write_len]);
        write_len
    }
}

/// Canonicalize and deduplicate a batch of URLs.
/// Returns number of unique URLs found.
#[no_mangle]
pub extern "C" fn tabman_deduplicate_urls(
    blob_ptr: *const u8,
    offsets_ptr: *const u32,
    lengths_ptr: *const u32,
    count: usize,
    strip_fragment: bool,
    out_unique_indices_ptr: *mut u32,
    out_dup_map_ptr: *mut u32,
) -> usize {
    if blob_ptr.is_null()
        || offsets_ptr.is_null()
        || lengths_ptr.is_null()
        || out_unique_indices_ptr.is_null()
        || out_dup_map_ptr.is_null()
        || count == 0
    {
        return 0;
    }
    unsafe {
        let blob = slice::from_raw_parts(blob_ptr, 1024 * 1024 * 16); // Safe upper bound for offset indexing
        let offsets = slice::from_raw_parts(offsets_ptr, count);
        let lengths = slice::from_raw_parts(lengths_ptr, count);

        let mut url_strs = Vec::with_capacity(count);
        for i in 0..count {
            let start = offsets[i] as usize;
            let len = lengths[i] as usize;
            let s = match std::str::from_utf8(&blob[start..start + len]) {
                Ok(s) => s,
                Err(_) => "",
            };
            url_strs.push(s);
        }

        let (_canon, unique, map) = url::deduplicate_url_batch(&url_strs, strip_fragment);

        let out_unique = slice::from_raw_parts_mut(out_unique_indices_ptr, unique.len());
        for (idx, &u) in unique.iter().enumerate() {
            out_unique[idx] = u as u32;
        }

        let out_map = slice::from_raw_parts_mut(out_dup_map_ptr, count);
        for (i, &m) in map.iter().enumerate() {
            out_map[i] = m as u32;
        }

        unique.len()
    }
}

/// Create a zero-copy binary vector store (TABV format) in linear memory.
/// Returns pointer to heap allocated binary buffer; writes buffer length to `out_size_ptr`.
#[no_mangle]
pub extern "C" fn tabman_vector_store_create(
    ids_blob_ptr: *const u8,
    id_offsets_ptr: *const u32,
    id_lengths_ptr: *const u32,
    vectors_ptr: *const f32,
    count: usize,
    dim: usize,
    quantize: bool,
    out_size_ptr: *mut usize,
) -> *mut u8 {
    if ids_blob_ptr.is_null()
        || id_offsets_ptr.is_null()
        || id_lengths_ptr.is_null()
        || vectors_ptr.is_null()
        || out_size_ptr.is_null()
        || count == 0
        || dim == 0
    {
        return core::ptr::null_mut();
    }
    unsafe {
        let blob = slice::from_raw_parts(ids_blob_ptr, 1024 * 1024 * 16);
        let offsets = slice::from_raw_parts(id_offsets_ptr, count);
        let lengths = slice::from_raw_parts(id_lengths_ptr, count);
        let vectors = slice::from_raw_parts(vectors_ptr, count * dim);

        let mut ids = Vec::with_capacity(count);
        for i in 0..count {
            let start = offsets[i] as usize;
            let len = lengths[i] as usize;
            let id = match std::str::from_utf8(&blob[start..start + len]) {
                Ok(s) => s,
                Err(_) => "",
            };
            ids.push(id);
        }

        let serialized = store::serialize_vector_store(&ids, vectors, dim, quantize);
        let size = serialized.len();
        *out_size_ptr = size;

        let ptr = tabman_alloc(size);
        if !ptr.is_null() {
            let out_slice = slice::from_raw_parts_mut(ptr, size);
            out_slice.copy_from_slice(&serialized);
        }
        ptr
    }
}

/// Search a zero-copy binary vector store (TABV format) directly in linear memory.
#[no_mangle]
pub extern "C" fn tabman_vector_store_search(
    store_buf_ptr: *const u8,
    store_len: usize,
    query_ptr: *const f32,
    k: usize,
    out_indices_ptr: *mut u32,
    out_scores_ptr: *mut f32,
) -> usize {
    if store_buf_ptr.is_null()
        || query_ptr.is_null()
        || out_indices_ptr.is_null()
        || out_scores_ptr.is_null()
        || store_len == 0
        || k == 0
    {
        return 0;
    }
    unsafe {
        let buffer = slice::from_raw_parts(store_buf_ptr, store_len);
        let view = match store::VectorStoreView::parse(buffer) {
            Ok(v) => v,
            Err(_) => return 0,
        };

        let dim = view.header.dim as usize;
        let query = slice::from_raw_parts(query_ptr, dim);
        let out_indices = slice::from_raw_parts_mut(out_indices_ptr, k);
        let out_scores = slice::from_raw_parts_mut(out_scores_ptr, k);

        view.search_top_k(query, k, out_indices, out_scores)
    }
}

/// Retrieve tab ID string at index `idx` from a binary vector store.
#[no_mangle]
pub extern "C" fn tabman_vector_store_get_id(
    store_buf_ptr: *const u8,
    store_len: usize,
    idx: usize,
    out_ptr: *mut u8,
    out_max_len: usize,
) -> usize {
    if store_buf_ptr.is_null() || out_ptr.is_null() || store_len == 0 || out_max_len == 0 {
        return 0;
    }
    unsafe {
        let buffer = slice::from_raw_parts(store_buf_ptr, store_len);
        let view = match store::VectorStoreView::parse(buffer) {
            Ok(v) => v,
            Err(_) => return 0,
        };
        let id_str = match view.get_tab_id(idx) {
            Some(s) => s,
            None => return 0,
        };
        let bytes = id_str.as_bytes();
        let write_len = bytes.len().min(out_max_len);
        let out_slice = slice::from_raw_parts_mut(out_ptr, write_len);
        out_slice.copy_from_slice(&bytes[..write_len]);
        write_len
    }
}

/// Extract clean title, meta description, and plain body text from raw HTML.
/// Writes string lengths into `out_lens_ptr` ([title_len, desc_len, body_len]).
#[no_mangle]
pub extern "C" fn tabman_html_extract(
    html_ptr: *const u8,
    html_len: usize,
    max_title: usize,
    max_desc: usize,
    max_body: usize,
    out_title_ptr: *mut u8,
    out_desc_ptr: *mut u8,
    out_body_ptr: *mut u8,
    out_lens_ptr: *mut u32,
) -> usize {
    if html_ptr.is_null()
        || out_title_ptr.is_null()
        || out_desc_ptr.is_null()
        || out_body_ptr.is_null()
        || out_lens_ptr.is_null()
        || html_len == 0
    {
        return 0;
    }
    unsafe {
        let raw_bytes = slice::from_raw_parts(html_ptr, html_len);
        let html_str = match std::str::from_utf8(raw_bytes) {
            Ok(s) => s,
            Err(_) => return 0,
        };

        let content = html::extract_html_content(html_str, max_title, max_desc, max_body);

        let title_bytes = content.title.as_bytes();
        let t_len = title_bytes.len().min(max_title);
        slice::from_raw_parts_mut(out_title_ptr, t_len).copy_from_slice(&title_bytes[..t_len]);

        let desc_bytes = content.description.as_bytes();
        let d_len = desc_bytes.len().min(max_desc);
        slice::from_raw_parts_mut(out_desc_ptr, d_len).copy_from_slice(&desc_bytes[..d_len]);

        let body_bytes = content.body.as_bytes();
        let b_len = body_bytes.len().min(max_body);
        slice::from_raw_parts_mut(out_body_ptr, b_len).copy_from_slice(&body_bytes[..b_len]);

        let lens = slice::from_raw_parts_mut(out_lens_ptr, 3);
        lens[0] = t_len as u32;
        lens[1] = d_len as u32;
        lens[2] = b_len as u32;

        b_len
    }
}

/// Generate a 64-element 64-bit MinHash signature for text.
#[no_mangle]
pub extern "C" fn tabman_minhash_64(
    text_ptr: *const u8,
    text_len: usize,
    out_sig_ptr: *mut u64,
) {
    if text_ptr.is_null() || out_sig_ptr.is_null() {
        return;
    }
    unsafe {
        let text = slice::from_raw_parts(text_ptr, text_len);
        let out_sig = slice::from_raw_parts_mut(out_sig_ptr, minhash::MINHASH_NUM_PERMUTATIONS);
        let mut sig_arr = [0u64; minhash::MINHASH_NUM_PERMUTATIONS];
        minhash::compute_minhash_signature(text, &mut sig_arr);
        out_sig.copy_from_slice(&sig_arr);
    }
}

/// Compute Jaccard similarity between two 64-element MinHash signatures.
#[no_mangle]
pub extern "C" fn tabman_minhash_jaccard(
    sig_a_ptr: *const u64,
    sig_b_ptr: *const u64,
) -> f32 {
    if sig_a_ptr.is_null() || sig_b_ptr.is_null() {
        return 0.0;
    }
    unsafe {
        let sig_a = slice::from_raw_parts(sig_a_ptr, minhash::MINHASH_NUM_PERMUTATIONS);
        let sig_b = slice::from_raw_parts(sig_b_ptr, minhash::MINHASH_NUM_PERMUTATIONS);
        let mut arr_a = [0u64; minhash::MINHASH_NUM_PERMUTATIONS];
        let mut arr_b = [0u64; minhash::MINHASH_NUM_PERMUTATIONS];
        arr_a.copy_from_slice(sig_a);
        arr_b.copy_from_slice(sig_b);
        minhash::minhash_jaccard_similarity(&arr_a, &arr_b)
    }
}

/// Find pairs of near-duplicate tab signatures with similarity >= threshold.
#[no_mangle]
pub extern "C" fn tabman_batch_near_duplicates(
    sigs_ptr: *const u64,
    n: usize,
    threshold: f32,
    out_pairs_ptr: *mut u32,
    max_pairs: usize,
) -> usize {
    if sigs_ptr.is_null() || out_pairs_ptr.is_null() || n < 2 || max_pairs == 0 {
        return 0;
    }
    unsafe {
        let total_u64 = n * minhash::MINHASH_NUM_PERMUTATIONS;
        let raw_sigs = slice::from_raw_parts(sigs_ptr, total_u64);
        let mut sig_vec: Vec<[u64; minhash::MINHASH_NUM_PERMUTATIONS]> = Vec::with_capacity(n);
        for chunk in raw_sigs.chunks_exact(minhash::MINHASH_NUM_PERMUTATIONS) {
            let mut arr = [0u64; minhash::MINHASH_NUM_PERMUTATIONS];
            arr.copy_from_slice(chunk);
            sig_vec.push(arr);
        }

        let mut out_tuples: Vec<(u32, u32)> = vec![(0, 0); max_pairs];
        let written = minhash::find_near_duplicate_pairs(&sig_vec, threshold, &mut out_tuples);

        let out_flat = slice::from_raw_parts_mut(out_pairs_ptr, written * 2);
        for i in 0..written {
            out_flat[i * 2] = out_tuples[i].0;
            out_flat[i * 2 + 1] = out_tuples[i].1;
        }

        written
    }
}

/// Create a new in-memory HNSW index.
#[no_mangle]
pub extern "C" fn tabman_hnsw_new(dim: usize, m: usize, ef_construction: usize) -> *mut hnsw::HnswIndex {
    let index = Box::new(hnsw::HnswIndex::new(dim, m, ef_construction));
    Box::into_raw(index)
}

/// Insert a vector into the HNSW index.
#[no_mangle]
pub extern "C" fn tabman_hnsw_insert(index_ptr: *mut hnsw::HnswIndex, id: u32, vector_ptr: *const f32) {
    if index_ptr.is_null() || vector_ptr.is_null() {
        return;
    }
    unsafe {
        let index = &mut *index_ptr;
        let vec = slice::from_raw_parts(vector_ptr, index.dim);
        index.insert(id, vec);
    }
}

/// Search top-K nearest neighbors using the HNSW index.
#[no_mangle]
pub extern "C" fn tabman_hnsw_search(
    index_ptr: *const hnsw::HnswIndex,
    query_ptr: *const f32,
    k: usize,
    ef_search: usize,
    out_ids_ptr: *mut u32,
    out_scores_ptr: *mut f32,
) -> usize {
    if index_ptr.is_null() || query_ptr.is_null() || out_ids_ptr.is_null() || out_scores_ptr.is_null() || k == 0 {
        return 0;
    }
    unsafe {
        let index = &*index_ptr;
        let query = slice::from_raw_parts(query_ptr, index.dim);
        let results = index.search(query, k, ef_search);
        let count = results.len();

        let out_ids = slice::from_raw_parts_mut(out_ids_ptr, count);
        let out_scores = slice::from_raw_parts_mut(out_scores_ptr, count);

        for (i, (id, score)) in results.into_iter().enumerate() {
            out_ids[i] = id;
            out_scores[i] = score;
        }

        count
    }
}

/// Free an allocated HNSW index.
#[no_mangle]
pub extern "C" fn tabman_hnsw_free(index_ptr: *mut hnsw::HnswIndex) {
    if !index_ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(index_ptr);
        }
    }
}

/// Compress raw bytes using fast byte-level LZ.
#[no_mangle]
pub extern "C" fn tabman_compress_lz(
    src_ptr: *const u8,
    src_len: usize,
    out_ptr: *mut u8,
    max_out_len: usize,
) -> usize {
    if src_ptr.is_null() || out_ptr.is_null() || src_len == 0 || max_out_len == 0 {
        return 0;
    }
    unsafe {
        let src = slice::from_raw_parts(src_ptr, src_len);
        let out = slice::from_raw_parts_mut(out_ptr, max_out_len);
        compress::compress_lz(src, out)
    }
}

/// Decompress raw LZ bytes into original byte stream.
#[no_mangle]
pub extern "C" fn tabman_decompress_lz(
    src_ptr: *const u8,
    src_len: usize,
    out_ptr: *mut u8,
    max_out_len: usize,
) -> usize {
    if src_ptr.is_null() || out_ptr.is_null() || src_len == 0 || max_out_len == 0 {
        return 0;
    }
    unsafe {
        let src = slice::from_raw_parts(src_ptr, src_len);
        let out = slice::from_raw_parts_mut(out_ptr, max_out_len);
        compress::decompress_lz(src, out)
    }
}
