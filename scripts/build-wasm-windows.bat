@echo off
:: Wrap scripts/build-wasm.mjs with vcvars64 (+ optional xwin SDK libs)
:: so cargo's HOST build scripts can link on Windows regardless of
:: whether the machine has a full Visual Studio + Windows SDK install
:: (CI runners do) or only the MSVC compiler + cargo-xwin's cache
:: (dev machines without an SDK).
::
:: Detection order:
::   1. `vswhere.exe` -> latest installed VS with the VC++ workload.
::   2. If that's empty, fall back to the Community hardcoded path.
::   3. xwin libs appended only if the cache exists.
::
:: Linux / macOS run `node scripts/build-wasm.mjs` directly, no wrapper.

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
    echo [build-wasm] vcvars64.bat not found - install Visual Studio Build Tools with the C++ workload
    exit /b 1
)

call "%VCVARS%" >nul 2>&1
if errorlevel 1 (
    echo [build-wasm] vcvars64.bat failed to initialize
    exit /b 1
)

:: Append xwin's SDK libs only if the cache is populated. CI runners
:: have a full SDK through vcvars already and don't need this.
set "XWIN=%LOCALAPPDATA%\cargo-xwin\xwin"
if exist "%XWIN%\sdk\lib\ucrt\x86_64\ucrt.lib" (
    set "LIB=!LIB!;%XWIN%\crt\lib\x86_64;%XWIN%\sdk\lib\um\x86_64;%XWIN%\sdk\lib\ucrt\x86_64"
    set "INCLUDE=!INCLUDE!;%XWIN%\crt\include;%XWIN%\sdk\include\ucrt;%XWIN%\sdk\include\um;%XWIN%\sdk\include\shared"
)

cd /d "%~dp0\.."
node scripts\build-wasm.mjs %*
exit /b !errorlevel!
