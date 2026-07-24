# Building the HexEditor Extension with .hex Support

This guide explains how to build and package the hex editor extension as a VSIX file that can be installed in VS Code.

## Prerequisites

Before building, you need to have the following installed on your system:

1. **Node.js** (v14 or higher) - [Download from nodejs.org](https://nodejs.org/)
2. **npm** (comes with Node.js)
3. **VS Code** (for testing the extension)

## Build Steps

### Step 1: Install Dependencies

Open PowerShell or Command Prompt in the extension directory and run:

```powershell
npm install
```

This installs all required packages listed in `package.json`, including TypeScript, esbuild, and other dependencies.

### Step 2: Compile the Extension

Run the compile command:

```powershell
npm run compile
```

This will:

- Run TypeScript type checking
- Bundle the extension code with esbuild
- Generate output in the `dist/` directory

### Step 3: Package as VSIX

First, install the `vsce` packaging tool globally (if not already installed):

```powershell
npm install -g @vscode/vsce
```

Then package the extension:

```powershell
vsce package
```

This creates a `.vsix` file in the current directory (e.g., `hexeditor-1.11.1.vsix`).

## Installing in VS Code

Once you have the `.vsix` file, you can install it in VS Code by:

1. **Method 1: Using Command Palette**
   - Open VS Code
   - Press `Ctrl+Shift+P` to open the Command Palette
   - Search for "Install from VSIX"
   - Select the `.vsix` file you created

2. **Method 2: Using Extensions Sidebar**
   - Click the Extensions icon in the left sidebar (or press `Ctrl+Shift+X`)
   - Click the three dots menu (`...`) at the top
   - Select "Install from VSIX..."
   - Select the `.vsix` file

3. **Method 3: Command Line**
   ```powershell
   code --install-extension .\hexeditor-1.11.1.vsix
   ```

## What's New in This Version

This enhanced hex editor now includes:

- **Support for `.hex` files**: The editor automatically detects and parses hex-encoded text files
- **Plain hex format**: Supports space, newline, comma, and underscore-separated hex values
- **Intel HEX format**: Full support for Intel HEX records with checksum validation
- **Seamless display**: All hex content is displayed using the existing hex viewer interface

## Testing

To run tests before building:

```powershell
npm test
```

This runs the test suite including the new hex format parsing tests.

## Quick Build Script

For convenience, you can save this as `build-vsix.ps1` and run it:

```powershell
# build-vsix.ps1
# Quick build script for the hex editor extension

Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

Write-Host "Running TypeScript compiler and esbuild..." -ForegroundColor Cyan
npm run compile

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Installing vsce if needed..." -ForegroundColor Cyan
npm install -g @vscode/vsce

Write-Host "Packaging as VSIX..." -ForegroundColor Cyan
vsce package

Write-Host "Build complete!" -ForegroundColor Green
Write-Host "Your VSIX file has been created successfully." -ForegroundColor Green
```

To use this script, run:

```powershell
.\build-vsix.ps1
```

## Troubleshooting

### "npm: The term 'npm' is not recognized"

- Node.js is not installed or not in your PATH
- Install Node.js from https://nodejs.org/
- Restart your terminal after installation

### "vsce: The term 'vsce' is not recognized"

- Install vsce: `npm install -g @vscode/vsce`

### Compilation errors

- Delete `node_modules` and `dist` folders
- Run `npm install` again
- Run `npm run compile`

### Tests failing

- Ensure all dependencies are installed: `npm install`
- Run tests with `npm test` to see detailed error messages
