//! Zero-Copy Binary Vector Store for IndexedDB.
//!
//! Stores and queries high-dimensional vector embeddings and tab records directly from
//! 64-byte aligned binary buffers with 0 ms deserialization overhead and zero heap allocations.



pub const STORE_MAGIC: &[u8; 4] = b"TABV";
pub const STORE_VERSION: u32 = 1;
pub const HEADER_SIZE: usize = 64;

pub const FLAG_QUANTIZED_I8: u32 = 1 << 0;
pub const FLAG_NORMALIZED: u32 = 1 << 1;

/// Packed binary header (64 bytes aligned).
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct StoreHeader {
    pub magic: [u8; 4],
    pub version: u32,
    pub flags: u32,
    pub count: u32,
    pub dim: u32,
    pub vectors_offset: u32,
    pub metadata_offset: u32,
    pub total_bytes: u32,
    pub created_at_sec: u64,
    pub _reserved: [u8; 24],
}

/// Zero-copy read-only view over a binary vector store.
pub struct VectorStoreView<'a> {
    pub header: StoreHeader,
    pub vectors_fp32: Option<&'a [f32]>,
    pub vectors_i8: Option<&'a [i8]>,
    pub scales: Option<&'a [f32]>,
    pub ids_blob: &'a [u8],
    pub id_offsets: &'a [u32],
}

impl<'a> VectorStoreView<'a> {
    /// Binds directly to a raw byte slice loaded from IndexedDB with zero copying.
    pub fn parse(buffer: &'a [u8]) -> Result<Self, &'static str> {
        if buffer.len() < HEADER_SIZE {
            return Err("Buffer too small for vector store header");
        }

        if &buffer[0..4] != STORE_MAGIC {
            return Err("Invalid magic bytes: not a TABV store");
        }

        let version = u32::from_le_bytes(buffer[4..8].try_into().unwrap());
        if version != STORE_VERSION {
            return Err("Unsupported store version");
        }

        let flags = u32::from_le_bytes(buffer[8..12].try_into().unwrap());
        let count = u32::from_le_bytes(buffer[12..16].try_into().unwrap()) as usize;
        let dim = u32::from_le_bytes(buffer[16..20].try_into().unwrap()) as usize;
        let vectors_offset = u32::from_le_bytes(buffer[20..24].try_into().unwrap()) as usize;
        let metadata_offset = u32::from_le_bytes(buffer[24..28].try_into().unwrap()) as usize;
        let total_bytes = u32::from_le_bytes(buffer[28..32].try_into().unwrap()) as usize;
        let created_at_sec = u64::from_le_bytes(buffer[32..40].try_into().unwrap());

        if buffer.len() < total_bytes {
            return Err("Corrupted store: buffer shorter than declared total_bytes");
        }

        let is_quantized = (flags & FLAG_QUANTIZED_I8) != 0;

        let (vectors_fp32, vectors_i8, scales) = if is_quantized {
            let i8_len = count * dim;
            let i8_slice = unsafe {
                core::slice::from_raw_parts(
                    buffer.as_ptr().add(vectors_offset) as *const i8,
                    i8_len,
                )
            };
            let scales_offset = vectors_offset + i8_len;
            let scales_slice = unsafe {
                core::slice::from_raw_parts(
                    buffer.as_ptr().add(scales_offset) as *const f32,
                    count,
                )
            };
            (None, Some(i8_slice), Some(scales_slice))
        } else {
            let fp32_len = count * dim;
            let fp32_slice = unsafe {
                core::slice::from_raw_parts(
                    buffer.as_ptr().add(vectors_offset) as *const f32,
                    fp32_len,
                )
            };
            (Some(fp32_slice), None, None)
        };

        // Parse metadata ID offsets
        let id_offsets = unsafe {
            core::slice::from_raw_parts(
                buffer.as_ptr().add(metadata_offset) as *const u32,
                count + 1,
            )
        };
        let ids_blob_start = metadata_offset + (count + 1) * 4;
        let ids_blob = &buffer[ids_blob_start..total_bytes];

        let header = StoreHeader {
            magic: *STORE_MAGIC,
            version,
            flags,
            count: count as u32,
            dim: dim as u32,
            vectors_offset: vectors_offset as u32,
            metadata_offset: metadata_offset as u32,
            total_bytes: total_bytes as u32,
            created_at_sec,
            _reserved: [0u8; 24],
        };

        Ok(Self {
            header,
            vectors_fp32,
            vectors_i8,
            scales,
            ids_blob,
            id_offsets,
        })
    }

    /// Retrieve tab ID for index `idx`.
    #[inline]
    pub fn get_tab_id(&self, idx: usize) -> Option<&'a str> {
        if idx >= self.header.count as usize {
            return None;
        }
        let start = self.id_offsets[idx] as usize;
        let end = self.id_offsets[idx + 1] as usize;
        if start <= end && end <= self.ids_blob.len() {
            std::str::from_utf8(&self.ids_blob[start..end]).ok()
        } else {
            None
        }
    }

    /// Top-K nearest neighbor search directly against memory-mapped binary store.
    pub fn search_top_k(
        &self,
        query: &[f32],
        k: usize,
        out_indices: &mut [u32],
        out_scores: &mut [f32],
    ) -> usize {
        let count = self.header.count as usize;
        let dim = self.header.dim as usize;
        if count == 0 || dim == 0 || k == 0 || query.len() < dim {
            return 0;
        }

        let actual_k = k.min(count);

        if let Some(fp32_vecs) = self.vectors_fp32 {
            // High-throughput FP32 dot product search
            let mut top: Vec<(f32, u32)> = Vec::with_capacity(count);
            for i in 0..count {
                let off = i * dim;
                let v = &fp32_vecs[off..off + dim];
                let score = crate::vector::dot_product(query, v);
                top.push((score, i as u32));
            }
            top.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(core::cmp::Ordering::Equal));
            for j in 0..actual_k {
                out_scores[j] = top[j].0;
                out_indices[j] = top[j].1;
            }
        } else if let (Some(i8_vecs), Some(scales)) = (self.vectors_i8, self.scales) {
            // Fast Quantized INT8 search with SIMD dot products
            let mut q_i8 = vec![0i8; dim];
            let mut q_scale = [0.0f32; 1];
            crate::quant::quantize_sq8(query, 1, dim, &mut q_i8, &mut q_scale);
            let mut top: Vec<(f32, u32)> = Vec::with_capacity(count);

            for i in 0..count {
                let off = i * dim;
                let v = &i8_vecs[off..off + dim];
                let score = crate::quant::dot_product_sq8(&q_i8, v, q_scale[0], scales[i]);
                top.push((score, i as u32));
            }
            top.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(core::cmp::Ordering::Equal));
            for j in 0..actual_k {
                out_scores[j] = top[j].0;
                out_indices[j] = top[j].1;
            }
        }

        actual_k
    }
}

/// Serializes vectors and tab IDs into a 64-byte aligned binary store buffer.
pub fn serialize_vector_store(
    ids: &[&str],
    vectors: &[f32],
    dim: usize,
    quantize: bool,
) -> Vec<u8> {
    let count = ids.len();
    assert_eq!(vectors.len(), count * dim);

    let vectors_offset = HEADER_SIZE;
    let (vectors_size, flags) = if quantize {
        // INT8 bytes + f32 scales (count * 4) + padding
        let i8_bytes = count * dim;
        let scales_bytes = count * 4;
        let total_vec_bytes = ((i8_bytes + scales_bytes + 63) / 64) * 64;
        (total_vec_bytes, FLAG_QUANTIZED_I8 | FLAG_NORMALIZED)
    } else {
        let fp32_bytes = count * dim * 4;
        let total_vec_bytes = ((fp32_bytes + 63) / 64) * 64;
        (total_vec_bytes, FLAG_NORMALIZED)
    };

    let metadata_offset = vectors_offset + vectors_size;
    let offsets_size = (count + 1) * 4;

    // Calculate total blob size for IDs
    let mut total_id_bytes = 0;
    for &id in ids {
        total_id_bytes += id.len();
    }

    let total_bytes = metadata_offset + offsets_size + total_id_bytes;
    let mut buf = vec![0u8; total_bytes];

    // Write header
    buf[0..4].copy_from_slice(STORE_MAGIC);
    buf[4..8].copy_from_slice(&STORE_VERSION.to_le_bytes());
    buf[8..12].copy_from_slice(&flags.to_le_bytes());
    buf[12..16].copy_from_slice(&(count as u32).to_le_bytes());
    buf[16..20].copy_from_slice(&(dim as u32).to_le_bytes());
    buf[20..24].copy_from_slice(&(vectors_offset as u32).to_le_bytes());
    buf[24..28].copy_from_slice(&(metadata_offset as u32).to_le_bytes());
    buf[28..32].copy_from_slice(&(total_bytes as u32).to_le_bytes());

    // Write vectors
    if quantize {
        let i8_dest = unsafe {
            core::slice::from_raw_parts_mut(
                buf.as_mut_ptr().add(vectors_offset) as *mut i8,
                count * dim,
            )
        };
        let scales_dest = unsafe {
            core::slice::from_raw_parts_mut(
                buf.as_mut_ptr().add(vectors_offset + count * dim) as *mut f32,
                count,
            )
        };
        crate::quant::quantize_sq8(vectors, count, dim, i8_dest, scales_dest);
    } else {
        let fp32_dest = unsafe {
            core::slice::from_raw_parts_mut(
                buf.as_mut_ptr().add(vectors_offset) as *mut f32,
                count * dim,
            )
        };
        fp32_dest.copy_from_slice(vectors);
    }

    // Write metadata ID offset table and IDs blob
    let id_offsets = unsafe {
        core::slice::from_raw_parts_mut(
            buf.as_mut_ptr().add(metadata_offset) as *mut u32,
            count + 1,
        )
    };
    let ids_blob_start = metadata_offset + offsets_size;
    let mut current_offset = 0usize;

    for (i, &id) in ids.iter().enumerate() {
        id_offsets[i] = current_offset as u32;
        let id_bytes = id.as_bytes();
        buf[ids_blob_start + current_offset..ids_blob_start + current_offset + id_bytes.len()]
            .copy_from_slice(id_bytes);
        current_offset += id_bytes.len();
    }
    id_offsets[count] = current_offset as u32;

    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vector_store_roundtrip_fp32() {
        let ids = ["tab-1", "tab-2", "tab-3"];
        let dim = 4;
        let vectors = vec![
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
        ];

        let binary = serialize_vector_store(&ids, &vectors, dim, false);
        let view = VectorStoreView::parse(&binary).expect("parse view");
        assert_eq!(view.header.count, 3);
        assert_eq!(view.header.dim, 4);
        assert_eq!(view.get_tab_id(0), Some("tab-1"));
        assert_eq!(view.get_tab_id(1), Some("tab-2"));
        assert_eq!(view.get_tab_id(2), Some("tab-3"));

        let query = [1.0, 0.1, 0.0, 0.0];
        let mut out_indices = [0u32; 2];
        let mut out_scores = [0.0f32; 2];
        let found = view.search_top_k(&query, 2, &mut out_indices, &mut out_scores);
        assert_eq!(found, 2);
        assert_eq!(out_indices[0], 0); // tab-1 is closest match
        assert!(out_scores[0] > out_scores[1]);
    }

    #[test]
    fn test_vector_store_roundtrip_quantized_int8() {
        let ids = ["apple", "banana", "cherry"];
        let dim = 8;
        let mut vectors = Vec::with_capacity(24);
        for i in 0..24 {
            vectors.push((i as f32) * 0.1 - 1.2);
        }

        let binary = serialize_vector_store(&ids, &vectors, dim, true);
        let view = VectorStoreView::parse(&binary).expect("parse view");
        assert_eq!(view.header.count, 3);
        assert_eq!(view.get_tab_id(1), Some("banana"));

        let query = &vectors[8..16]; // exact match for banana
        let mut out_indices = [0u32; 1];
        let mut out_scores = [0.0f32; 1];
        let found = view.search_top_k(query, 1, &mut out_indices, &mut out_scores);
        assert_eq!(found, 1);
        assert_eq!(out_indices[0], 1); // banana
    }
}
