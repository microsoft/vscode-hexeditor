## Release Notes

### 1.2.0
- Simple File Watching implementation, editor will now respond to changes on disk outside of editor
- Support for copy and paste
- Support for Find with text regex, and hex wildcards (i.e FF ?? EE)
- Support for multi select, along with drag, drop, and keyboard selection improvements thank to [@jeanp413 via #92](https://github.com/microsoft/vscode-hexeditor/pull/92) for helping with that
- Fixed a bug with num pad not working inside the hex editor
- Fixed a bug with incorrect UTF-8 decoding inside the data inspector

### 1.1.0
- Added simple editing support for hex and decoded text
- Fixed a bug preventing files over 18MB from being opened
- Added more keyboard navigation support via Pgup, Pgdown, Ctrl + End/Home, and End/Home.
- Fixed a bug with empty files not rendering correctly
- Scroll position is now retained upon switching tabs

### 1.0.1
- Add instructions to the README on how to use the extension
- Add an Open with HexEditor command

### 1.0.0
- Hex Editor initial release