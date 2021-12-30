// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import { ExtensionHostMessageHandler, FromWebviewMessage, IEditorSettings, MessageHandler, MessageType, ToWebviewMessage } from "../shared/protocol";
import { deserializeEdits, serializeEdits } from "../shared/serialization";
import { DataInspectorView } from "./dataInspectorView";
import { disposeAll } from "./dispose";
import { HexDocument } from "./hexDocument";
import { ISearchRequest, LiteralSearchRequest, RegexSearchRequest } from "./searchRequest";
import { getCorrectArrayBuffer, randomString } from "./util";
import { WebviewCollection } from "./webViewCollection";

const defaultEditorSettings: Readonly<IEditorSettings> = {
	columnWidth: 16,
	showDecodedText: true,
};

const editorSettingsKeys = Object.keys(defaultEditorSettings) as readonly (keyof IEditorSettings)[];

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

	/** Currently-focused hex editor, if any. */
	public static currentWebview?: ExtensionHostMessageHandler;

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
		const disposables: vscode.Disposable[] = [];

		disposables.push(document.onDidRevert(() => {
			for (const { messaging } of this.webviews.get(document.uri)) {
				messaging.sendEvent({ type: MessageType.SetEdits, edits: { edits: [], data: new Uint8Array() } });
				messaging.sendEvent({ type: MessageType.ReloadFromDisk });
			}
		}));

		const watcher = vscode.workspace.createFileSystemWatcher(uri.fsPath);
		disposables.push(watcher);
		disposables.push(watcher.onDidChange(async e => {
			if (e.fsPath !== uri.fsPath) {
				return;
			}

			if (document.isSynced) {
				// If we executed a save recently the change was probably caused by us
				// we shouldn't trigger a revert to resync the document as it is already sync
				const recentlySaved = Date.now() - document.lastSave < 5_000;
				if (!recentlySaved) {
					document.revert();
				}
				return;
			}

			const message = "This file has changed on disk, but you have unsaved changes. Saving now will overwrite the file on disk with your changes.";
			const overwrite = "Overwrite";
			const revert = "Revert";
			const selected = await vscode.window.showWarningMessage(message, overwrite, revert);
			if (selected === overwrite) {
				vscode.commands.executeCommand("workbench.action.files.save");
			} else if (selected === "Revert") {
				vscode.commands.executeCommand("workbench.action.files.revert");
			}
		}));
		disposables.push(watcher.onDidDelete(e => {
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
			disposeAll(disposables);
		});

		return document;
	}

	async resolveCustomEditor(
		document: HexDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		const messageHandler: ExtensionHostMessageHandler = new MessageHandler(
			message => this.onMessage(messageHandler, document, message),
			message => webviewPanel.webview.postMessage(message),
		);

		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, messageHandler, webviewPanel);
		HexEditorProvider.currentWebview = messageHandler;

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
				HexEditorProvider.currentWebview = messageHandler;
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

	public async saveCustomDocument(document: HexDocument, cancellation: vscode.CancellationToken): Promise<void> {
		await document.save(cancellation);

		// Update all webviews that a save has just occured
		for (const { messaging } of this.webviews.get(document.uri)) {
			messaging.sendEvent({ type: MessageType.Saved, unsavedEditIndex: document.unsavedEditIndex });
		}
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
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "editor.css"));

		// Use a nonce to whitelist which scripts can be run
		const nonce = randomString();

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

	private readEditorSettings(): IEditorSettings {
		const config = vscode.workspace.getConfiguration("hexeditor");
		const settings: IEditorSettings = { ...defaultEditorSettings };
		for (const key of editorSettingsKeys) {
			if (config.has(key)) {
				(settings as any)[key] = config.get(key);
			}
		}
		return settings;
	}

	private writeEditorSettings(settings: IEditorSettings) {
		const config = vscode.workspace.getConfiguration("hexeditor");
		for (const key of editorSettingsKeys) {
			const existing = config.inspect(key);
			const target = !existing
				? vscode.ConfigurationTarget.Global
				: existing.workspaceFolderValue !== undefined
				? vscode.ConfigurationTarget.WorkspaceFolder
				: existing.workspaceValue !== undefined
				? vscode.ConfigurationTarget.Workspace
				: vscode.ConfigurationTarget.Global;
			config.update(key, settings[key], target);
		}
	}

	private async onMessage(
		messaging: ExtensionHostMessageHandler,
		document: HexDocument,
		message: FromWebviewMessage,
	): Promise<undefined | ToWebviewMessage> {
		switch (message.type) {
			// If it's a packet request
			case MessageType.ReadyRequest:
				return {
					type: MessageType.ReadyResponse,
					initialOffset: document.baseAddress,
					editorSettings: this.readEditorSettings(),
					edits: serializeEdits(document.edits),
					unsavedEditIndex: document.unsavedEditIndex,
					fileSize: await document.size(),
					isLargeFile: document.isLargeFile,
				};
			case MessageType.ReadRangeRequest:
				const data = await document.readBuffer(message.offset, message.bytes);
				return { type: MessageType.ReadRangeResponse, data: getCorrectArrayBuffer(data) };
			case MessageType.MakeEdits:
				const ref = document.makeEdits(deserializeEdits(message.edits));
				this._onDidChangeCustomDocument.fire({
					document,
					undo: () => messaging.sendEvent({ type: MessageType.SetEdits, edits: serializeEdits(ref.undo()) }),
					redo: () => messaging.sendEvent({ type: MessageType.SetEdits, edits: serializeEdits(ref.redo()) }),
				});
				return;
			case MessageType.CancelSearch:
				document.searchProvider.cancel();
				return;
			case MessageType.SearchRequest:
				let request: ISearchRequest;
				if ("re" in message.query) {
					request = new RegexSearchRequest(document, message.query, message.caseSensitive, message.cap);
				} else {
					request = new LiteralSearchRequest(document, message.query, message.caseSensitive, message.cap);
				}
				document.searchProvider.start(messaging, request);
				return;
			case MessageType.ClearDataInspector:
				this._dataInspectorView.handleEditorMessage({ method: "reset" });
				break;
			case MessageType.SetInspectByte:
				this._dataInspectorView.handleEditorMessage({
					method: "update",
					data: getCorrectArrayBuffer(await document.readBufferWithEdits(message.offset, 8))
				});
				break;
			case MessageType.UpdateEditorSettings:
				this.writeEditorSettings(message.editorSettings);
				break;
		}
	}
}

