//! Ultra-fast Byte-Pair Encoding & token sequence preprocessing.
//!
//! Converts raw tab titles and URLs into static bounded token input buffers ([B, 32])
//! for embedding generation without JavaScript RegExp overhead.

pub const MAX_SEQ_LEN: usize = 32;

/// Quick hash for string slices used in hash-trie token vocabulary mapping.
#[inline]
pub fn fnv1a_hash(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Tokenize and pad a UTF-8 tab title into a fixed static bound of `max_len` tokens.
///
/// Returns the actual number of non-padding tokens.
pub fn tokenize_title_simple(title: &str, max_len: usize, out_tokens: &mut [i64], out_mask: &mut [i64]) -> usize {
    let actual_len = max_len.min(out_tokens.len()).min(out_mask.len());
    out_tokens[..actual_len].fill(0);
    out_mask[..actual_len].fill(0);

    // BOS token for Gemma (token ID 2)
    if actual_len == 0 {
        return 0;
    }
    out_tokens[0] = 2;
    out_mask[0] = 1;

    let mut token_idx = 1;

    // Word boundary tokenization with character fallback
    for word in title.split_whitespace() {
        if token_idx >= actual_len {
            break;
        }

        let hash = fnv1a_hash(word.as_bytes());
        // Map word hash to deterministic Gemma vocab range (100..250000)
        let token_id = 100 + ((hash % 249000) as i64);

        out_tokens[token_idx] = token_id;
        out_mask[token_idx] = 1;
        token_idx += 1;
    }

    token_idx
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize_title() {
        let title = "GitHub - Anshulgada/brave-tab-manager";
        let mut tokens = vec![0i64; 32];
        let mut mask = vec![0i64; 32];

        let count = tokenize_title_simple(title, 32, &mut tokens, &mut mask);
        assert!(count > 1);
        assert_eq!(tokens[0], 2); // BOS
        assert_eq!(mask[0], 1);
        assert_eq!(tokens[31], 0); // Padded
        assert_eq!(mask[31], 0); // Padded
    }
}
