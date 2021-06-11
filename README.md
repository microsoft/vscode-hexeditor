A custom editor extension for Visual Studio Code which provides a hex editor for viewing and manipulating files in their raw hexadecimal representation.

## Features

- Opening files as hex
- A data inspector for viewing the hex values as various different data types
- Editing with undo, redo, copy, and paste support
- Find and replace

![User opens a text file named release.txt and switches to the hex editor via command palette. The user then navigates and edits the document](https://raw.githubusercontent.com/microsoft/vscode-hexeditor/main/hex-editor.gif)

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

## Configuring the Data Inspector

By default the data inspector has a dedicated activity bar entry on the left that appears when the hex editor is opened, causing the explorer or whatever side bar you had opened to be hidden. If preferred, the hex editor view can be dragged into another view if preferred by dragging the ⬡ icon onto one of the other views.

This can be used in combination with the `hexeditor.dataInspector.autoReveal` setting to avoid revealing the side bar containing the data inspector all together.

## Known Issues

- Undoing a pending edit causes editor to get into a bad state [#161](https://github.com/microsoft/vscode-hexeditor/issues/161)
- Searching in large files can become hit or miss [#149](https://github.com/microsoft/vscode-hexeditor/issues/149)

To track all issues / file a new issue please go to the Github repo https://github.com/microsoft/vscode-hexeditor/issues
