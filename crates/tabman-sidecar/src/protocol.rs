//! Chrome & Brave Native Messaging Protocol Implementation.
//!
//! Exposes 4-byte little-endian length prefix framing over standard input/output streams.

use std::io::{self, Read, Write};

/// Read a single framed Native Message from standard input.
///
/// Returns:
/// - `Ok(Some(payload))` on successful read.
/// - `Ok(None)` on EOF (when the browser disconnects).
/// - `Err(...)` on I/O error or message > 16 MB.
pub fn read_native_message<R: Read>(reader: &mut R) -> io::Result<Option<String>> {
    let mut len_buf = [0u8; 4];
    match reader.read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }

    let length = u32::from_le_bytes(len_buf) as usize;
    // Chromium Native Messaging enforces 1 MB (or up to 16 MB) max message size
    if length > 16 * 1024 * 1024 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Message length exceeds 16 MB limit",
        ));
    }

    let mut body = vec![0u8; length];
    reader.read_exact(&mut body)?;

    let text = String::from_utf8(body)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    Ok(Some(text))
}

/// Write a single framed Native Message to standard output.
pub fn write_native_message<W: Write>(writer: &mut W, message: &str) -> io::Result<()> {
    let bytes = message.as_bytes();
    let length = bytes.len() as u32;

    writer.write_all(&length.to_le_bytes())?;
    writer.write_all(bytes)?;
    writer.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_native_messaging_framing_roundtrip() {
        let msg = r#"{"type":"ping","version":"0.6.1"}"#;
        let mut buffer = Vec::new();

        write_native_message(&mut buffer, msg).expect("write message");

        // Verify length header
        assert_eq!(buffer.len(), 4 + msg.len());
        let declared_len = u32::from_le_bytes(buffer[0..4].try_into().unwrap()) as usize;
        assert_eq!(declared_len, msg.len());

        // Read message back
        let mut cursor = std::io::Cursor::new(buffer);
        let read_back = read_native_message(&mut cursor)
            .expect("read message")
            .expect("some message");
        assert_eq!(read_back, msg);
    }

    #[test]
    fn test_native_messaging_eof() {
        let empty_buf = Vec::new();
        let mut cursor = std::io::Cursor::new(empty_buf);
        let res = read_native_message(&mut cursor).expect("read");
        assert!(res.is_none());
    }
}
