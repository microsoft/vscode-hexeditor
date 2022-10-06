## Release Notes

## 1.9.9 - October 6, 2022
- Fixed a bug where the custom and native selection could be shown at the same time in the main hex view
- Binary type added to data inspector, thanks to [@jwr12135 via #370](https://github.com/microsoft/vscode-hexeditor/pull/370)

## 1.9.8 - July 28, 2022
- Fixed bug causing binary search to be incorrect, thanks to [@varblane via #367](https://github.com/microsoft/vscode-hexeditor/pull/367)
- Open active file in Hex Editor now works with non text editors

## 1.9.7 - June 15, 2022
- Fixed bug causing bytes at page boundaries to be incorrect
- Fixed data overlapping in the data inspector

## 1.9.6 - April 21, 2022
- Fixed go to offset not working correctly
- Changed default decoding of decoded text to ASCII

## 1.9.5 - February 18, 2022
- Data inspector location is now cofnigurable via the `hexeditor.inspectorType` setting.

## 1.9.4 - January 27, 2022
- Fixed bug with copy and paste not working

## 1.9.3 - January 13, 2022

- Files of any size can now be opened without issue (when operating locally)
- Find menu has been improved and aligns better with the VS Code UI
- Layout columns and decoded text views are now configurable
- Support viewing and editing memory of programs debugged in VS Code

## 1.8.2 - July 27, 2021
- Fix web compatibility due to incorrect bundle format

## 1.8.1 - July 26, 2021
- Even smaller bundle size
- Upgrade telemetry module for transparent telemetry logging in output channel

## 1.8.0 - July 22, 2021
- Fix bug preventing opening of large files
- Switch from webpack -> esbuild
- Reduce bundle size
- Fix file watcher on non file path files

## 1.7.1 - June 18, 2021
- Fix bug preventing search from working

## 1.7.0 - June 4, 2021
- Support virtual workspaces
- Support untrusted workspaces
- Fixed invalid content security policy preventing codicon loading
- Updated to latest node modules

## 1.6.0 - April 28, 2021
- Improved find widget UI
- Fix scaling issues with larger font sizes
- Adoption of workspace trust API
- Fixed bug regarding place holder characters, thanks to [@whpac via #282](https://github.com/microsoft/vscode-hexeditor/pull/282)

## 1.5.0 - April 5, 2021
- Better trackpad scrolling
- New hex editor panel icon
- Tidying up of data inspector UI
- Additional setting to define default endianness, thanks to [@natecraddock via #215](https://github.com/microsoft/vscode-hexeditor/pull/215)

## 1.4.0 - February 4, 2021
- Move data inspector to its own hex panel
- Restyle search to look more like the normal VS Code widget
- Add preliminary support for untitled files
- Fixed a bug with selections not updating the data inspector

## 1.3.0 — September 8, 2020
- Allow extensions to configure the starting address for a file. See https://github.com/microsoft/vscode-hexeditor/pull/170 for details.

## 1.2.0 — July 23, 2020
- Simple File Watching implementation, editor will now respond to changes on disk outside of editor
- Support for copy and paste
- Support for Find with text regex, and hex wildcards (i.e FF ?? EE)
- Support for multi select, along with drag, drop, and keyboard selection improvements thank to [@jeanp413 via #92](https://github.com/microsoft/vscode-hexeditor/pull/92) for helping with that
- Fixed a bug with num pad not working inside the hex editor
- Fixed a bug with incorrect UTF-8 decoding inside the data inspector

## 1.1.0 — June 30, 2020
- Added simple editing support for hex and decoded text
- Fixed a bug preventing files over 18MB from being opened
- Added more keyboard navigation support via Pgup, Pgdown, Ctrl + End/Home, and End/Home.
- Fixed a bug with empty files not rendering correctly
- Scroll position is now retained upon switching tabs

## 1.0.1 — June 11, 2020
- Add instructions to the README on how to use the extension
- Add an Open with HexEditor command

## 1.0.0 — June 8, 2020
- Hex Editor initial release
