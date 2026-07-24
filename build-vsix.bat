@echo off
REM Quick build script for the hex editor extension with .hex support
REM Run this script from the extension root directory

setlocal enabledelayedexpansion

echo.
echo === Hex Editor Extension Builder ===
echo.

REM Check if we're in the right directory
if not exist package.json (
    echo Error: package.json not found.
    echo Please run this script from the extension root directory.
    exit /b 1
)

REM Install dependencies
echo Step 1: Installing dependencies...
call npm install
if errorlevel 1 (
    echo Failed to install dependencies
    exit /b 1
)
echo Dependencies installed
echo.

REM Run tests
echo Step 2: Running tests...
call npm test
if errorlevel 1 (
    echo Tests failed
    exit /b 1
)
echo Tests passed
echo.

REM Compile
echo Step 3: Compiling extension...
call $env:PATH = "C:\Data\Tools\nodejs;$env:PATH"; cd "c:\Users\shalsh1\Downloads\My_Tools\HexEditor\vscode-hexeditor"; npm run compile 2>&1
call $env:PATH = "C:\Data\Tools\nodejs;$env:PATH"; cd "c:\Users\shalsh1\Downloads\My_Tools\HexEditor\vscode-hexeditor"; npx @vscode/vsce package 2>&1 | Select-String "DONE|ERROR"
if errorlevel 1 (
    echo Compilation failed
    exit /b 1
)
echo Compilation successful
echo.

REM Install vsce if needed
echo Step 4: Ensuring vsce is installed...
npm list -g @vscode/vsce >nul 2>&1
if errorlevel 1 (
    echo Installing vsce...
    call npm install -g @vscode/vsce
)

REM Package VSIX
echo.
echo Step 5: Packaging as VSIX...
call vsce package
if errorlevel 1 (
    echo Packaging failed
    exit /b 1
)

echo.
echo === Build Complete ===
echo Your VSIX file has been created successfully!
echo.
echo Next steps:
echo 1. Open VS Code
echo 2. Go to Extensions (Ctrl+Shift+X)
echo 3. Click '...' menu and select 'Install from VSIX...'
echo 4. Select the .vsix file created in this directory
echo.

endlocal
