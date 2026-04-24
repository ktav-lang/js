@echo off
:: Local Windows build helper: combines Visual Studio's MSVC toolchain
:: (cl.exe + link.exe) with cargo-xwin's pre-downloaded Windows SDK
:: cache so machines without a fully installed VS+SDK can still build
:: the ktav-napi crate. Requires Developer Mode + `cargo install
:: cargo-xwin` (one-time setup). CI runners do not need any of this;
:: they have a native VS+SDK. See AGENTS.md for details.
::
:: Usage:
::     scripts\build-napi-windows.bat
::     scripts\build-napi-windows.bat --profile dev

setlocal enabledelayedexpansion

set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
set "XWIN=C:\Users\Computer\AppData\Local\cargo-xwin\xwin"

call "%VCVARS%" >nul 2>&1
if errorlevel 1 (
    echo [build-napi] vcvars64.bat failed - is Visual Studio Build Tools installed?
    exit /b 1
)

if not exist "%XWIN%\sdk\lib\ucrt\x86_64\ucrt.lib" (
    echo [build-napi] xwin SDK cache missing at %XWIN%
    echo [build-napi] Populate with: cargo xwin build --release -p ktav-napi
    exit /b 1
)

set "LIB=!LIB!;%XWIN%\crt\lib\x86_64;%XWIN%\sdk\lib\um\x86_64;%XWIN%\sdk\lib\ucrt\x86_64"
set "INCLUDE=!INCLUDE!;%XWIN%\crt\include;%XWIN%\sdk\include\ucrt;%XWIN%\sdk\include\um;%XWIN%\sdk\include\shared"

cd /d "%~dp0\.."
cargo build --release --target x86_64-pc-windows-msvc -p ktav-napi %*
exit /b !errorlevel!
