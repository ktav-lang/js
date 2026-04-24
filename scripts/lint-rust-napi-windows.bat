@echo off
:: Wrap `cargo clippy-napi` with vcvars + optional xwin SDK libs, so
:: the MSVC linker it needs for proc-macro / build.rs host-side is
:: available on dev machines. CI Linux runners skip this entirely.

setlocal enabledelayedexpansion

set "VSWHERE=C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
set "VCVARS="

if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_INSTALL=%%i"
    if defined VS_INSTALL (
        set "VCVARS=!VS_INSTALL!\VC\Auxiliary\Build\vcvars64.bat"
    )
)

if "%VCVARS%"=="" (
    set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
)

if not exist "%VCVARS%" (
    echo [lint:rust:napi] vcvars64.bat not found
    exit /b 1
)

call "%VCVARS%" >nul 2>&1
if errorlevel 1 (
    echo [lint:rust:napi] vcvars64.bat failed to initialize
    exit /b 1
)

set "XWIN=%LOCALAPPDATA%\cargo-xwin\xwin"
if exist "%XWIN%\sdk\lib\ucrt\x86_64\ucrt.lib" (
    set "LIB=!LIB!;%XWIN%\crt\lib\x86_64;%XWIN%\sdk\lib\um\x86_64;%XWIN%\sdk\lib\ucrt\x86_64"
    set "INCLUDE=!INCLUDE!;%XWIN%\crt\include;%XWIN%\sdk\include\ucrt;%XWIN%\sdk\include\um;%XWIN%\sdk\include\shared"
)

cd /d "%~dp0\.."
cargo clippy-napi -- -D warnings
exit /b !errorlevel!
