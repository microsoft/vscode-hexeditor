# VS Code Hexeditor

This an extension for Visual Studio Code which utilizes the custom editor API to allow viewing files as hex within VS Code.

## Features

- Opening files as HEX
- Navigating and scrolling through them
- Viewing the hex values in various different formats
- Simple editing with undo, redo, copy, and paste support
- Find and Replace support

![Navigating a file](https://raw.githubusercontent.com/microsoft/vscode-hexeditor/main/hex-editor.gif)

![Editing a file](https://raw.githubusercontent.com/microsoft/vscode-hexeditor/main/hex-editor-editing.gif)

## How to Use
There are three ways to open a file as hex
1. Trigger the command palette (Ctrl / Cmd + Shift + P) -> Reopen With -> Hex Editor
2. Right click a file -> Open With -> Hex Editor
3. Trigger the command palette (Ctrl / Cmd + Shift + P) -> Open File using Hex Editor

If you would like to use the hex editor as the default hex editor for certain file types you can add the `workbench.editorAssociations` setting to your `settings.json`.

For example, this would associate all files with .hex or .ini to open by default in the hex editor
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

## Extension Settings

This extension contributes the following settings:

* `hexeditor.maxFileSize`: How many MB you want the editor to try to open before warning you with the open anyways message

## Known Issues

- Undoing a pending edit causes editor to get into a bad state [161](https://github.com/microsoft/vscode-hexeditor/issues/161)
- Searching in large files can become hit or miss [149](https://github.com/microsoft/vscode-hexeditor/issues/149)

To track all issues / file a new issue please go to the Github repo https://github.com/microsoft/vscode-hexeditor/issues

-----------------------------------------------------------------------------------------------------------

## Code of Conduct
https://opensource.microsoft.com/codeofconduct
