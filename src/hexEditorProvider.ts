// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import { ExtensionHostMessageHandler, FromWebviewMessage, MessageHandler, MessageType, ToWebviewMessage } from "../shared/protocol";
import { DataInspectorView } from "./dataInspectorView";
import { disposeAll } from "./dispose";
import { HexDocument } from "./hexDocument";
import { SearchResults } from "./searchRequest";
import { getNonce } from "./util";
import { WebviewCollection } from "./webViewCollection";

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
		const document = await HexDocument.create(uri, openContext, this._telemetryReporter);
		const listeners: vscode.Disposable[] = [];

		listeners.push(document.onDidChange(e => {
			// Tell VS Code that the document has been edited by the user.
			this._onDidChangeCustomDocument.fire({
				document,
				...e,
			});
		}));

		listeners.push(document.onDidChangeContent(() => {
			// Update all webviews when the document changes
			for (const { messaging } of this.webviews.get(document.uri)) {
				messaging.sendEvent({ type: MessageType.Changed });
			}
		}));

		const watcher = vscode.workspace.createFileSystemWatcher(uri.fsPath);
		listeners.push(watcher);
		listeners.push(watcher.onDidChange(e => {
			if (e.fsPath === uri.fsPath) {
				if (document.isUnsaved) {
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
		const messageHandler: ExtensionHostMessageHandler = new MessageHandler(
			message => this.onMessage(document, message),
			message => webviewPanel.webview.postMessage(message),
		);

		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, messageHandler, webviewPanel);
		HexEditorProvider.currentWebview = webviewPanel.webview;

		// Set the hex editor activity panel to be visible
		vscode.commands.executeCommand("setContext", "hexEditor:openEditor", true);
		this._dataInspectorView.show({
			autoReveal: true
		});

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
		// Detects when the webview changes visibility to update the activity bar accordingly
		webviewPanel.onDidChangeViewState(e => {
			vscode.commands.executeCommand("setContext", "hexEditor:openEditor", e.webviewPanel.visible);
			if (e.webviewPanel.visible) {
				HexEditorProvider.currentWebview = e.webviewPanel.webview;
				this._dataInspectorView.show({
					autoReveal: true,
					forceFocus: true
				});
			} else {
				HexEditorProvider.currentWebview = undefined;
			}
		});

		webviewPanel.webview.onDidReceiveMessage(e => messageHandler.handleMessage(e));
	}

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<HexDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	public saveCustomDocument(document: HexDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		// Update all webviews that a save has just occured
		for (const { messaging } of this.webviews.get(document.uri)) {
			messaging.sendEvent({ type: MessageType.Saved });
		}
		return document.save(cancellation);
	}

	public saveCustomDocumentAs(document: HexDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.saveAs(destination, cancellation);
	}

	public revertCustomDocument(document: HexDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.revert(cancellation);
	}

	public backupCustomDocument(document: HexDocument, context: vscode.CustomDocumentBackupContext, _cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		return document.backup(context.destination);
	}

	/**
	   * Get the static HTML used for in our editor's webviews.
	  */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Convert the styles and scripts for the webview into webview URIs
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "editor.js"));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "hexEdit.css"));
		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "node_modules", "@vscode", "codicons", "dist", "codicon.css"));

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
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

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
			<div class="header" aria-hidden="true">00000000</div>
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

	private async onMessage(document: HexDocument, message: FromWebviewMessage): Promise<undefined | ToWebviewMessage> {
		switch (message.type) {
			// If it's a packet request
			case MessageType.ReadyRequest:
				return {
					type: MessageType.ReadyResponse,
					initialOffset: document.baseAddress,
					fileSize: await document.size(),
					isLargeFile: document.isLargeFile,
				};
			case MessageType.ReadRangeRequest:
				const data = await document.readBufferWithEdits(message.offset, message.bytes);
				return { type: MessageType.ReadRangeResponse, data: data.buffer };
			case MessageType.MakeEdits:
				document.makeEdit(message.edits);
				return;
			case MessageType.CancelSearch:
				document.searchProvider.cancelRequest();
				return;
			case MessageType.SearchRequest:
				let results: SearchResults;
				if (message.searchType === "ascii") {
					results = await document.searchProvider.createNewRequest().textSearch(message.query, message.options);
				} else {
					results = await document.searchProvider.createNewRequest().hexSearch(message.query as any);
				}
				return { type: MessageType.SearchResponse, results };
			case MessageType.ReplaceRequest:
				const edits = await document.replace(message.query, message.offsets, message.preserveCase);
				return { type: MessageType.ReplaceResponse, edits };
			case MessageType.DataInspector:
				// This message was meant for the data inspector view so we forward it there
				this._dataInspectorView.handleEditorMessage(message.body);
		}
	}
}

