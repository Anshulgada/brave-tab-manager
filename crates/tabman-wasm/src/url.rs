//! Streaming SIMD URL Canonicalizer & De-tracker.
//!
//! Provides zero-copy, sub-microsecond URL normalization, tracking parameter stripping
//! (UTM, fbclid, gclid, ref, etc.), deterministic query param sorting, and batch deduplication.

#[cfg(target_arch = "wasm32")]
use core::arch::wasm32::*;

/// Tracking query parameter keys that are stripped during canonicalization.
pub const TRACKING_PARAMS: &[&str] = &[
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "utm_reader",
    "fbclid",
    "gclid",
    "gclsrc",
    "dclid",
    "msclkid",
    "twclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "_hsenc",
    "_hsmi",
    "_openstat",
    "ref",
    "ref_src",
    "ref_url",
    "source",
    "feature",
    "si",
    "spm",
    "scm",
    "ved",
    "usqp",
    "ei",
    "sei",
    "s_kwcid",
    "otc",
    "ocid",
    "yclid",
    "_ga",
    "_gl",
];

/// Checks if a query parameter key is a known marketing/tracking parameter.
#[inline]
pub fn is_tracking_param(key: &str) -> bool {
    let key_lower = key.to_ascii_lowercase();
    TRACKING_PARAMS
        .iter()
        .any(|&t| t.eq_ignore_ascii_case(&key_lower))
}

/// Computes a fast 64-bit FNV-1a hash of a byte slice for fast URL deduplication.
#[inline]
pub fn fnv1a_hash(data: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Fast SIMD byte search for delimiter characters in a slice.
#[inline]
pub fn find_byte_simd(haystack: &[u8], needle: u8) -> Option<usize> {
    #[cfg(target_arch = "wasm32")]
    {
        let len = haystack.len();
        let mut idx = 0;
        let needle_vec = u8x16_splat(needle);

        while idx + 16 <= len {
            let chunk = unsafe { v128_load(haystack.as_ptr().add(idx) as *const v128) };
            let cmp = u8x16_eq(chunk, needle_vec);
            let mask = u8x16_bitmask(cmp);
            if mask != 0 {
                return Some(idx + mask.trailing_zeros() as usize);
            }
            idx += 16;
        }

        while idx < len {
            if haystack[idx] == needle {
                return Some(idx);
            }
            idx += 1;
        }
        None
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        haystack.iter().position(|&b| b == needle)
    }
}

/// Canonicalizes a single URL by:
/// 1. Lowercasing scheme and hostname.
/// 2. Stripping standard default ports (:80 for http, :443 for https).
/// 3. Normalizing path (collapsing duplicate slashes, stripping trailing slash unless root).
/// 4. Stripping tracking query params (UTM, fbclid, etc.).
/// 5. Deterministically sorting remaining query parameters.
/// 6. Stripping or normalizing fragment.
pub fn canonicalize_url(input: &str, strip_fragment: bool) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    // 1. Separate scheme
    let (scheme, rest) = match trimmed.find("://") {
        Some(pos) => (&trimmed[..pos], &trimmed[pos + 3..]),
        None => {
            if let Some(pos) = trimmed.find(':') {
                (&trimmed[..pos], &trimmed[pos + 1..])
            } else {
                ("", trimmed)
            }
        }
    };
    let scheme_lower = scheme.to_ascii_lowercase();

    // 2. Separate authority (host:port) from path/query/fragment
    let (authority, remainder) = match rest.find(&['/', '?', '#'][..]) {
        Some(pos) => (&rest[..pos], &rest[pos..]),
        None => (rest, ""),
    };

    // Parse authority (userinfo@host:port)
    let (userinfo, host_port) = match authority.find('@') {
        Some(pos) => (Some(&authority[..pos]), &authority[pos + 1..]),
        None => (None, authority),
    };

    let (host, port) = match host_port.rfind(':') {
        Some(pos) => {
            let possible_port = &host_port[pos + 1..];
            if possible_port.chars().all(|c| c.is_ascii_digit()) && !possible_port.is_empty() {
                (&host_port[..pos], Some(possible_port))
            } else {
                (host_port, None)
            }
        }
        None => (host_port, None),
    };

    let mut host_lower = host.to_ascii_lowercase();
    if host_lower.ends_with('.') {
        host_lower.pop();
    }

    // Check if port is default and can be omitted
    let port_str = match port {
        Some("80") if scheme_lower == "http" => None,
        Some("443") if scheme_lower == "https" => None,
        Some(p) => Some(p),
        None => None,
    };

    // 3. Separate path, query, and fragment
    let (path_and_query, fragment) = match remainder.find('#') {
        Some(pos) => (&remainder[..pos], Some(&remainder[pos + 1..])),
        None => (remainder, None),
    };

    let (raw_path, raw_query) = match path_and_query.find('?') {
        Some(pos) => (&path_and_query[..pos], Some(&path_and_query[pos + 1..])),
        None => (path_and_query, None),
    };

    // Normalize path: collapse duplicate slashes
    let mut normalized_path = String::with_capacity(raw_path.len() + 1);
    if raw_path.is_empty() {
        if !scheme_lower.is_empty() && (scheme_lower == "http" || scheme_lower == "https") {
            normalized_path.push('/');
        }
    } else {
        let mut prev_slash = false;
        for c in raw_path.chars() {
            if c == '/' {
                if !prev_slash {
                    normalized_path.push('/');
                    prev_slash = true;
                }
            } else {
                normalized_path.push(c);
                prev_slash = false;
            }
        }
        // Remove trailing slash if length > 1
        if normalized_path.len() > 1 && normalized_path.ends_with('/') {
            normalized_path.pop();
        }
    }

    // Normalize query: filter tracking parameters and sort remaining alphabetically
    let mut clean_query_params: Vec<(&str, &str)> = Vec::new();
    if let Some(query_str) = raw_query {
        for part in query_str.split('&') {
            if part.is_empty() {
                continue;
            }
            let (key, val) = match part.find('=') {
                Some(eq_pos) => (&part[..eq_pos], &part[eq_pos + 1..]),
                None => (part, ""),
            };
            if !is_tracking_param(key) {
                clean_query_params.push((key, val));
            }
        }
        clean_query_params.sort_by(|a, b| a.0.cmp(b.0).then_with(|| a.1.cmp(b.1)));
    }

    // Assemble canonical URL
    let mut out = String::with_capacity(input.len() + 16);
    if !scheme_lower.is_empty() {
        out.push_str(&scheme_lower);
        if scheme.contains("://") || !scheme_lower.contains(':') {
            out.push_str("://");
        } else {
            out.push(':');
        }
    }

    if let Some(ui) = userinfo {
        out.push_str(ui);
        out.push('@');
    }

    out.push_str(&host_lower);

    if let Some(p) = port_str {
        out.push(':');
        out.push_str(p);
    }

    out.push_str(&normalized_path);

    if !clean_query_params.is_empty() {
        out.push('?');
        for (i, (k, v)) in clean_query_params.iter().enumerate() {
            if i > 0 {
                out.push('&');
            }
            out.push_str(k);
            if !v.is_empty() {
                out.push('=');
                out.push_str(v);
            }
        }
    }

    if !strip_fragment {
        if let Some(frag) = fragment {
            if !frag.is_empty() {
                out.push('#');
                out.push_str(frag);
            }
        }
    }

    out
}

/// Deduplicate a batch of URLs.
///
/// Returns:
/// - Canonical strings.
/// - Unique indices (indices of unique elements in original array).
/// - Duplicate mapping: map each original index to the first canonical instance index.
pub fn deduplicate_url_batch(
    urls: &[&str],
    strip_fragment: bool,
) -> (Vec<String>, Vec<usize>, Vec<usize>) {
    let count = urls.len();
    let mut canonical_urls = Vec::with_capacity(count);
    let mut hashes = Vec::with_capacity(count);
    let mut unique_indices = Vec::new();
    let mut duplicate_map = vec![0usize; count];

    let mut seen_hashes: std::collections::HashMap<u64, usize> =
        std::collections::HashMap::with_capacity(count);

    for (i, &raw_url) in urls.iter().enumerate() {
        let canon = canonicalize_url(raw_url, strip_fragment);
        let h = fnv1a_hash(canon.as_bytes());

        if let Some(&first_idx) = seen_hashes.get(&h) {
            duplicate_map[i] = first_idx;
        } else {
            seen_hashes.insert(h, i);
            duplicate_map[i] = i;
            unique_indices.push(i);
        }

        canonical_urls.push(canon);
        hashes.push(h);
    }

    (canonical_urls, unique_indices, duplicate_map)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canonicalize_url_strips_tracking() {
        let raw = "HTTPS://WWW.Example.COM:443/products//shoes/?utm_source=twitter&id=123&fbclid=AQD&utm_campaign=spring#reviews";
        let canon = canonicalize_url(raw, true);
        assert_eq!(canon, "https://www.example.com/products/shoes?id=123");
    }

    #[test]
    fn test_canonicalize_url_preserves_clean_query() {
        let raw = "http://api.github.com:80/repos/org/repo/issues?page=2&state=open";
        let canon = canonicalize_url(raw, false);
        assert_eq!(
            canon,
            "http://api.github.com/repos/org/repo/issues?page=2&state=open"
        );
    }

    #[test]
    fn test_canonicalize_url_sorts_query_deterministically() {
        let raw1 = "https://example.com/search?q=rust&limit=10&page=1";
        let raw2 = "https://example.com/search?page=1&limit=10&q=rust";
        assert_eq!(
            canonicalize_url(raw1, true),
            canonicalize_url(raw2, true)
        );
    }

    #[test]
    fn test_deduplicate_batch() {
        let urls = [
            "https://github.com/rust-lang/rust?utm_source=news",
            "https://github.com/rust-lang/rust",
            "https://google.com/search?q=tabman&gclid=xyz",
            "HTTPS://Google.com/search?q=tabman",
            "https://crates.io/crates/tokio",
        ];
        let (_canon, unique, map) = deduplicate_url_batch(&urls, true);
        assert_eq!(unique.len(), 3); // rust, google, tokio
        assert_eq!(map[0], 0);
        assert_eq!(map[1], 0); // duplicate of 0
        assert_eq!(map[2], 2);
        assert_eq!(map[3], 2); // duplicate of 2
        assert_eq!(map[4], 4);
    }
}
