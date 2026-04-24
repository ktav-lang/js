@echo off
:: Local Windows build helper: combines Visual Studio's MSVC toolchain
:: (cl.exe + link.exe) with optional cargo-xwin SDK libs, so dev
:: machines without a full Windows SDK can still build `ktav-napi`.
:: Requires Developer Mode + `cargo install cargo-xwin` for the xwin
:: path. CI runners (windows-latest) have a full VS+SDK - they skip
:: this script entirely and use plain `cargo build`.
::
:: Usage:
::     scripts\build-napi-windows.bat
::     scripts\build-napi-windows.bat --profile dev

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
    echo [build-napi] vcvars64.bat not found - install Visual Studio Build Tools with the C++ workload
    exit /b 1
)

call "%VCVARS%" >nul 2>&1
if errorlevel 1 (
    echo [build-napi] vcvars64.bat failed to initialize
    exit /b 1
)

:: xwin libs are optional - only needed on dev machines without a full
:: Windows SDK. CI has the SDK through vcvars already.
set "XWIN=%LOCALAPPDATA%\cargo-xwin\xwin"
if exist "%XWIN%\sdk\lib\ucrt\x86_64\ucrt.lib" (
    set "LIB=!LIB!;%XWIN%\crt\lib\x86_64;%XWIN%\sdk\lib\um\x86_64;%XWIN%\sdk\lib\ucrt\x86_64"
    set "INCLUDE=!INCLUDE!;%XWIN%\crt\include;%XWIN%\sdk\include\ucrt;%XWIN%\sdk\include\um;%XWIN%\sdk\include\shared"
)

cd /d "%~dp0\.."
cargo build --release --target x86_64-pc-windows-msvc -p ktav-napi %*
exit /b !errorlevel!
