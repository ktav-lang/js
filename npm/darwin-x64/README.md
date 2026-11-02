# `@ktav-lang/js-darwin-x64` platform binaries

This package contains the prebuilt N-API and C ABI libraries for the
compatibility platform `x86_64-apple-darwin`. It is an optional dependency of
[`@ktav-lang/ktav`](https://www.npmjs.com/package/@ktav-lang/ktav) and is normally
installed automatically; install the main package to use the JavaScript API.

Platform identifiers and filenames preserve loader compatibility; they do not
identify the compiler used. Windows packages retain their legacy `msvc` names,
while the libraries in this build use GNU/LLVM. `native-package-manifest.json`
records the actual target, source identity and notice hashes for each library.

Complete third-party notices and required original legal/source materials are
kept separately under `third_party/napi/` and `third_party/cabi/`. The root
`LICENSE-MIT` and `LICENSE-APACHE` files cover the project's own code; the bundled
third-party materials retain their original terms.
