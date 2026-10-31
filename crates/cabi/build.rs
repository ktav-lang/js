use std::io::{self, Read};

const MARKER: &[u8] = b"KTAV-NOTICES-GZIP-v1\0";
const MAX_GZIP: usize = 4 * 1024 * 1024;

fn notice_resource(source: impl Read) -> io::Result<Vec<u8>> {
    let mut payload = Vec::new();
    source
        .take((MAX_GZIP + 1) as u64)
        .read_to_end(&mut payload)?;
    if payload.len() > MAX_GZIP || !payload.starts_with(&[0x1f, 0x8b, 0x08]) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "C ABI notices must be a gzip payload of at most 4 MiB",
        ));
    }
    let mut resource = Vec::with_capacity(MARKER.len() + 8 + payload.len());
    resource.extend_from_slice(MARKER);
    resource.extend_from_slice(&(payload.len() as u64).to_le_bytes());
    resource.extend_from_slice(&payload);
    Ok(resource)
}

fn main() -> io::Result<()> {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=KTAV_CABI_NOTICES_GZIP");
    let output = std::env::var_os("OUT_DIR")
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "missing OUT_DIR"))?;
    let output = std::path::PathBuf::from(output);
    let declaration = output.join("native_notices.rs");
    let Some(path) = std::env::var_os("KTAV_CABI_NOTICES_GZIP") else {
        return std::fs::write(declaration, "");
    };
    let path = std::path::PathBuf::from(path);
    println!("cargo:rerun-if-changed={}", path.display());
    let resource = notice_resource(std::fs::File::open(path)?)?;
    std::fs::write(output.join("native_notices.bin"), resource)?;
    std::fs::write(
        declaration,
        r#"/// Статический resource; не CString и не передаётся в ktav_free.
#[used]
#[no_mangle]
pub static KTAV_THIRD_PARTY_NOTICES: [u8; include_bytes!(concat!(env!("OUT_DIR"), "/native_notices.bin")).len()] =
    *include_bytes!(concat!(env!("OUT_DIR"), "/native_notices.bin"));
"#,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_keeps_marker_length_and_payload() {
        let payload = [0x1f, 0x8b, 0x08, 0, 0];
        let resource = notice_resource(payload.as_slice()).unwrap();
        assert_eq!(&resource[..MARKER.len()], MARKER);
        assert_eq!(
            &resource[MARKER.len()..MARKER.len() + 8],
            &(payload.len() as u64).to_le_bytes()
        );
        assert_eq!(&resource[MARKER.len() + 8..], payload);
    }

    #[test]
    fn empty_and_non_gzip_payloads_are_rejected() {
        for payload in [&[][..], b"not gzip", &[0x1f, 0x8b]] {
            assert_eq!(
                notice_resource(payload).unwrap_err().kind(),
                io::ErrorKind::InvalidData
            );
        }
    }

    #[test]
    fn exact_bound_is_allowed_but_one_extra_byte_is_rejected() {
        let mut payload = vec![0; MAX_GZIP];
        payload[..3].copy_from_slice(&[0x1f, 0x8b, 0x08]);
        assert_eq!(
            notice_resource(payload.as_slice()).unwrap().len(),
            MARKER.len() + 8 + MAX_GZIP
        );
        payload.push(0);
        assert_eq!(
            notice_resource(payload.as_slice()).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
    }

    #[test]
    fn read_errors_are_propagated() {
        struct Failed;
        impl Read for Failed {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::new(io::ErrorKind::PermissionDenied, "fixture"))
            }
        }
        assert_eq!(
            notice_resource(Failed).unwrap_err().kind(),
            io::ErrorKind::PermissionDenied
        );
    }
}
