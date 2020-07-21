// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Disposable } from "./dispose";
import TelemetryReporter from "vscode-extension-telemetry";
import { SearchProvider } from "./searchProvider";

/**
 * @description Helper function to compare two arrays
 * @param arr1 First array to compare
 * @param arr2 Second array to compare
 * @returns Whether or not they're equal
 */
function arrayCompare(arr1: HexDocumentEdit[] | undefined, arr2: HexDocumentEdit[] | undefined): boolean {
	if (arr1 === undefined || arr2 === undefined) return arr1 === arr2;
	if (arr1.length !== arr2.length) return false;
	for (let i = 0; i < arr1.length; i++) {
		const obj1 = arr1[i];
		const obj2 = arr2[i];
		if (obj1.offset !== obj2.offset || obj1.oldValue != obj2.oldValue || obj1.newValue != obj2.newValue) {
			return false;
		}
	}
	return true;
}

export interface HexDocumentEdit {
	oldValue: number | undefined;
	newValue: number | undefined;
	readonly offset: number;
	// Indicates if the cell will be dirty after an undo
	sameOnDisk: boolean;
}

export class HexDocument extends Disposable implements vscode.CustomDocument {
    static async create(
		uri: vscode.Uri,
		backupId: string | undefined,
		telemetryReporter: TelemetryReporter,
	): Promise<HexDocument | PromiseLike<HexDocument> > {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === "string" ? vscode.Uri.parse(backupId) : uri;
		const unsavedEditURI = typeof backupId === "string" ? vscode.Uri.parse(backupId + ".json") : undefined;
		const fileSize = (await vscode.workspace.fs.stat(dataFile)).size;
		/* __GDPR__
			"fileOpen" : {
				"fileSize" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
			}
		*/
		telemetryReporter.sendTelemetryEvent("fileOpen", {}, { "fileSize": fileSize });
		let fileData: Uint8Array;
		const maxFileSize = (vscode.workspace.getConfiguration().get("hexeditor.maxFileSize") as number ) * 1000000;
		let unsavedEdits: HexDocumentEdit[][] = [];
		// If there's a backup the user already hit open anyways so we will open it even if above max file size
		if (fileSize > maxFileSize && !backupId) {
			fileData = new Uint8Array();
		} else {
			fileData = await vscode.workspace.fs.readFile(dataFile);
			if (unsavedEditURI) {
				const jsonData = await vscode.workspace.fs.readFile(unsavedEditURI);
				unsavedEdits = JSON.parse(Buffer.from(jsonData).toString("utf-8"));
			}
		}
		return new HexDocument(uri, fileData, fileSize, unsavedEdits);
	}

	private readonly _uri: vscode.Uri;

	private _bytesize: number;

	private _documentData: Uint8Array;

	private _edits: HexDocumentEdit[][] = [];
	private _unsavedEdits: HexDocumentEdit[][] = [];

	// Last save time
	public lastSave = Date.now();

	public readonly searchProvider: SearchProvider;

	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array,
		fileSize: number,
		unsavedEdits: HexDocumentEdit[][]
	) {
		super();
		this._uri = uri;
		this._documentData = initialContent;
		this._bytesize = fileSize;
		this._unsavedEdits = unsavedEdits;
		// If we don't do this Array.from casting then both will reference the same array causing bad behavior
		this._edits = Array.from(unsavedEdits);
		this.searchProvider = new SearchProvider(this);
    }
    
	public get uri(): vscode.Uri { return this._uri; }
	
	public get filesize(): number  {
		let numAdditions = 0;
		// We add the extra unsaved cells to the size of the file
		this.unsavedEdits.flat().forEach(edit => {
			if (edit.newValue !== undefined && edit.oldValue === undefined) {
				numAdditions++;
			} else if(edit.oldValue !== undefined && edit.newValue === undefined && edit.offset < this._bytesize) {
				numAdditions--;
			}
		});
		return this._bytesize + numAdditions;
	}

	public get documentData(): Uint8Array { return this._documentData; }

	/**
	 * @description Function which returns the document data with unsaved edits applied on top
	 */
	public get documentDataWithEdits(): number[] {
		// Map the edits into the document
		const documentArray = Array.from(this.documentData);
		const unsavedEdits = this._unsavedEdits.flat();
		let removals: number[] = [];
		for (const edit of unsavedEdits) {
			if (edit.oldValue !== undefined && edit.newValue !== undefined) {
				documentArray[edit.offset] = edit.newValue;
			} else if (edit.oldValue === undefined && edit.newValue !== undefined){
				documentArray.push(edit.newValue);
			} else {
				removals.push(edit.offset);
			}
		}
		removals = removals.reverse();
		for (const removal of removals) {
			documentArray.splice(removal, 1);
		}
		return documentArray;
	}

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

	public get unsavedEdits(): HexDocumentEdit[][] { return this._unsavedEdits; }

	private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<{
		readonly fileSize: number;
		readonly type: "redo" | "undo" | "revert";
		readonly edits: readonly HexDocumentEdit[];
	}>());

	/**
	 * Fired to notify webviews that the document has changed.
	 */
	public readonly onDidChangeContent = this._onDidChangeDocument.event;

	private readonly _onDidChange = this._register(new vscode.EventEmitter<{
		undo(): void;
		redo(): void;
	}>());

	/**
	 * Fired to tell VS Code that an edit has occured in the document.
	 * 
	 * This updates the document's dirty indicator.
	 */
	public readonly onDidChange = this._onDidChange.event;

	/**
	 * Called when the user edits the document in a webview.
	 * 
	 * This fires an event to notify VS Code that the document has been edited.
	 */
	makeEdit(edits: HexDocumentEdit[]): void {
		edits.forEach(e => e.sameOnDisk = false);
		this._edits.push(edits);
		this._unsavedEdits.push(edits);
		
		this._onDidChange.fire({
			undo: async () => {
				const undoneEdits = this._edits.pop();
				// If undone edit is undefined then we didn't undo anything
				if (!undoneEdits) return;
				let removedFromUnsaved = false;
				if (arrayCompare(this._unsavedEdits[this._unsavedEdits.length - 1], undoneEdits)) {
					this._unsavedEdits.pop();
					removedFromUnsaved = true;
				}
				const unsavedEdits: HexDocumentEdit[] = [];
				for (const edit of undoneEdits) {
					// If the value is the same as what's on disk we want to let the webview know in order to mark a cell dirty
					edit.sameOnDisk = edit.oldValue !== undefined && edit.oldValue === this.documentData[edit.offset] || false;
					// If it's changed on disk and we didn't just remove it from unsaved then its an unsaved edit that needs to be tracked
					if (!edit.sameOnDisk && !removedFromUnsaved) {
						unsavedEdits.push({
							newValue: edit.oldValue,
							oldValue: edit.newValue,
							offset: edit.offset,
							sameOnDisk: edit.sameOnDisk
						});
					}
				}
				if (unsavedEdits.length !== 0)	this._unsavedEdits.push(unsavedEdits);
				this._onDidChangeDocument.fire({
					fileSize: this.filesize,
					type: "undo",
					edits: undoneEdits,
				});
			},
			redo: async () => {
				this._edits.push(edits);
				const redoneEdits = edits;
				if (this._unsavedEdits[this._unsavedEdits.length - 1] !== undefined) {
					// We have to flip the old in new values because redone is reapplying them so they will be exact opposites
					// This allows us to then compare them
					let unsavedEdits: HexDocumentEdit[] = this._unsavedEdits[this._unsavedEdits.length - 1].slice(0);
					unsavedEdits = unsavedEdits.map((e) => {
						if (e.newValue === undefined && e.oldValue !== undefined) {
							e.newValue = e.oldValue;
							e.oldValue = undefined;
						}
						return e;
					});
					if (arrayCompare(unsavedEdits, redoneEdits)) this._unsavedEdits.pop();
				}
				const unsavedEdits = [];
				for (const edit of redoneEdits) {
					edit.sameOnDisk = edit.offset < this._bytesize && edit.newValue === this.documentData[edit.offset] || false;
					// If they're not the same as what's on disk then they're unsaved and need to be tracked
					if (!edit.sameOnDisk) unsavedEdits.push(edit);
				}
				// Means the entire redo is the same on disk so we don't add the edit as unsaved
				if (unsavedEdits.length !== 0) this._unsavedEdits.push(unsavedEdits);
				this._onDidChangeDocument.fire({
					fileSize: this.filesize,
					type: "redo",
					edits: redoneEdits
				});
			}
		});
	}

	/**
	 * Called by VS Code when the user saves the document.
	 */
	async save(cancellation?: vscode.CancellationToken): Promise<void> {
		// The document data is now the document data with edits appplied
		this._documentData = new Uint8Array(this.documentDataWithEdits);
		this._bytesize = this.documentData.length;
		await this.saveAs(this.uri, cancellation);
		this.lastSave = Date.now();
		this._unsavedEdits = [];
	}

	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	async saveAs(targetResource: vscode.Uri, cancellation?: vscode.CancellationToken): Promise<void> {
		const fileData = this.documentData;
		if (cancellation && cancellation.isCancellationRequested) {
			return;
		}
		await vscode.workspace.fs.writeFile(targetResource, fileData);
	}

	/**
	 * Called by VS Code when the user calls `revert` on a document.
	 */
	async revert(_cancellation?: vscode.CancellationToken): Promise<void> {
		const diskContent = await vscode.workspace.fs.readFile(this.uri);
		this._bytesize = diskContent.length;
		this._documentData = diskContent;
		this._unsavedEdits = [];
		this._edits = [];
		// // If we revert then the edits are exactly what's on the disk
		// this._edits.flat().forEach(e => e.sameOnDisk = true);
		this._onDidChangeDocument.fire({
			fileSize: this.filesize,
			type: "revert",
			edits: []
		});
	}

	/**
	 * Called by VS Code to backup the edited document.
	 * 
	 * These backups are used to implement hot exit.
	 */
	async backup(destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
		await this.saveAs(destination, cancellation);
		await vscode.workspace.fs.writeFile(vscode.Uri.parse(destination.path + ".json"), Buffer.from(JSON.stringify(this.unsavedEdits), "utf-8"));
		return {
			id: destination.toString(),
			delete: async (): Promise<void> => {
				try {
					await vscode.workspace.fs.delete(destination);
					await vscode.workspace.fs.delete(vscode.Uri.parse(destination.path + ".json"));
				} catch {
					// noop
				}
			}
		};
	}

	/**
	 * @description Handles replacement within the document when the user clicks the replace / replace all button
	 * @param {number[]} replacement The new values which will be replacing the old 
	 * @param {number[][]} replaceOffsets The offsets to replace with replacement 
	 * @param {boolean} preserveCase Whether or not to preserve case 
	 * @returns {HexDocumentEdit[]} the new edits so we can send them back to the webview for application
	 */
	public replace(replacement: number[], replaceOffsets: number[][], preserveCase: boolean): HexDocumentEdit[] {
		const allEdits: HexDocumentEdit[] = [];
		// We only want to call this once as it's sort of expensive so we save it
		const documentDataWithEdits = this.documentDataWithEdits;
		for (const offsets of replaceOffsets) {
			const edits: HexDocumentEdit[] = [];
			// Similar to copy and paste we do the most conservative replacement
			// i.e if the replacement is smaller we don't try to fill the whole selection
			for (let i = 0; i < replacement.length && i < offsets.length; i++) {
				// If we preserve case we make sure that the characters match the case of the original values
				if (preserveCase) {
					const replacementChar = String.fromCharCode(replacement[i]);
					const currentDocumentChar = String.fromCharCode(documentDataWithEdits[offsets[i]]);
					// We need to check that the inverse isn't true because things like numbers return true for both
					if (currentDocumentChar.toUpperCase() === currentDocumentChar && currentDocumentChar.toLowerCase() != currentDocumentChar) {
						replacement[i] = replacementChar.toUpperCase().charCodeAt(0);
					} else if(currentDocumentChar.toLowerCase() === currentDocumentChar && currentDocumentChar.toUpperCase() != currentDocumentChar) {
						replacement[i] = replacementChar.toLowerCase().charCodeAt(0);
					}
				}

				// If they're not the same as what is displayed then we add it as an edit as something has been replaced
				if (replacement[i] !== documentDataWithEdits[offsets[i]]) {
					const edit: HexDocumentEdit = {
						oldValue: documentDataWithEdits[offsets[i]],
						newValue: replacement[i],
						offset: offsets[i],
						sameOnDisk: false
					};
					edits.push(edit);
					allEdits.push(edit);
				}
			}
			// After the replacement is complete we add it to the document's edit queue
			if (edits.length !== 0) this.makeEdit(edits);
		}
		return allEdits;
	}
}
