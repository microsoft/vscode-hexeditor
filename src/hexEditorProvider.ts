// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import TelemetryReporter from "@vscode/extension-telemetry";
import * as base64 from "js-base64";
import * as vscode from "vscode";
import { HexDocumentEditReference } from "../shared/hexDocumentModel";
import { Endianness, ExtensionHostMessageHandler, FromWebviewMessage, IEditorSettings, InspectorLocation, MessageHandler, MessageType, PasteMode, ToWebviewMessage } from "../shared/protocol";
import { deserializeEdits, serializeEdits } from "../shared/serialization";
import { DataInspectorView } from "./dataInspectorView";
import { disposeAll } from "./dispose";
import { HexDocument } from "./hexDocument";
import { ISearchRequest, LiteralSearchRequest, RegexSearchRequest } from "./searchRequest";
import { flattenBuffers, getCorrectArrayBuffer, randomString } from "./util";
import { WebviewCollection } from "./webViewCollection";

const defaultEditorSettings: Readonly<IEditorSettings> = {
	columnWidth: 16,
	showDecodedText: true,
	defaultEndianness: Endianness.Little,
	inspectorType: InspectorLocation.Aside,
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
		const { document, accessor } = await HexDocument.create(uri, openContext, this._telemetryReporter);
		const disposables: vscode.Disposable[] = [];

		disposables.push(document.onDidRevert(async () => {
			const replaceFileSize = await document.size() ?? null;
			for (const { messaging } of this.webviews.get(document.uri)) {
				messaging.sendEvent({ type: MessageType.SetEdits, edits: { edits: [], data: new Uint8Array() }, replaceFileSize });
				messaging.sendEvent({ type: MessageType.ReloadFromDisk });
			}
		}));

		const onDidChange = async () => {
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
		};

		const onDidDelete = () => {
			vscode.window.showWarningMessage("This file has been deleted! Saving now will create a new file on disk.", "Overwrite", "Close Editor").then((response) => {
				if (response === "Overwrite") {
					vscode.commands.executeCommand("workbench.action.files.save");
				} else if (response === "Close Editor") {
					vscode.commands.executeCommand("workbench.action.closeActiveEditor");
				}
			});
		};

		disposables.push(accessor.watch(onDidChange, onDidDelete));

		document.onDidDispose(() => {
			// Make the hex editor panel hidden since we're disposing of the webview
			vscode.commands.executeCommand("setContext", "hexEditor:showSidebarInspector", false);
			vscode.commands.executeCommand("setContext", "hexEditor:isActive", false);
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
		vscode.commands.executeCommand("setContext", "hexEditor:isActive", true);
		const showSidebarInspector = vscode.workspace.getConfiguration("hexeditor").get("inspectorType") === InspectorLocation.Sidebar;
		if (showSidebarInspector) {
			vscode.commands.executeCommand("setContext", "hexEditor:showSidebarInspector", true);
			this._dataInspectorView.show({
				autoReveal: true
			});
		}

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
		// Detects when the webview changes visibility to update the activity bar accordingly
		webviewPanel.onDidChangeViewState(e => {
			vscode.commands.executeCommand("setContext", "hexEditor:isActive", e.webviewPanel.visible);
			vscode.commands.executeCommand("setContext", "hexEditor:showSidebarInspector", showSidebarInspector && e.webviewPanel.visible);
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
					pageSize: document.pageSize,
					isLargeFile: document.isLargeFile,
					isReadonly: document.isReadonly,
				};
			case MessageType.ReadRangeRequest:
				const data = await document.readBuffer(message.offset, message.bytes);
				return { type: MessageType.ReadRangeResponse, data: getCorrectArrayBuffer(data) };
			case MessageType.MakeEdits:
				this.publishEdit(messaging, document, document.makeEdits(deserializeEdits(message.edits)));
				return;
			case MessageType.DoPaste:
				this.publishEdit(
					messaging,
					document,
					message.mode === PasteMode.Insert
						? document.insert(message.offset, message.data)
						: await document.replace(message.offset, message.data)
				);
				messaging.sendEvent({ type: MessageType.SetEdits, edits: serializeEdits(document.edits) });
				return;
			case MessageType.DoCopy: {
				const parts = await Promise.all(message.selections.sort((a, b) => a[0] - b[0]).map(s => document.readBuffer(s[0], s[1] - s[0])));
				const flatParts = flattenBuffers(parts);
				const encoded = message.asText ? new TextDecoder().decode(flatParts) : base64.fromUint8Array(flatParts);
				vscode.env.clipboard.writeText(encoded);
				return;
			}
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

	private publishEdit(messaging: ExtensionHostMessageHandler, document: HexDocument, ref: HexDocumentEditReference) {
		this._onDidChangeCustomDocument.fire({
			document,
			undo: () => messaging.sendEvent({ type: MessageType.SetEdits, edits: serializeEdits(ref.undo()) }),
			redo: () => messaging.sendEvent({ type: MessageType.SetEdits, edits: serializeEdits(ref.redo()) }),
		});
	}
}

