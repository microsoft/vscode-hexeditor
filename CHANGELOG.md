## Release Notes

## 1.11.1 - November 2, 2024

- Add a setting to configure the default "Copy As..." format, thanks to [@Antecer via #540](https://github.com/microsoft/vscode-hexeditor/pull/540)
- Fix a display issue causing a blank editor [@Hexa3333 via #548](https://github.com/microsoft/vscode-hexeditor/pull/548)

## 1.11.0 - November 1, 2024

- Fix: ctrl+g scroll state being lost when restoring editor [#545](https://github.com/microsoft/vscode-hexeditor/pull/545)
- Fix: retain selection state when restoring webview [#544](https://github.com/microsoft/vscode-hexeditor/pull/544)
- Fix: not able to edit empty files [#543](https://github.com/microsoft/vscode-hexeditor/pull/543)
- Fix: correctly show big-endian utf-16 chars [#542](https://github.com/microsoft/vscode-hexeditor/pull/542)
- Add an experimental diff mode for the hex editor, thanks to [@tomilho via #522](https://github.com/microsoft/vscode-hexeditor/pull/522)
- Add a "Copy As..." action, thanks to [@lorsanta via #498](https://github.com/microsoft/vscode-hexeditor/pull/498)
- Add a UUID/GUID mode in the data inspector, thanks to [@jogo- via #500](https://github.com/microsoft/vscode-hexeditor/pull/500)

## 1.10.0 - April 22, 2024

- Fix bug in saving of restored editors, thanks to [@tomilho via #513](https://github.com/microsoft/vscode-hexeditor/pull/513)
- Add hovered byte status bar entry, thanks to [@tomilho via #502](https://github.com/microsoft/vscode-hexeditor/pull/502)
- Add insert mode, thanks to [@tomilho via #503](https://github.com/microsoft/vscode-hexeditor/pull/503)

## 1.9.14 - February 22, 2024
- Add ULEB128 and SLEB128 support in data inspector, thanks to [@jogo- via #488](https://github.com/microsoft/vscode-hexeditor/pull/488)
- Add display of status offset and selection count in hexadecimal, thanks to [@jogo- via #486](https://github.com/microsoft/vscode-hexeditor/pull/486)
- Add ASCII character in data inspector, thanks to [@jogo- via #483](https://github.com/microsoft/vscode-hexeditor/pull/483)
- Fix order of unsigned before signed int64 in data inspector, thanks to [@jogo- via #482](https://github.com/microsoft/vscode-hexeditor/pull/482)

## 1.9.13 - February 2, 2024
- Fix plugin description, thanks to [@deitry via #480](https://github.com/microsoft/vscode-hexeditor/pull/480)
- Fix listener leak when closing files
- Fix close hex editors when corresponding files are deleted
- Fix regex in binary files by using ascii for regex matches
- Fix re-run search if a file is reloaded from disk
- Add Localization to this extension using the Localization pipeline
- Fix slight selection bugs
- Fix improve range selection logic, support delete
- Add select between offsets feature, thanks to [@IngilizAdam via #470](https://github.com/microsoft/vscode-hexeditor/pull/470)
- Add common cjk encoding support in data inspector, thanks to [@liudonghua123 via #465](https://github.com/microsoft/vscode-hexeditor/pull/465)
- Fix dispose all disposables in openCustomDocument, thanks to [@lorsanta via #453](https://github.com/microsoft/vscode-hexeditor/pull/453)
- Add float16 and bfloat16 support in data inspector, thanks to [@lorsanta via #451](https://github.com/microsoft/vscode-hexeditor/pull/451)

## 1.9.12 - July 27, 2023
- Fix the selection count now updated when switching between tab groups, thanks to [@lorsanta via #449](https://github.com/microsoft/vscode-hexeditor/pull/449)
- Fix scrolling to the top when hit home key, thanks to [@lorsanta via #448](https://github.com/microsoft/vscode-hexeditor/pull/448)
- Fix editor failing to open read-only files, thanks to [@tomilho via #437](https://github.com/microsoft/vscode-hexeditor/pull/437)

## 1.9.11 - January 25, 2023
- Octal representation of the selected byte in the data inspector, thanks to [@brabli via #410](https://github.com/microsoft/vscode-hexeditor/pull/410)

## 1.9.10 - January 4, 2023
- Add a badge indicating offset and selection size, thanks to [@MoralCode via #401](https://github.com/microsoft/vscode-hexeditor/pull/401)
- Used a smaller page size when requesting debug memory
- Fixed many selection bugs
- Improved scroll/display performance
- Made a change to respect `editor.scrollBeyondLastLine`
- Aligned loading indicator style to match the rest of VS Code

## 1.9.9 - October 6, 2022
- Fixed a bug where the custom and native selection could be shown at the same time in the main hex view
- Binary type added to data inspector, thanks to [@jwr12135 via #370](https://github.com/microsoft/vscode-hexeditor/pull/370)

## 1.9.8 - July 28, 2022
- Fixed bug causing binary search to be incorrect, thanks to [@varblane via #367](https://github.com/microsoft/vscode-hexeditor/pull/367)
- Open active file in Hex Editor now works with non-text editors

## 1.9.7 - June 15, 2022
- Fixed bug causing bytes at page boundaries to be incorrect
- Fixed data overlapping in the data inspector

## 1.9.6 - April 21, 2022
- Fixed go to offset not working correctly
- Changed default decoding of decoded text to ASCII

## 1.9.5 - February 18, 2022
- Data inspector location is now configurable via the `hexeditor.inspectorType` setting.

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
- Fix file watcher on non-file path files

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

## 1.3.0 - September 8, 2020
- Allow extensions to configure the starting address for a file. See https://github.com/microsoft/vscode-hexeditor/pull/170 for details.

## 1.2.0 - July 23, 2020
- Simple File Watching implementation, editor will now respond to changes on disk outside of editor
- Support for copy and paste
- Support for Find with text regex, and hex wildcards (i.e FF ?? EE)
- Support for multi select, along with drag, drop, and keyboard selection improvements thank to [@jeanp413 via #92](https://github.com/microsoft/vscode-hexeditor/pull/92) for helping with that
- Fixed a bug with num pad not working inside the hex editor
- Fixed a bug with incorrect UTF-8 decoding inside the data inspector

## 1.1.0 - June 30, 2020
- Added simple editing support for hex and decoded text
- Fixed a bug preventing files over 18MB from being opened
- Added more keyboard navigation support via PgUp, PgDown, Ctrl + End/Home, and End/Home.
- Fixed a bug with empty files not rendering correctly
- Scroll position is now retained upon switching tabs

## 1.0.1 - June 11, 2020
- Add instructions to the README on how to use the extension
- Add an Open with HexEditor command

## 1.0.0 - June 8, 2020
- Hex Editor initial release
