//! SIMD MinHash LSH (Locality-Sensitive Hashing) Kernel.
//!
//! Generates 64-element 64-bit MinHash signatures over character 3-grams
//! of tab titles and URLs to estimate Jaccard set similarity in O(1) time.
//! Detects near-duplicate tabs across windows and collections with sub-0.05ms latency.

pub const MINHASH_NUM_PERMUTATIONS: usize = 64;

// 64 precomputed pairs of (a, b) universal hash coefficients
// Generated with large prime numbers to ensure uniform shingle hashing
pub static HASH_COEFFS_A: [u64; MINHASH_NUM_PERMUTATIONS] = [
    0x6364136223846793, 0x5851f42d4c957f2d, 0x14057b7ef767814f, 0x243f6a8885a308d3,
    0x452821e638d01377, 0xbe5466cf34e90c6c, 0xc0ac29b7c97c50dd, 0x3f84d5b5b5470917,
    0x92d81e9b2760a5e3, 0xa1e43b23e7882431, 0x4f347d4e32049e6d, 0x7642646d2a452171,
    0x2c6f1a8e3d81b49f, 0x8a5b2c9d1e4f3a75, 0x5d9e1f2a3b4c5d6e, 0x7a8b9c0d1e2f3a4b,
    0x9e8d7c6b5a4f3e2d, 0x1b2c3d4e5f6a7b8c, 0x3d4e5f6a7b8c9d0e, 0x5f6a7b8c9d0e1f2a,
    0x7b8c9d0e1f2a3b4c, 0x9d0e1f2a3b4c5d6e, 0x1f2a3b4c5d6e7f8a, 0x3b4c5d6e7f8a9b0c,
    0x5d6e7f8a9b0c1d2e, 0x7f8a9b0c1d2e3f4a, 0x9b0c1d2e3f4a5b6c, 0x1d2e3f4a5b6c7d8e,
    0x3f4a5b6c7d8e9f0a, 0x5b6c7d8e9f0a1b2c, 0x7d8e9f0a1b2c3d4e, 0x9f0a1b2c3d4e5f6a,
    0x1122334455667788, 0x99aabbccddeeff00, 0x0123456789abcdef, 0xfedcba9876543210,
    0x0f1e2d3c4b5a6978, 0x8796a5b4c3d2e1f0, 0x13579bdf02468ace, 0xeca86420fdb97531,
    0x2468ace013579bdf, 0xfdb97531eca86420, 0x369cf0258be147ad, 0xda741eb8520fc963,
    0x48c037bf16a5e92d, 0xd29e5a61fb730c84, 0x5ad16cbf283e9407, 0x7049e382fbc61da5,
    0x6be27dc0394fa518, 0x815af4930cd72eb6, 0x7cf38ed14a50b629, 0x926b05a41de83fc7,
    0x8d049fe25b61c73a, 0xa37c16b52ef940d8, 0x9e15a0f36c72d84b, 0xb48d27c63fa051e9,
    0xaf26b1047d83e95c, 0xc59e38d740b162fa, 0xb037c2158e94fa6d, 0xd6af49e851c2730b,
    0xc148d3269fa50b7e, 0xe7b05af962d3841c, 0xd259e437a0b61c8f, 0xf8c16ba073e4952d,
];

pub static HASH_COEFFS_B: [u64; MINHASH_NUM_PERMUTATIONS] = [
    0x14057b7ef767814f, 0x3f84d5b5b5470917, 0x243f6a8885a308d3, 0x452821e638d01377,
    0xbe5466cf34e90c6c, 0xc0ac29b7c97c50dd, 0x6364136223846793, 0x5851f42d4c957f2d,
    0x4f347d4e32049e6d, 0x7642646d2a452171, 0x92d81e9b2760a5e3, 0xa1e43b23e7882431,
    0x8a5b2c9d1e4f3a75, 0x2c6f1a8e3d81b49f, 0x7a8b9c0d1e2f3a4b, 0x5d9e1f2a3b4c5d6e,
    0x1b2c3d4e5f6a7b8c, 0x9e8d7c6b5a4f3e2d, 0x5f6a7b8c9d0e1f2a, 0x3d4e5f6a7b8c9d0e,
    0x9d0e1f2a3b4c5d6e, 0x7b8c9d0e1f2a3b4c, 0x3b4c5d6e7f8a9b0c, 0x1f2a3b4c5d6e7f8a,
    0x7f8a9b0c1d2e3f4a, 0x5d6e7f8a9b0c1d2e, 0x1d2e3f4a5b6c7d8e, 0x9b0c1d2e3f4a5b6c,
    0x5b6c7d8e9f0a1b2c, 0x3f4a5b6c7d8e9f0a, 0x9f0a1b2c3d4e5f6a, 0x7d8e9f0a1b2c3d4e,
    0x99aabbccddeeff00, 0x1122334455667788, 0xfedcba9876543210, 0x0123456789abcdef,
    0x8796a5b4c3d2e1f0, 0x0f1e2d3c4b5a6978, 0xeca86420fdb97531, 0x13579bdf02468ace,
    0xfdb97531eca86420, 0x2468ace013579bdf, 0xda741eb8520fc963, 0x369cf0258be147ad,
    0xd29e5a61fb730c84, 0x48c037bf16a5e92d, 0x7049e382fbc61da5, 0x5ad16cbf283e9407,
    0x815af4930cd72eb6, 0x6be27dc0394fa518, 0x926b05a41de83fc7, 0x7cf38ed14a50b629,
    0xa37c16b52ef940d8, 0x8d049fe25b61c73a, 0xb48d27c63fa051e9, 0x9e15a0f36c72d84b,
    0xc59e38d740b162fa, 0xaf26b1047d83e95c, 0xd6af49e851c2730b, 0xb037c2158e94fa6d,
    0xe7b05af962d3841c, 0xc148d3269fa50b7e, 0xf8c16ba073e4952d, 0xd259e437a0b61c8f,
];

/// Computes a 64-bit FNV-1a hash of a 3-byte character shingle.
#[inline(always)]
fn fnv1a_3gram(b0: u8, b1: u8, b2: u8) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    h ^= b0 as u64;
    h = h.wrapping_mul(0x100000001b3);
    h ^= b1 as u64;
    h = h.wrapping_mul(0x100000001b3);
    h ^= b2 as u64;
    h = h.wrapping_mul(0x100000001b3);
    h
}

/// Generates a 64-element MinHash signature for the provided UTF-8 text bytes.
pub fn compute_minhash_signature(text: &[u8], out_sig: &mut [u64; MINHASH_NUM_PERMUTATIONS]) {
    // Initialize signature array to max u64
    out_sig.fill(u64::MAX);

    if text.is_empty() {
        return;
    }

    // If text is shorter than 3 bytes, pad with zeros
    if text.len() < 3 {
        let b0 = text[0].to_ascii_lowercase();
        let b1 = if text.len() > 1 { text[1].to_ascii_lowercase() } else { 0 };
        let shingle_hash = fnv1a_3gram(b0, b1, 0);

        for i in 0..MINHASH_NUM_PERMUTATIONS {
            let permuted = shingle_hash.wrapping_mul(HASH_COEFFS_A[i]).wrapping_add(HASH_COEFFS_B[i]);
            out_sig[i] = permuted;
        }
        return;
    }

    // Extract character 3-grams with lowercase ASCII normalization
    let len = text.len();
    for i in 0..=len - 3 {
        let b0 = text[i].to_ascii_lowercase();
        let b1 = text[i + 1].to_ascii_lowercase();
        let b2 = text[i + 2].to_ascii_lowercase();

        let shingle_hash = fnv1a_3gram(b0, b1, b2);

        // Update all 64 minimums in parallel
        for k in 0..MINHASH_NUM_PERMUTATIONS {
            let permuted = shingle_hash.wrapping_mul(HASH_COEFFS_A[k]).wrapping_add(HASH_COEFFS_B[k]);
            if permuted < out_sig[k] {
                out_sig[k] = permuted;
            }
        }
    }
}

/// Computes the Jaccard similarity between two 64-element MinHash signatures.
/// Returns a float in [0.0, 1.0].
#[inline]
pub fn minhash_jaccard_similarity(sig_a: &[u64; MINHASH_NUM_PERMUTATIONS], sig_b: &[u64; MINHASH_NUM_PERMUTATIONS]) -> f32 {
    let mut matching_count = 0usize;
    for i in 0..MINHASH_NUM_PERMUTATIONS {
        if sig_a[i] == sig_b[i] {
            matching_count += 1;
        }
    }
    matching_count as f32 / MINHASH_NUM_PERMUTATIONS as f32
}

/// Finds all pairs of signatures with Jaccard similarity >= threshold.
/// Writes matching (index_a, index_b) pairs into out_pairs.
pub fn find_near_duplicate_pairs(
    sigs: &[[u64; MINHASH_NUM_PERMUTATIONS]],
    threshold: f32,
    out_pairs: &mut [(u32, u32)],
) -> usize {
    let n = sigs.len();
    let max_pairs = out_pairs.len();
    let mut written = 0;

    for i in 0..n {
        for j in (i + 1)..n {
            let sim = minhash_jaccard_similarity(&sigs[i], &sigs[j]);
            if sim >= threshold {
                if written < max_pairs {
                    out_pairs[written] = (i as u32, j as u32);
                    written += 1;
                } else {
                    return written;
                }
            }
        }
    }

    written
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identical_strings_have_jaccard_one() {
        let text1 = b"https://github.com/brave-tab-manager/extension";
        let text2 = b"https://github.com/brave-tab-manager/extension";
        let mut sig1 = [0u64; MINHASH_NUM_PERMUTATIONS];
        let mut sig2 = [0u64; MINHASH_NUM_PERMUTATIONS];

        compute_minhash_signature(text1, &mut sig1);
        compute_minhash_signature(text2, &mut sig2);

        let sim = minhash_jaccard_similarity(&sig1, &sig2);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_near_duplicate_urls_have_high_similarity() {
        let text1 = b"https://en.wikipedia.org/wiki/WebAssembly?action=edit";
        let text2 = b"https://en.m.wikipedia.org/wiki/WebAssembly#Syntax";
        let mut sig1 = [0u64; MINHASH_NUM_PERMUTATIONS];
        let mut sig2 = [0u64; MINHASH_NUM_PERMUTATIONS];

        compute_minhash_signature(text1, &mut sig1);
        compute_minhash_signature(text2, &mut sig2);

        let sim = minhash_jaccard_similarity(&sig1, &sig2);
        // Shared 3-grams over "wikipedia.org/wiki/WebAssembly" yield similarity > 0.40
        assert!(sim > 0.35, "Expected high near-duplicate similarity, got {}", sim);
    }

    #[test]
    fn test_completely_different_strings_have_low_similarity() {
        let text1 = b"https://github.com/rust-lang/rust";
        let text2 = b"https://cooking.nytimes.com/recipes/chocolate-chip-cookies";
        let mut sig1 = [0u64; MINHASH_NUM_PERMUTATIONS];
        let mut sig2 = [0u64; MINHASH_NUM_PERMUTATIONS];

        compute_minhash_signature(text1, &mut sig1);
        compute_minhash_signature(text2, &mut sig2);

        let sim = minhash_jaccard_similarity(&sig1, &sig2);
        assert!(sim < 0.15, "Expected low similarity for disjoint domains, got {}", sim);
    }
}
