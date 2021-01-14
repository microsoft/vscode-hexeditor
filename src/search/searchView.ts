// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import path = require("path");
import * as vscode from "vscode";
import { getNonce } from "../util";

export class SearchView implements vscode.WebviewViewProvider {
  public static readonly viewType = "hexEditor.searchView";
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
    webviewView.webview.onDidReceiveMessage(data => {
      if (data.type === "ready") this.show();
    });

    // Once the view is disposed of we don't want to keep a reference to it anymore
    this._view.onDidDispose(() => this._view = undefined);
  }

  /**
   * @description This is where all the messages from the editor enter the view provider
   * @param message The message from the main editor window
   */
  public handleEditorMessage(message: any): void {
    this._view?.webview.postMessage(message);
  }

  /**
   * @description Function to reveal the view panel
   * @param forceFocus Whether or not to force focus of the panel
   */
  public show(forceFocus?: boolean): void {
    // if (this._view && !forceFocus) {
    //   this._view.show();
    // } else {
    //   vscode.commands.executeCommand(`${SearchView.viewType}.focus`);
    // }
  }

  private _getWebviewHTML(webview: vscode.Webview): string {
    const scriptURI = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionURI, "dist", "search.js"));
    const styleURI = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionURI, "dist", "search.css"));
    // const codiconsUri = webview.asWebviewUri(vscode.Uri.file(
		// 	path.join(this._extensionURI.fsPath, "node_modules", "vscode-codicons", "dist", "codicon.css")
		// ));
		
		// const codiconsFontUri = webview.asWebviewUri(vscode.Uri.file(
		// 	path.join(this._extensionURI.fsPath, "node_modules", "vscode-codicons", "dist", "codicon.ttf")
		// ));
    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionURI, "node_modules", "vscode-codicons", "dist", "codicon.css"));
		const codiconsFontUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionURI, "node_modules", "vscode-codicons", "dist", "codicon.ttf"));
    
    const nonce = getNonce();
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <!--
                Use a content security policy to only allow loading images from https or from our extension directory,
                and only allow scripts that have a specific nonce.
              -->
              <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; font-src ${codiconsFontUri}; style-src ${webview.cspSource} ${codiconsUri}; script-src 'nonce-${nonce}';">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <link href="${codiconsUri}" rel="stylesheet" />
              <link href="${styleURI}" rel="stylesheet">
              
              <title>Search Widget</title>
            </head>
            <body>
              <div id="search-container">
                <div class="header">
                  SEARCH IN
                  <span>
                    <select id="data-type" class="inline-select">
                      <option value="hex">Hex</option>
                      <option value="ascii">Text</option>
                    </select>
                  </span>
                </div>
                <div class="search-widget">
                  <div class="bar find-bar">
                    <span class="input-glyph-group">
                      <input type="text" autocomplete="off" spellcheck="off" name="find" id="find" placeholder="Find"/>
                      <span class="bar-glyphs">
                        <span class="codicon codicon-case-sensitive" id="case-sensitive" title="Match Case"></span>
                        <span class="codicon codicon-regex" id="regex-icon" title="Use Regular Expression"></span>
                      </span>
                      <div id="find-message-box">
                      </div>
                    </span>
                    <span class="icon-group">
                      <span class="codicon codicon-search-stop disabled" id="search-stop" title="Cancel Search"></span>
                      <span class="codicon codicon-arrow-up disabled" id="find-previous" title="Previous Match"></span>
                      <span class="codicon codicon-arrow-down disabled" id="find-next" title="Next Match"></span>
                    </span>
                  </div>
                  <div class="bar replace-bar">
                    <span class="input-glyph-group">
                      <input type="text" autocomplete="off" spellcheck="off" name="replace" id="replace" placeholder="Replace"/>
                      <span class="bar-glyphs">
                        <span class="codicon codicon-preserve-case" id="preserve-case" title="Preserve Case"></span>
                      </span>
                      <div id="replace-message-box">
                        </div>
                    </span>
                    <span class="icon-group">
                      <span class="codicon codicon-replace disabled" id="replace-btn" title="Replace"></span>
                      <span class="codicon codicon-replace-all disabled" id="replace-all" title="Replace All"></span>
                    </span>
                  </div>
                </div>
              </div>
              <script nonce="${nonce}" src="${scriptURI}"></script>
            </body>
            </html>`;
  }
}