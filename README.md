A custom editor extension for Visual Studio Code which provides a hex editor for viewing and manipulating files in their raw hexadecimal representation.

## Features

- Opening files as hex
- A data inspector for viewing the hex values as various different data types
- Editing with undo, redo, copy, and paste support
- Find and replace

![Navigating a file](https://raw.githubusercontent.com/microsoft/vscode-hexeditor/main/hex-editor.gif)

![Editing a file](https://raw.githubusercontent.com/microsoft/vscode-hexeditor/main/hex-editor-editing.gif)

## How to Use

There are three ways to open a file in the hex editor:

1. Right click a file -> Open With -> Hex Editor
2. Trigger the command palette (<kbd>F1</kbd>) -> Open File using Hex Editor
3. Trigger the command palette (<kbd>F1</kbd>) -> Reopen With -> Hex Editor

The hex editor can be set as the default editor for certain file types by using the `workbench.editorAssociations` setting. For example, this would associate all files with extensions `.hex` and `.ini` to use the hex editor by default:

```json
"workbench.editorAssociations": [
  {
    "viewType": "hexEditor.hexedit",
    "filenamePattern": "*.hex"
  },
  {
    "viewType": "hexEditor.hexedit",
    "filenamePattern": "*.ini"
  }
],
```

## Known Issues

- Undoing a pending edit causes editor to get into a bad state [#161](https://github.com/microsoft/vscode-hexeditor/issues/161)
- Searching in large files can become hit or miss [#149](https://github.com/microsoft/vscode-hexeditor/issues/149)

To track all issues / file a new issue please go to the Github repo https://github.com/microsoft/vscode-hexeditor/issues
