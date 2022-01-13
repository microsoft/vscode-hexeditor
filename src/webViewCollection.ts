// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { ExtensionHostMessageHandler } from "../shared/protocol";
/**
 * Tracks all webviews.
 */
export class WebviewCollection {

	private readonly _webviews = new Set<{
		readonly resource: string;
		readonly messaging: ExtensionHostMessageHandler,
		readonly webviewPanel: vscode.WebviewPanel;
	}>();

	/**
	 * Get all known webviews for a given uri.
	 */
	public *get(uri: vscode.Uri): Iterable<{ webviewPanel: vscode.WebviewPanel, messaging: ExtensionHostMessageHandler }> {
		const key = uri.toString();
		for (const entry of this._webviews) {
			if (entry.resource === key) {
				yield entry;
			}
		}
	}

	/**
	 * Add a new webview to the collection.
	 */
	public add(uri: vscode.Uri, messaging: ExtensionHostMessageHandler, webviewPanel: vscode.WebviewPanel): void {
		const entry = { resource: uri.toString(), messaging, webviewPanel };
		this._webviews.add(entry);

		webviewPanel.onDidDispose(() => {
			this._webviews.delete(entry);
		});
	}
}
