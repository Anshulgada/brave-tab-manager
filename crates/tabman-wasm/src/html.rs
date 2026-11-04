//! SIMD HTML Stripper & Content Extractor for Full-Text Search.
//!
//! Provides ultra-high-throughput (multi-gigabyte/sec) HTML tag stripping,
//! script/style block removal, entity decoding, and title/meta-description extraction.

#[cfg(target_arch = "wasm32")]
use core::arch::wasm32::*;

pub struct ExtractedContent {
    pub title: String,
    pub description: String,
    pub body: String,
}

/// Decodes an HTML entity (e.g., &amp;, &lt;, &#39;, &#x2F;).
pub fn decode_entity(entity: &str) -> Option<char> {
    match entity.to_ascii_lowercase().as_str() {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        "nbsp" => Some(' '),
        "copy" => Some('©'),
        "reg" => Some('®'),
        "trade" => Some('™'),
        "ndash" => Some('–'),
        "mdash" => Some('—'),
        _ => {
            if let Some(dec) = entity.strip_prefix('#') {
                if let Some(hex) = dec.strip_prefix('x').or_else(|| dec.strip_prefix('X')) {
                    u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
                } else {
                    dec.parse::<u32>().ok().and_then(char::from_u32)
                }
            } else {
                None
            }
        }
    }
}

/// Extracts title, meta description, and cleaned text body from raw HTML.
pub fn extract_html_content(
    html: &str,
    max_title_bytes: usize,
    max_desc_bytes: usize,
    max_body_bytes: usize,
) -> ExtractedContent {
    let bytes = html.as_bytes();
    let len = bytes.len();

    let mut title = String::new();
    let mut description = String::new();
    let mut body = String::with_capacity(len.min(max_body_bytes));

    let mut i = 0;
    let mut in_title = false;
    let mut title_buf = String::new();
    let mut prev_is_space = true; // Avoid leading space in body

    while i < len {
        // Fast SIMD skip to next '<' or '&'
        #[cfg(target_arch = "wasm32")]
        {
            let needle_tag = u8x16_splat(b'<');
            let needle_ent = u8x16_splat(b'&');

            while i + 16 <= len && !in_title {
                let chunk = unsafe { v128_load(bytes.as_ptr().add(i) as *const v128) };
                let cmp_tag = u8x16_eq(chunk, needle_tag);
                let cmp_ent = u8x16_eq(chunk, needle_ent);
                let combined = v128_or(cmp_tag, cmp_ent);
                let mask = u8x16_bitmask(combined);

                if mask == 0 {
                    // 16 text bytes without tag or entity: append directly to body
                    if body.len() < max_body_bytes {
                        let text_chunk = unsafe { std::str::from_utf8_unchecked(&bytes[i..i + 16]) };
                        for c in text_chunk.chars() {
                            if c.is_whitespace() {
                                if !prev_is_space && body.len() < max_body_bytes {
                                    body.push(' ');
                                    prev_is_space = true;
                                }
                            } else if body.len() < max_body_bytes {
                                body.push(c);
                                prev_is_space = false;
                            }
                        }
                    }
                    i += 16;
                } else {
                    break;
                }
            }
        }

        if i >= len {
            break;
        }

        let b = bytes[i];

        // Handle HTML Tags
        if b == b'<' {
            // Check HTML comments: <!-- ... -->
            if i + 4 <= len && &bytes[i..i + 4] == b"<!--" {
                i += 4;
                while i + 3 <= len && &bytes[i..i + 3] != b"-->" {
                    i += 1;
                }
                i = (i + 3).min(len);
                continue;
            }

            // Find tag end '>'
            let tag_start = i + 1;
            let mut tag_end = tag_start;
            while tag_end < len && bytes[tag_end] != b'>' {
                tag_end += 1;
            }

            let tag_content = if tag_end <= len {
                &html[tag_start..tag_end]
            } else {
                ""
            };
            let tag_lower = tag_content.trim_start().to_ascii_lowercase();

            // Handle <title> and </title>
            if tag_lower.starts_with("title") && (tag_lower.len() == 5 || tag_lower.as_bytes()[5].is_ascii_whitespace()) {
                in_title = true;
                title_buf.clear();
            } else if tag_lower.starts_with("/title") {
                in_title = false;
                if title.is_empty() {
                    title = title_buf.trim().chars().take(max_title_bytes).collect();
                }
            }
            // Handle <meta name="description" content="..."> or <meta property="og:description" content="...">
            else if tag_lower.starts_with("meta") {
                if (tag_lower.contains("name=\"description\"")
                    || tag_lower.contains("name='description'")
                    || tag_lower.contains("property=\"og:description\"")
                    || tag_lower.contains("property='og:description'"))
                    && description.is_empty()
                {
                    if let Some(content_pos) = tag_lower.find("content=") {
                        let after_content = &tag_content[content_pos + 8..];
                        let quote = after_content.chars().next().unwrap_or('"');
                        if quote == '"' || quote == '\'' {
                            let content_val = &after_content[1..];
                            if let Some(end_quote) = content_val.find(quote) {
                                description = content_val[..end_quote]
                                    .trim()
                                    .chars()
                                    .take(max_desc_bytes)
                                    .collect();
                            }
                        }
                    }
                }
            }
            // Skip non-visible blocks completely (<script>, <style>, <noscript>, <svg>, <iframe>)
            else if tag_lower.starts_with("script")
                || tag_lower.starts_with("style")
                || tag_lower.starts_with("noscript")
                || tag_lower.starts_with("svg")
                || tag_lower.starts_with("iframe")
            {
                let tag_name = tag_lower.split_whitespace().next().unwrap_or("");
                let close_tag = format!("</{}", tag_name);
                i = tag_end + 1;
                while i < len {
                    if bytes[i] == b'<' && i + close_tag.len() <= len {
                        let cand = &html[i..i + close_tag.len()].to_ascii_lowercase();
                        if cand == &close_tag {
                            while i < len && bytes[i] != b'>' {
                                i += 1;
                            }
                            break;
                        }
                    }
                    i += 1;
                }
                i += 1;
                continue;
            }

            // Line breaking tags insert a space into body
            if tag_lower.starts_with("p")
                || tag_lower.starts_with("/p")
                || tag_lower.starts_with("div")
                || tag_lower.starts_with("/div")
                || tag_lower.starts_with("h")
                || tag_lower.starts_with("br")
                || tag_lower.starts_with("li")
            {
                if !prev_is_space && body.len() < max_body_bytes {
                    body.push(' ');
                    prev_is_space = true;
                }
            }

            i = tag_end + 1;
            continue;
        }

        // Handle HTML Entities (&...;)
        if b == b'&' {
            let ent_start = i + 1;
            let mut ent_end = ent_start;
            while ent_end < len && ent_end - ent_start < 10 && bytes[ent_end] != b';' && bytes[ent_end] != b' ' {
                ent_end += 1;
            }

            if ent_end < len && bytes[ent_end] == b';' {
                let entity_str = &html[ent_start..ent_end];
                if let Some(ch) = decode_entity(entity_str) {
                    if in_title {
                        title_buf.push(ch);
                    } else if ch.is_whitespace() {
                        if !prev_is_space && body.len() < max_body_bytes {
                            body.push(' ');
                            prev_is_space = true;
                        }
                    } else if body.len() < max_body_bytes {
                        body.push(ch);
                        prev_is_space = false;
                    }
                    i = ent_end + 1;
                    continue;
                }
            }
        }

        // Normal Character
        let ch = html[i..].chars().next().unwrap_or(' ');
        let ch_len = ch.len_utf8();

        if in_title {
            if ch.is_whitespace() {
                title_buf.push(' ');
            } else {
                title_buf.push(ch);
            }
        } else if ch.is_whitespace() {
            if !prev_is_space && body.len() < max_body_bytes {
                body.push(' ');
                prev_is_space = true;
            }
        } else if body.len() < max_body_bytes {
            body.push(ch);
            prev_is_space = false;
        }

        i += ch_len;
    }

    ExtractedContent {
        title,
        description,
        body: body.trim().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_html_strips_scripts_and_extracts_metadata() {
        let html = r#"
            <!DOCTYPE html>
            <html>
            <head>
                <title>Tabman - Fast Tab Organizer &amp; AI Manager</title>
                <meta name="description" content="Offline-first tab manager for Brave and Chrome.">
                <style>body { background: #000; }</style>
                <script>console.log("analytics tracking code");</script>
            </head>
            <body>
                <h1>Tab Management Simplified</h1>
                <p>Organize your tabs with <b>zero-latency</b> local AI &amp; WebGPU acceleration.</p>
                <!-- Comment to ignore -->
                <script>var x = 123;</script>
            </body>
            </html>
        "#;

        let res = extract_html_content(html, 256, 256, 1024);
        assert_eq!(res.title, "Tabman - Fast Tab Organizer & AI Manager");
        assert_eq!(res.description, "Offline-first tab manager for Brave and Chrome.");
        assert!(res.body.contains("Tab Management Simplified"));
        assert!(res.body.contains("Organize your tabs with zero-latency local AI & WebGPU acceleration."));
        assert!(!res.body.contains("analytics tracking code"));
        assert!(!res.body.contains("var x = 123"));
        assert!(!res.body.contains("background: #000"));
    }
}
