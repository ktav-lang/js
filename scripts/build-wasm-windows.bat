@echo off
:: Wrap scripts/build-wasm.mjs with vcvars64 + xwin SDK libs so cargo's
:: HOST build scripts (proc-macros, wasm-bindgen build.rs, etc.) can
:: link on a machine that has MSVC tools but no Windows SDK. The wasm32
:: targets themselves don't need any of this ??? only the build.rs
:: helpers do, because rustc compiles them for the HOST triple.
::
:: Linux / macOS don't need this wrapper ??? plain `node
:: scripts/build-wasm.mjs` is enough. See AGENTS.md for the
:: Windows-only quirks that motivate this script.

setlocal enabledelayedexpansion

set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
set "XWIN=C:\Users\Computer\AppData\Local\cargo-xwin\xwin"

call "%VCVARS%" >nul 2>&1
if errorlevel 1 (
    echo [build-wasm] vcvars64.bat failed - is Visual Studio Build Tools installed?
    exit /b 1
)

if not exist "%XWIN%\sdk\lib\ucrt\x86_64\ucrt.lib" (
    echo [build-wasm] xwin SDK cache missing at %XWIN%
    echo [build-wasm] Populate with: cargo xwin build --release -p ktav-napi
    exit /b 1
)

set "LIB=!LIB!;%XWIN%\crt\lib\x86_64;%XWIN%\sdk\lib\um\x86_64;%XWIN%\sdk\lib\ucrt\x86_64"
set "INCLUDE=!INCLUDE!;%XWIN%\crt\include;%XWIN%\sdk\include\ucrt;%XWIN%\sdk\include\um;%XWIN%\sdk\include\shared"

cd /d "%~dp0\.."
node scripts\build-wasm.mjs %*
exit /b !errorlevel!
