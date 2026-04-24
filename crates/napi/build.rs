// napi-build injects the linker flags N-API needs on each platform —
// on macOS, `-undefined dynamic_lookup`; on Windows, the import lib for
// node.dll; on Linux, nothing extra. Required by `napi-rs`.
fn main() {
    napi_build::setup();
}
