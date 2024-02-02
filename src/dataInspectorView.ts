// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { InspectorLocation } from "../shared/protocol";
import { Disposable } from "./dispose";
import { HexEditorRegistry } from "./hexEditorRegistry";
import { randomString } from "./util";

export class DataInspectorView extends Disposable implements vscode.WebviewViewProvider {
	public static readonly viewType = "hexEditor.dataInspectorView";
	private _view?: vscode.WebviewView;
	private _lastMessage: unknown;

	constructor(
		private readonly _extensionURI: vscode.Uri,
		registry: HexEditorRegistry,
	) {
		super();
		this._register(
			registry.onDidChangeActiveDocument(doc => {
				const inspectorType = vscode.workspace.getConfiguration("hexeditor").get("inspectorType");
				const shouldShow = inspectorType === InspectorLocation.Sidebar && !!doc;

				vscode.commands.executeCommand("setContext", "hexEditor:showSidebarInspector", shouldShow);
				if (shouldShow) {
					this.show({ autoReveal: true });
				}
			}),
		);
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionURI],
		};
		webviewView.webview.html = this._getWebviewHTML(webviewView.webview);

		// Message handler for when the data inspector view sends messages back to the ext host
		webviewView.webview.onDidReceiveMessage(data => {
			if (data.type === "ready") webviewView.show();
		});

		// Once the view is disposed of we don't want to keep a reference to it anymore
		this._view.onDidDispose(() => (this._view = undefined));

		// If the webview just became visible we send it the last message so that it stays in sync
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible && this._lastMessage) {
				webviewView.webview.postMessage(this._lastMessage);
			}
		});

		// Send the last message to the inspector so it preserves state upon hiding and showing
		if (this._lastMessage) {
			webviewView.webview.postMessage(this._lastMessage);
		}
	}

	/**
	 * @description This is where all the messages from the editor enter the view provider
	 * @param message The message from the main editor window
	 */
	public handleEditorMessage(message: unknown): void {
		// We save the last message as the webview constantly gets disposed of, but the provider still receives messages
		this._lastMessage = message;
		this._view?.webview.postMessage(message);
	}

	/**
	 * @description Function to reveal the view panel
	 * @param forceFocus Whether or not to force focus of the panel
	 */
	public show(options?: { forceFocus?: boolean; autoReveal?: boolean }): void {
		// Don't reveal the panel if configured not to
		if (
			options?.autoReveal &&
			!vscode.workspace.getConfiguration("hexeditor.dataInspector").get("autoReveal", false)
		) {
			return;
		}

		if (this._view && !options?.forceFocus) {
			this._view.show();
		} else {
			vscode.commands.executeCommand(`${DataInspectorView.viewType}.focus`);
		}

		// We attempt to send the last message, this prevents the inspector from coming up blank
		if (this._lastMessage) {
			this._view?.webview.postMessage(this._lastMessage);
		}
	}

	private _getWebviewHTML(webview: vscode.Webview): string {
		const scriptURI = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionURI, "dist", "inspector.js"),
		);
		const styleURI = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionURI, "dist", "inspector.css"),
		);
		const endianness = vscode.workspace
			.getConfiguration()
			.get("hexeditor.defaultEndianness") as string;
		const nonce = randomString();
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
                <div class="grid-container">
									<!-- Input elements filled in by dataInspector.ts -->
                  <div class="grid-item endian-select">
                    <label for="endianness">Endianness</label>
                  </div>
                  <div class="grid-item endian-select">
                    <select id="endianness">
                      <option value="little" ${endianness === "little" ? "selected" : ""}>${vscode.l10n.t("Little Endian")}</option>
                      <option value="big" ${endianness === "big" ? "selected" : ""}>${vscode.l10n.t("Big Endian")}</option>
                    </select>
                  </div>
                </div>
              </div>
              <script nonce="${nonce}" src="${scriptURI}"></script>
            </body>
            </html>`;
	}
}
