// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { HexDocument, HexDocumentEdit } from "./hexDocument";
import { disposeAll } from "./dispose";
import { WebviewCollection } from "./webViewCollection";
import { getNonce } from "./util";
import TelemetryReporter from "vscode-extension-telemetry";
import { SearchResults } from "./searchRequest";
import { DataInspectorView } from "./dataInspectorView";

interface PacketRequest {
	initialOffset: number;
	numElements: number;
}

export class HexEditorProvider implements vscode.CustomEditorProvider<HexDocument> {
    public static register(context: vscode.ExtensionContext, telemetryReporter: TelemetryReporter, dataInspectorView: DataInspectorView): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider(
            HexEditorProvider.viewType,
            new HexEditorProvider(context, telemetryReporter, dataInspectorView),
            {
                supportsMultipleEditorsPerDocument: false
            }
        ); 
    }

    private static readonly viewType = "hexEditor.hexedit";
		public static currentWebview?: vscode.Webview;

    private readonly webviews = new WebviewCollection();

    constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _telemetryReporter: TelemetryReporter,
		private readonly _dataInspectorView: DataInspectorView
    ) { }
    
    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
		_token: vscode.CancellationToken
    ): Promise<HexDocument> {
    const document = await HexDocument.create(uri, openContext.backupId, this._telemetryReporter);
		const listeners: vscode.Disposable[] = [];
		// Set the hex editor activity panel to be visible
		vscode.commands.executeCommand("setContext", "hexEditor:openEditor", true);
		this._dataInspectorView.show();
		listeners.push(document.onDidChange(e => {
			// Tell VS Code that the document has been edited by the user.
			this._onDidChangeCustomDocument.fire({
				document,
				...e,
			});
		}));

		listeners.push(document.onDidChangeContent(e => {
			// Update all webviews when the document changes
			for (const webviewPanel of this.webviews.get(document.uri)) {
				this.postMessage(webviewPanel, "update", {
					fileSize: e.fileSize,
					baseAddress: e.baseAddress,
					type: e.type,
					edits: e.edits
				});
			}
		}));

		const watcher = vscode.workspace.createFileSystemWatcher(uri.fsPath); 
		listeners.push(watcher);
		listeners.push(watcher.onDidChange(e => {
			if (e.toString() === uri.toString()) {
				if (document.unsavedEdits.length > 0) {
					const message = "This file has changed on disk, but you have unsaved changes. Saving now will overwrite the file on disk with your changes.";
					vscode.window.showWarningMessage(message, "Overwrite", "Revert").then((selected) => {
						if (selected === "Overwrite") {
							vscode.commands.executeCommand("workbench.action.files.save");
						} else if (selected === "Revert") {
							vscode.commands.executeCommand("workbench.action.files.revert");
						}
					});
				} else {
					// If we executed a save recently the change was probably caused by us
					// we shouldn't trigger a revert to resync the document as it is already sync
					const recentlySaved = Date.now() - document.lastSave < 500;
					if (!recentlySaved) {
						document.revert();
					}
				}
			}
		}));
		listeners.push(watcher.onDidDelete(e => {
			if (e.toString() === uri.toString()) { 
				vscode.window.showWarningMessage("This file has been deleted! Saving now will create a new file on disk.", "Overwrite", "Close Editor").then((response) => {
					if (response === "Overwrite") {
						vscode.commands.executeCommand("workbench.action.files.save");
					} else if (response === "Close Editor") {
						vscode.commands.executeCommand("workbench.action.closeActiveEditor");
					}
				});
			}
		}));

      document.onDidDispose(() => {
				// Make the hex editor panel hidden since we're disposing of the webview
				vscode.commands.executeCommand("setContext", "hexEditor:openEditor", false);
				disposeAll(listeners);
			});

        return document;
    }

    async resolveCustomEditor(
		document: HexDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);
		HexEditorProvider.currentWebview = webviewPanel.webview;

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
		// Detects when the webview changes visibility to update the activity bar accordingly
		webviewPanel.onDidChangeViewState(e => 	{
			vscode.commands.executeCommand("setContext", "hexEditor:openEditor", e.webviewPanel.visible);
			if (e.webviewPanel.visible) {
				HexEditorProvider.currentWebview = e.webviewPanel.webview;
				this._dataInspectorView.show(true);
			} else {
				HexEditorProvider.currentWebview = undefined;
			}
		});
		webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(webviewPanel, document, e));

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e => {
			if (e.type === "ready") {
				this.postMessage(webviewPanel, "init", {
					fileSize: document.filesize,
					baseAddress: document.baseAddress,
					html: document.documentData.length === document.filesize || document.unsavedEdits.length != 0 ? this.getBodyHTML() : undefined
				});
			}
		});

		webviewPanel.webview.onDidReceiveMessage(async e => {
			if (e.type == "open-anyways") {
				await document.openAnyways();
				this.postMessage(webviewPanel, "init", {
					fileSize: document.filesize,
					baseAddress: document.baseAddress,
					html: this.getBodyHTML()
				});
			}
		});
	}
	
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<HexDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	public saveCustomDocument(document: HexDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		// Update all webviews that a save has just occured
		for (const webviewPanel of this.webviews.get(document.uri)) {
			this.postMessage(webviewPanel, "save", {});
		}
		return document.save(cancellation);
	}

	public saveCustomDocumentAs(document: HexDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.saveAs(destination, cancellation);
	}

	public revertCustomDocument(document: HexDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.revert(cancellation);
	}

	public backupCustomDocument(document: HexDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		return document.backup(context.destination, cancellation);
	}

  /**
	 * Get the static HTML used for in our editor's webviews.
	*/
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Convert the styles and scripts for the webview into webview URIs
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "editor.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "hexEdit.css"));
		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "node_modules", "vscode-codicons", "dist", "codicon.css"));
		const codiconsFontUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "node_modules", "vscode-codicons", "dist", "codicon.ttf"));

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; font-src ${codiconsFontUri}; style-src ${webview.cspSource} ${codiconsUri}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleUri}" rel="stylesheet" />
				<link href="${codiconsUri}" rel="stylesheet" />
				<script nonce="${nonce}" src="${scriptUri}" defer></script>

				<title>Hex Editor</title>
			</head>
			<body>
			</body>
			</html>`;
	}

	private getBodyHTML(): string {
		return `
		<div class="column left">
			<div class="header">00000000</div>
			<div class="rowwrapper" id="hexaddr">
			</div>
		</div>
		<div id="editor-container">
			<div class="column middle">
				<div class="header">
					<span>00</span><span>01</span><span>02</span><span>03</span><span>04</span><span>05</span><span>06</span><span>07</span><span>08</span><span>09</span><span>0A</span><span>0B</span><span>0C</span><span>0D</span><span>0E</span><span>0F</span>
				</div>
				<div class="rowwrapper" id="hexbody">
				</div>
			</div>
			<div class="column right">
				<div class="header">DECODED TEXT</div>
				<div class="rowwrapper" id="ascii">
				</div>
			</div>
			<div id="scrollbar">
				<div role="scrollbar" id="scroll-thumb">
				</div>
			</div>
		</div>
		<div id="search-container">
		</div>
		`;
	}
	
    private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: any) => void>();

	private postMessageWithResponse<R = unknown>(panel: vscode.WebviewPanel, type: string, body: any): Promise<R> {
		const requestId = this._requestId++;
		const p = new Promise<R>(resolve => this._callbacks.set(requestId, resolve));
		panel.webview.postMessage({ type, requestId, body });
		return p;
	}

	private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
		panel.webview.postMessage({ type, body });
	}

	private async onMessage(panel: vscode.WebviewPanel, document: HexDocument, message: any): Promise<void> {
		switch(message.type) {
			// If it's a packet request
			case "packet":
				const request = message.body as PacketRequest;
				// Return the data requested and the offset it was requested for
				const packet = Array.from(document.documentData.slice(request.initialOffset, request.initialOffset + request.numElements));
				const edits: HexDocumentEdit[] = [];
				document.unsavedEdits.flat().forEach((edit) => {
					if (edit.offset >= request.initialOffset && edit.offset < request.initialOffset + request.numElements) {
						edits.push(edit);
						// If it wasn't in the document before we will add it to the disk contents
						if (edit.oldValue === undefined && edit.newValue !== undefined) {
							packet.push(edit.newValue);
						}
					}
				});
				panel.webview.postMessage({ type: "packet", requestId: message.requestId, body: {
					fileSize: document.filesize,
					baseAddress: document.baseAddress,
					data: packet,
					offset: request.initialOffset,
					edits: edits
				} });
				return;
			case "edit":
				document.makeEdit(message.body);
				// We respond with the size of the file so that the webview is always in sync with the ext host
				panel.webview.postMessage({ type: "edit", requestId: message.requestId, body: {
					fileSize: document.filesize,
					baseAddress: document.baseAddress,
				} });
				return;
			case "search":
				// If it's a cancellation request we notify the search provider we want to cancel
				if (message.body.cancel) {
					document.searchProvider.cancelRequest();
					return;
				}
				let results: SearchResults;
				if (message.body.type === "ascii") {
					results = await document.searchProvider.createNewRequest().textSearch(message.body.query, message.body.options);
				} else {
					results = await document.searchProvider.createNewRequest().hexSearch(message.body.query);
				}
				if (results !== undefined) {
					panel.webview.postMessage({ type: "search", requestId: message.requestId, body: {
						results: results
					} });
				}
				return;
			case "replace":
				// Trigger a replacement and send the new edits to the webview
				const replaced: HexDocumentEdit[] = document.replace(message.body.query, message.body.offsets, message.body.preserveCase);
				panel.webview.postMessage({ type: "replace", requestId: message.requestId, body: {
					edits: replaced
				} });
				return;
			case "dataInspector":
				// This message was meant for the data inspector view so we forward it there
				this._dataInspectorView.handleEditorMessage(message.body);
		}
	}
}

