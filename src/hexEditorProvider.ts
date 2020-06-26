// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { HexDocument, HexDocumentEdits } from "./hexDocument";
import { disposeAll } from "./dispose";
import { WebviewCollection } from "./webViewCollection";
import path = require("path");
import { getNonce } from "./util";
import TelemetryReporter from "vscode-extension-telemetry";

interface PacketRequest {
	initialOffset: number;
	numElements: number;
}

export class HexEditorProvider implements vscode.CustomEditorProvider<HexDocument> {
    public static register(context: vscode.ExtensionContext, telemetryReporter: TelemetryReporter): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider(
            HexEditorProvider.viewType,
            new HexEditorProvider(context, telemetryReporter),
            {
                supportsMultipleEditorsPerDocument: false
            }
        ); 
    }

    private static readonly viewType = "hexEditor.hexedit";

    private readonly webviews = new WebviewCollection();

    constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _telemetryReporter: TelemetryReporter
    ) { }
    
    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<HexDocument> {
        const document = await HexDocument.create(uri, openContext.backupId, this._telemetryReporter);
        // We don't need any listeners right now because the document is readonly, but this will help to have when we enable edits
		const listeners: vscode.Disposable[] = [];
		
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
					type: e.type,
					edits: e.edits,
					content: e.content,
				});
			}
		}));

        document.onDidDispose(() => disposeAll(listeners));

        return document;
    }

    async resolveCustomEditor(
		document: HexDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(webviewPanel, document, e));

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e => {
			if (e.type === "ready") {
				this.postMessage(webviewPanel, "init", {
					fileSize: document.filesize,
					html: document.documentData.length !== 0 ? this.getBodyHTML() : undefined
				});
			}
		});

		webviewPanel.webview.onDidReceiveMessage(async e => {
			if (e.type == "open-anyways") {
				await document.openAnyways();
				this.postMessage(webviewPanel, "init", {
					fileSize: document.filesize,
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
	 * Document size is needed to decide if the document is being opened
	*/
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Local path to script and css for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.file(
			path.join(this._context.extensionPath, "dist", "bundle.js")
		));
		const styleUri = webview.asWebviewUri(vscode.Uri.file(
			path.join(this._context.extensionPath, "dist", "hexEdit.css")
		));

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
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

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
		<div class="column" id="data-inspector">
			<div class="header">Data Inspector</div>
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
		<div class="column left">
			<div class="header">Memory Offset </div>
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
				<div class="header">Decoded Text</div>
				<div class="rowwrapper" id="ascii">
				</div>
			</div>
			<div id="scrollbar">
				<div role="scrollbar" id="scroll-thumb">
				</div>
			</div>
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

	private onMessage(panel: vscode.WebviewPanel, document: HexDocument, message: any): void {
		switch(message.type) {
			// If it's a packet request
			case "packet":
				const request = message.body as PacketRequest;
				// Return the data requested and the offset it was requested for
				const packet = Array.from(document.documentData.slice(request.initialOffset, request.initialOffset + request.numElements));
				const edits: HexDocumentEdits[] = [];
				document.unsavedEdits.forEach((edit) => {
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
					data: packet,
					offset: request.initialOffset,
					edits: edits
				} });
				return;
			case "edit":
				document.makeEdit(message.body);
				// We respond with the size of the file so that the webview is always in sync with the ext host
				panel.webview.postMessage({ type: "edit", requestId: message.requestId, body: {
					fileSize: document.filesize
				} });
				return;
		}
	}
}

