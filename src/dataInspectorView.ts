// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { getNonce } from "./util";

export class DataInspectorView implements vscode.WebviewViewProvider {
  public static readonly viewType = "hexEditor.dataInpsectorView";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionURI: vscode.Uri) {}
  
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionURI
      ]
    };
    webviewView.webview.html = this._getWebviewHTML(webviewView.webview);
    // Message handler for when the data inspector view sends messages back to the ext host
    webviewView.webview.onDidReceiveMessage(data => console.log(data));
  }

  /**
   * @description This is where all the messages from the editor enter the view provider
   * @param message The message from the main editor window
   */
  public handleEditorMessage(message: any): void {
    console.log(message);
    this._view?.webview.postMessage(message);
  }

  private _getWebviewHTML(webview: vscode.Webview): string {
    const scriptURI = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionURI, "dist", "inspector.js"));
    const styleURI = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionURI, "dist", "inspector.css"));
    const nonce = getNonce();
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <!--
                Use a content security policy to only allow loading images from https or from our extension directory,
                and only allow scripts that have a specific nonce.
              -->
              <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <link href="${styleURI}" rel="stylesheet">
              
              <title>Data Inspector</title>
            </head>
            <body>
              <div id="data-inspector">
              <div class="header">DATA INSPECTOR</div>
                <div class="grid-container">
                  <div class="grid-item">
                    <label for="binary8">8 bit Binary</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="binary8" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="int8">Int8</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="int8" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="uint8">UInt8</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="uint8" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="int16">Int16</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="int16" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="uint16">UInt16</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="uint16" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="int24">Int24</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="int24" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="uint24">UInt24</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="uint24" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="int32">Int32</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="int32" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="uint32">UInt32</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="uint32" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="int64">Int64</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="int64" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="uint64">UInt64</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="uint64" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="utf8">UTF-8</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="utf8" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="utf16">UTF-16</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="utf16" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="float32">Float 32</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="float32" readonly/>
                  </div>
                  <div class="grid-item">
                    <label for="float64">Float 64</label>
                  </div>
                  <div class="grid-item">
                    <input type="text" autocomplete="off" spellcheck="off" id="float64" readonly/>
                  </div>
                  <div class="grid-item endian-select">
                    <label for="endianness">Endianness</label>
                  </div>
                  <div class="grid-item endian-select">
                    <select id="endianness">
                      <option value="little">Little Endian</option>
                      <option value="big">Big Endian</option>
                    </select>
                  </div>
                </div>
              </div>
              <script nonce="${nonce}" src="${scriptURI}"></script>
            </body>
            </html>`;
  }
}