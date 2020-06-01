# VS Code Hexeditor

**Note: This editor currently only supports reading, and not writing.**

This an extension for Visual Studio Code 1.4.6+ which utilizes the custom editor API to allow viewing files as hex within VS Code.

## Features

- Opening files as HEX
- Navigating and scrolling through them
- Viewing the hex values in various different formats

<!-- For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow. -->

## Requirements

- Visual Studio Code 1.4.6+

## Extension Settings

This extension contributes the following settings:

* `hexeditor.maxFileSize`: How many MB you want the editor to try to open before warning you with the open anyways message

## Known Issues

- [Files over 18 MB are corrupted at the bottom](https://github.com/microsoft/vscode-hexeditor/issues/3)

## Release Notes

### 1.0.0

Hex Editor initial release

-----------------------------------------------------------------------------------------------------------

## Code of Conduct
https://opensource.microsoft.com/codeofconduct