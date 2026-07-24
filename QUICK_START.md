# Quick Start: Build & Install the Hex Editor Extension

## Prerequisites Check

Before starting, ensure you have:

- [ ] Windows 10/11 or macOS or Linux
- [ ] VS Code installed
- [ ] Node.js installed (v14 or newer) - [Download](https://nodejs.org/)

## One-Command Build (Recommended)

### For Windows PowerShell:

```powershell
cd "C:\Users\shalsh1\Downloads\My_Tools\HexEditor\vscode-hexeditor"
.\build-vsix.ps1
```

### For Windows Command Prompt:

```cmd
cd "C:\Users\shalsh1\Downloads\My_Tools\HexEditor\vscode-hexeditor"
build-vsix.bat
```

### For macOS/Linux:

```bash
cd ~/Downloads/My_Tools/HexEditor/vscode-hexeditor
npm install
npm test
npm run compile
npm install -g @vscode/vsce
vsce package
```

## Manual Build Steps

If the scripts don't work, follow these steps:

### 1. Install Dependencies

```powershell
npm install
```

### 2. Run Tests (Optional but Recommended)

```powershell
npm test
```

### 3. Compile

```powershell
npm run compile
```

### 4. Create VSIX Package

```powershell
npm install -g @vscode/vsce
vsce package
```

## Install in VS Code

After building (you'll see a file like `hexeditor-1.11.1.vsix`):

### Method 1: GUI (Easiest)

1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions)
3. Click `...` menu → "Install from VSIX"
4. Select the `.vsix` file from the current directory

### Method 2: Command Line

```powershell
code --install-extension .\hexeditor-1.11.1.vsix
```

## Test the Installation

1. Create a test file: `test.hex`

```
48 65 6C 6C 6F 20 57 6F 72 6C 64
```

2. Open it with VS Code:

```powershell
code test.hex
```

3. It should display the hex bytes in the editor (should show "Hello World" as bytes)

## Troubleshooting

| Problem                   | Solution                                        |
| ------------------------- | ----------------------------------------------- |
| `npm: command not found`  | Install Node.js from https://nodejs.org/        |
| `vsce: command not found` | Run `npm install -g @vscode/vsce`               |
| Build fails               | Run `npm install` again, then `npm run compile` |
| Tests fail                | Check VS Code developer tools: `Ctrl+Shift+I`   |
| Extension won't install   | Uninstall the old version first                 |

## Files Generated

After successful build, you'll have:

- `hexeditor-X.X.X.vsix` ← **This is what you install!**
- `dist/` folder with compiled JavaScript
- `out/` folder with TypeScript output

## Uninstall or Reinstall

```powershell
# Uninstall
code --uninstall-extension ms-vscode.hexeditor

# Or uninstall this custom version
code --uninstall-extension your-custom-name
```

## Documentation

For more details, see:

- [BUILD_VSIX.md](BUILD_VSIX.md) - Detailed build guide
- [HEX_FILE_SUPPORT.md](HEX_FILE_SUPPORT.md) - Feature documentation

## Getting Help

1. Check the troubleshooting table above
2. Run `npm test` to verify everything works
3. Check VS Code output: `Ctrl+Shift+U`
4. Look at the error messages carefully

---

**You're all set!** After installing the extension, you can open any `.hex` file and it will automatically display the decoded binary data.
