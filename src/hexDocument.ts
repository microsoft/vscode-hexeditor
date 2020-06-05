// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Disposable } from "./dispose";
import { telemetryReporter } from "./extension";

interface HexDocumentDelegate {
    getFileData(): Promise<Uint8Array>;
}

export class HexDocument extends Disposable implements vscode.CustomDocument {
    static async create(
		uri: vscode.Uri,
		backupId: string | undefined,
		delegate: HexDocumentDelegate,
	): Promise<HexDocument | PromiseLike<HexDocument> > {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === "string" ? vscode.Uri.parse(backupId) : uri;
		const fileSize = (await vscode.workspace.fs.stat(dataFile)).size;
		/* __GDPR__
			"fileOpen" : {
				"fileSize" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			}
		*/
		telemetryReporter.sendTelemetryEvent("fileOpen", {}, { "fileSize": fileSize });
		let fileData: Uint8Array;
		const maxFileSize = (vscode.workspace.getConfiguration().get("hexeditor.maxFileSize") as number ) * 1000000;
		if (fileSize > maxFileSize) {
			fileData = new Uint8Array();
		} else {
			fileData = await vscode.workspace.fs.readFile(dataFile);
		}
		return new HexDocument(uri, fileData, delegate, fileSize);
	}

	private readonly _uri: vscode.Uri;

	private readonly _bytesize: number;

	private _documentData: Uint8Array;

	private readonly _delegate: HexDocumentDelegate;

	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array,
		delegate: HexDocumentDelegate,
		fileSize: number
	) {
		super();
		this._uri = uri;
		this._documentData = initialContent;
		this._delegate = delegate;
		this._bytesize = fileSize;
    }
    
	public get uri(): vscode.Uri { return this._uri; }
	
	public get filesize(): number  { return this._bytesize; }

	public get documentData(): Uint8Array { return this._documentData; }

    private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
    /*
        Fires when the document is disposed of
    */
    public readonly onDidDispose = this._onDidDispose.event;

    dispose(): void {
        // Notify subsribers to the custom document we are disposing of it
        this._onDidDispose.fire();
        // Disposes of all the events attached to the custom document
        super.dispose();
	}
	
	// Opens the file overriding any filesize restrictions
	// This doesn't update the fileSize so we don't need to change that
	async openAnyways(): Promise<void> {
		this._documentData = await vscode.workspace.fs.readFile(this.uri);
	}

}