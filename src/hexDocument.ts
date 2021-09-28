// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import { HexDocumentEdit, HexDocumentEditOp, HexDocumentModel } from "../shared/hexDocumentModel";
import { Backup } from "./backup";
import { Disposable } from "./dispose";
import { accessFile } from "./fileSystemAdaptor";
import { SearchProvider } from "./searchProvider";

export class HexDocument extends Disposable implements vscode.CustomDocument {
	static async create(
		uri: vscode.Uri,
		{ backupId, untitledDocumentData }: vscode.CustomDocumentOpenContext,
		telemetryReporter: TelemetryReporter,
	): Promise<HexDocument | PromiseLike<HexDocument>> {
		const accessor = accessFile(uri, untitledDocumentData);
		const model = new HexDocumentModel({
			accessor,
			isFiniteSize: true,
			supportsLengthChanges: true,
			edits: backupId
				? { unsaved: await new Backup(vscode.Uri.parse(backupId)).read(), saved: [] }
				: undefined,
		});

		const queries = HexDocument.parseQuery(uri.query);
		const baseAddress: number = queries["baseAddress"] ? HexDocument.parseHexOrDecInt(queries["baseAddress"]) : 0;

		const fileSize = await accessor.getSize();
		/* __GDPR__
			"fileOpen" : {
				"fileSize" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		telemetryReporter.sendTelemetryEvent("fileOpen", {}, { "fileSize": fileSize ?? 0 });

		const maxFileSize = (vscode.workspace.getConfiguration().get("hexeditor.maxFileSize") as number) * 1000000;
		const isLargeFile = !backupId && ((fileSize ?? 0) > maxFileSize);
		return new HexDocument(model, isLargeFile, baseAddress);
	}

	// Last save time
	public lastSave = Date.now();

	public readonly searchProvider: SearchProvider;

	private constructor(
		private model: HexDocumentModel,
		public readonly isLargeFile: boolean,
		public readonly baseAddress: number,
	) {
		super();
		this.searchProvider = new SearchProvider(this);
	}

	/** @inheritdoc */
	public get uri(): vscode.Uri {
		return vscode.Uri.parse(this.model.uri);
	}

	/**
	 * Reads the amount of data from the model, including edits, into a
	 * buffer of the requested length.
	 */
	public async readBufferWithEdits(offset: number, length: number): Promise<Uint8Array> {
		const target = new Uint8Array(length);
		let soFar = 0;
		for await (const chunk of this.model.readWithEdits(offset)) {
			const read = Math.min(chunk.length, target.length - soFar);
			target.set(chunk.subarray(0, read), soFar);
			soFar += read;
			if (soFar === length) {
				return target;
			}
		}

		return target.subarray(0, soFar);
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

	private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<void>());

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
	 * Gets whether there are unsaved edits.
	 */
	public get isUnsaved(): boolean {
		return this.model.unsavedEdits.length > 0;
	}

	/**
	 * Called when the user edits the document in a webview.
	 *
	 * This fires an event to notify VS Code that the document has been edited.
	 */
	public makeEdit(edits: HexDocumentEdit[]): void {
		this._onDidChange.fire(this.model.makeEdits(edits));
	}

	/**
	 * See {@link HexDocumentModel.size}
	 */
	public size(): Promise<number | undefined> {
		return this.model.size();
	}

	/**
	 * Called by VS Code when the user saves the document.
	 */
	public async save(_cancellation?: vscode.CancellationToken): Promise<void> {
		await this.model.save();
	}

	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	public async saveAs(targetResource: vscode.Uri, cancellation?: vscode.CancellationToken): Promise<void> {
		if (cancellation && cancellation.isCancellationRequested) {
			return;
		}
		if (!this.model.isFiniteSize) {
			// todo: we could prompt for the number of bytes to save?
			throw new Error("Cannot save a document without a finite size");
		}

		const newFile = accessFile(targetResource);
		await newFile.writeStream(this.model.readWithEdits());
		this.lastSave = Date.now();
		this.model = new HexDocumentModel({
			accessor: newFile,
			isFiniteSize: true,
			supportsLengthChanges: true,
		});
	}

	/**
	 * Called by VS Code when the user calls `revert` on a document.
	 */
	async revert(_token?: vscode.CancellationToken): Promise<void> {
		this.model.revert();
		this._onDidChangeDocument.fire();
	}

	/**
	 * Called by VS Code to backup the edited document.
	 *
	 * These backups are used to implement hot exit.
	 */
	async backup(destination: vscode.Uri): Promise<vscode.CustomDocumentBackup> {
		const backup = new Backup(destination);
		await backup.write(this.model.unsavedEdits);

		return {
			id: destination.toString(),
			delete: async (): Promise<void> => {
				try {
					await vscode.workspace.fs.delete(destination);
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
	public async replace(replacement: number[], replaceOffsets: number[][], preserveCase: boolean): Promise<HexDocumentEdit[]> {
		const allEdits: HexDocumentEdit[] = [];
		// We only want to call this once as it's sort of expensive so we save it
		let offset = 0;
		for await (const chunk of this.model.readWithEdits()) {
			for (const offsets of replaceOffsets) {
				const edits: HexDocumentEdit[] = [];
				// Similar to copy and paste we do the most conservative replacement
				// i.e if the replacement is smaller we don't try to fill the whole selection
				for (let i = 0; i < replacement.length && i < offsets.length; i++) {
					const adjustedOffset = offsets[i] - offset;
					// If we preserve case we make sure that the characters match the case of the original values
					if (preserveCase) {
						const replacementChar = String.fromCharCode(replacement[i]);
						const currentDocumentChar = String.fromCharCode(chunk[adjustedOffset]);
						// We need to check that the inverse isn't true because things like numbers return true for both
						if (currentDocumentChar.toUpperCase() === currentDocumentChar && currentDocumentChar.toLowerCase() != currentDocumentChar) {
							replacement[i] = replacementChar.toUpperCase().charCodeAt(0);
						} else if (currentDocumentChar.toLowerCase() === currentDocumentChar && currentDocumentChar.toUpperCase() != currentDocumentChar) {
							replacement[i] = replacementChar.toLowerCase().charCodeAt(0);
						}
					}

					// If they're not the same as what is displayed then we add it as an edit as something has been replaced
					if (replacement[i] !== chunk[adjustedOffset]) {
						const edit: HexDocumentEdit = {
							op: HexDocumentEditOp.Replace,
							offset: chunk[adjustedOffset],
							opId: 0,
							previous: new Uint8Array([chunk[adjustedOffset]]),
							value: new Uint8Array([replacement[i]]),
						};
						edits.push(edit);
						allEdits.push(edit);
					}
				}
			}

			offset += chunk.length;
		}
		// After the replacement is complete we add it to the document's edit queue
		if (allEdits.length !== 0) this.makeEdit(allEdits);
		return allEdits;
	}


	/**
	 * Utility function to convert a Uri query string into a map
	 */
	private static parseQuery(queryString: string): { [key: string]: string } {
		const queries: { [key: string]: string } = {};
		if (queryString) {
			const pairs = (queryString[0] === "?" ? queryString.substr(1) : queryString).split("&");
			for (const q of pairs) {
				const pair = q.split("=");
				const name = pair.shift();
				if (name) {
					queries[name] = pair.join("=");
				}
			}
		}
		return queries;
	}

	/**
	 * Utility function to parse a number. Only hex and decimal supported
	 */
	private static parseHexOrDecInt(str: string): number {
		str = str.toLowerCase();
		return str.startsWith("0x") ? parseInt(str.substring(2), 16) : parseInt(str, 10);
	}
}
