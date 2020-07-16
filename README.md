# VS Code Hexeditor

This an extension for Visual Studio Code 1.46+ which utilizes the custom editor API to allow viewing files as hex within VS Code.

## Features

- Opening files as HEX
- Navigating and scrolling through them
- Viewing the hex values in various different formats
- Simple editing with undo + redo support

![Navigating a file](hex-editor.gif)

![Editing a file](hex-editor-editing.gif)

## Requirements

- Visual Studio Code 1.46+

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

- Revert file command doesn't work ([#55](https://github.com/microsoft/vscode-hexeditor/issues/55))

To track all issues / file a new issue please go to the Github repo https://github.com/microsoft/vscode-hexeditor/issues

## Release Notes

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

-----------------------------------------------------------------------------------------------------------

## Code of Conduct
https://opensource.microsoft.com/codeofconduct
