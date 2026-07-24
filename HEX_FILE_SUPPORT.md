# VS Code Hex Editor with .hex File Support

This is an enhanced version of the VS Code Hex Editor that adds native support for `.hex` files, automatically parsing hexadecimal-encoded text and displaying it using the existing hex viewer interface.

## What's New

### .hex File Format Support

The extension now automatically detects and parses `.hex` files in two popular formats:

#### 1. Plain Hex Format

Files containing hexadecimal values separated by spaces, newlines, commas, underscores, or colons:

```
48 65 6C 6C 6F 20 57 6F 72 6C 64
48,65,6C,6C,6F
48_65_6C_6C_6F
0x48 0x65 0x6C 0x6C 0x6F
```

#### 2. Intel HEX Format

Standard Intel HEX record format with checksum validation:

```
:10000000214601360121470136007EFE09D219012F
:100010002418011DB1110D19EE11FE1EBD204012E
:00000001FF
```

### Features

- **Automatic Detection**: `.hex` files are automatically recognized and parsed
- **Fallback Handling**: Non-hex files display as-is, ensuring compatibility
- **Checksum Validation**: Intel HEX records are validated using embedded checksums
- **Address Support**: Supports extended address records for non-contiguous memory ranges
- **Seamless Display**: Decoded hex content is displayed with the same viewer as regular binary files
- **Integrated UI**: All existing hex editor features work with decoded `.hex` files:
  - Data inspector
  - Search and replace
  - Copy in multiple formats
  - Column configuration
  - Endianness selection

## Installation

### Option 1: From VSIX File (Pre-built)

If you have a pre-built `.vsix` file:

1. Open VS Code
2. Press `Ctrl+Shift+X` to open Extensions
3. Click the `...` menu at the top of the Extensions sidebar
4. Select "Install from VSIX..."
5. Choose the `.vsix` file

### Option 2: Build Yourself

If you want to build the extension from source:

```powershell
# On Windows PowerShell
.\build-vsix.ps1

# Or using batch
build-vsix.bat

# Or manually
npm install
npm test
npm run compile
npm install -g @vscode/vsce
vsce package
```

See [BUILD_VSIX.md](BUILD_VSIX.md) for detailed instructions.

## Usage

### Opening .hex Files

Simply open any `.hex` file in VS Code:

```powershell
code myfile.hex
```

The hex editor will automatically:

1. Detect it's a `.hex` file
2. Parse the hexadecimal-encoded text
3. Display the decoded binary data in the hex viewer

### Examples

**Plain hex file (plain.hex):**

```
48 65 6C 6C 6F 20 57 6F 72 6C 64
```

Displays as: `Hello World`

**Intel HEX file (firmware.hex):**

```
:020000040000FA
:1000000000000000000000000000000000000000F0
:00000001FF
```

Displays as the decoded binary data with proper address handling

## Technical Details

### Implementation

The hex file support is implemented through a **file accessor wrapper** that:

1. **Detects .hex files** by filename extension check (case-insensitive)
2. **Reads the text content** using the underlying file accessor
3. **Parses hex-encoded data** using one of two parsers:
   - Intel HEX parser (validates records and checksums)
   - Plain hex parser (handles various separators and formats)
4. **Falls back gracefully** if parsing fails (treats as binary)
5. **Feeds decoded bytes** to the existing display pipeline

### Security & Read-Only

`.hex` files are opened as **read-only** by design:

- Prevents accidental save-back in wrong format
- Protects the original `.hex` source file structure
- Future versions may support write-back with format preservation

### Performance

- **Lazy loading**: Content is decoded on-demand, not at file open time
- **Caching**: Decoded content is cached after first read
- **Streaming reads**: Large files are read incrementally through the accessor interface

## Code Structure

### New Files Added

- **`src/hexFormat.ts`**: Hex format parsing logic
  - `tryDecodeHexEncodedText()`: Main entry point
  - `tryParseIntelHex()`: Intel HEX record parser
  - `tryParsePlainHex()`: Plain hex text parser
  - Helper functions for validation and conversion

- **`src/test/hexFormat.test.ts`**: Unit tests for hex parsing
  - Test cases for plain hex and Intel HEX formats
  - Error handling tests

### Modified Files

- **`src/fileSystemAdaptor.ts`**:
  - Added `.hex` file detection
  - Integrated `HexDecodedFileAccessor` wrapper
  - Wraps all file accessors for consistent .hex handling

- **`src/test/index.ts`**:
  - Registered new hex format tests in test suite

## Testing

Run the test suite to verify the implementation:

```powershell
npm test
```

This runs all tests including:

- Plain hex decoding
- Intel HEX parsing with checksum validation
- Error handling for invalid formats

## Compatibility

- **VS Code**: v1.89.0 or later
- **Node.js**: v14.0.0 or later (for building)
- **Platforms**: Windows, macOS, Linux

## Known Limitations

1. **Read-only mode**: `.hex` files cannot be edited and saved (by design)
2. **Format detection**: Only recognizes `.hex` file extension
3. **Large files**: Entire file must fit in memory (inherited from wrapper design)

## Future Enhancements

Potential improvements for future versions:

1. **Write support**: Encode edited binary back to hex or Intel HEX format
2. **Format options**: Allow users to choose export format (plain hex vs Intel HEX)
3. **Syntax highlighting**: Highlight hex format in editor view (if used with text editor)
4. **Validation UI**: Show parsing errors or warnings in editor
5. **Format auto-detection**: Detect format without requiring `.hex` extension

## Troubleshooting

### .hex file not parsed

- Check file extension is lowercase `.hex`
- Verify file contains valid hex data
- Try opening in text editor to inspect format
- Check VS Code developer console for errors (`Ctrl+Shift+I`)

### Extension not installing

- Verify Node.js and npm are installed
- Run `npm install` before building
- Check for build errors: `npm run compile`
- Try `npm test` to verify functionality

### Performance issues with large files

- Currently limited to file size that fits in memory
- Consider splitting large `.hex` files
- Monitor memory usage in VS Code

## License

MIT License - See LICENSE file for details

## Contributing

This enhanced version builds upon the original VS Code Hex Editor by Microsoft.

### Development

To contribute improvements:

1. Fork the repository
2. Create a feature branch
3. Make changes and add tests
4. Run `npm test` to verify
5. Submit a pull request

## Credits

- Original hex editor: Microsoft
- .hex format support: Added in this version

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review [BUILD_VSIX.md](BUILD_VSIX.md) for build issues
3. Check VS Code output console for error messages
4. Create an issue with detailed reproduction steps
