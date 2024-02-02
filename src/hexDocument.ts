// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import TelemetryReporter from "@vscode/extension-telemetry";
import * as vscode from "vscode";
import { FileAccessor } from "../shared/fileAccessor";
import {
	HexDocumentEdit,
	HexDocumentEditOp,
	HexDocumentEditReference,
	HexDocumentModel,
} from "../shared/hexDocumentModel";
import { Backup } from "./backup";
import { Disposable } from "./dispose";
import { accessFile } from "./fileSystemAdaptor";
import { SearchProvider } from "./searchProvider";

export interface ISelectionState {
	/** Number of selected bytes */
	selected: number;
	/** Focused byte, if any */
	focused?: number;
}

export class HexDocument extends Disposable implements vscode.CustomDocument {
	static async create(
		uri: vscode.Uri,
		{ backupId, untitledDocumentData }: vscode.CustomDocumentOpenContext,
		telemetryReporter: TelemetryReporter,
	): Promise<{ document: HexDocument; accessor: FileAccessor }> {
		const accessor = await accessFile(uri, untitledDocumentData);
		const model = new HexDocumentModel({
			accessor,
			isFiniteSize: true,
			supportsLengthChanges: true,
			edits: backupId
				? { unsaved: await new Backup(vscode.Uri.parse(backupId)).read(), saved: [] }
				: undefined,
		});

		const queries = HexDocument.parseQuery(uri.query);
		const baseAddress: number = queries["baseAddress"]
			? HexDocument.parseHexOrDecInt(queries["baseAddress"])
			: 0;

		const fileSize = await accessor.getSize();
		/* __GDPR__
			"fileOpen" : {
				"fileSize" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		telemetryReporter.sendTelemetryEvent("fileOpen", {}, { fileSize: fileSize ?? 0 });

		const maxFileSize =
			(vscode.workspace.getConfiguration().get("hexeditor.maxFileSize") as number) * 1000000;
		const isLargeFile =
			!backupId && !accessor.supportsIncremetalAccess && (fileSize ?? 0) > maxFileSize;
		return { document: new HexDocument(model, isLargeFile, baseAddress), accessor };
	}

	// Last save time
	public lastSave = 0;

	private _selectionState: ISelectionState = { selected: 0 };

	/** Search provider for the document. */
	public readonly searchProvider = new SearchProvider();

	constructor(
		private model: HexDocumentModel,
		public readonly isLargeFile: boolean,
		public readonly baseAddress: number,
	) {
		super();
	}

	/**
	 * Gets the preferred page size of the document.
	 */
	public get pageSize() {
		return this.model.pageSize;
	}

	/**
	 * Gets whether the model is read-only.
	 */
	public get isReadonly(): boolean {
		return this.model.isReadonly;
	}

	/** @inheritdoc */
	public get uri(): vscode.Uri {
		return vscode.Uri.parse(this.model.uri);
	}

	/**
	 * Reads data including edits from the model, returning an iterable of
	 * Uint8Array chunks.
	 */
	public readWithEdits(offset: number): AsyncIterableIterator<Uint8Array> {
		return this.model.readWithEdits(offset);
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

		return target.slice(0, soFar);
	}

	/**
	 * Reads into the buffer from the original file, without edits.
	 */
	public async readBuffer(offset: number, length: number): Promise<Uint8Array> {
		const target = new Uint8Array(length);
		const read = await this.model.readInto(offset, target);
		return read === length ? target : target.slice(0, read);
	}

	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
	/*
		Fires when the document is disposed of
	*/
	public readonly onDidDispose = this._onDidDispose.event;

	dispose(): void {
		// Notify subsribers to the custom document we are disposing of it
		this._onDidDispose.fire();
		this.model.dispose();
		// Disposes of all the events attached to the custom document
		super.dispose();
	}

	private readonly _onDidChangeSelectionState = this._register(
		new vscode.EventEmitter<ISelectionState>(),
	);

	/**
	 * Fired when the document selection or focus changes.
	 */
	public readonly onDidChangeSelectionState = this._onDidChangeSelectionState.event;

	public get selectionState() {
		return this._selectionState;
	}

	public set selectionState(state: ISelectionState) {
		this._selectionState = state;
		this._onDidChangeSelectionState.fire(state);
	}

	private readonly _onDidRevert = this._register(new vscode.EventEmitter<void>());

	/**
	 * Fired to notify webviews that the document has changed and the file
	 * should be reloaded.
	 */
	public readonly onDidRevert = this._onDidRevert.event;

	/**
	 * @see HexDocumentModel.isSynced
	 */
	public get isSynced(): boolean {
		return this.model.isSynced;
	}
	/**
	 * Edits made in the document.
	 */
	public get edits(): readonly HexDocumentEdit[] {
		return this.model.edits;
	}

	/**
	 * Gets the opId of the last saved edit.
	 */
	public get unsavedEditIndex(): number {
		return this.model.unsavedEditIndex;
	}

	/**
	 * @see HexDocumentModel.makeEdits
	 */
	public makeEdits(edits: readonly HexDocumentEdit[]): HexDocumentEditReference {
		return this.model.makeEdits(edits);
	}

	/**
	 * Inserts data into the document.
	 */
	public insert(offset: number, data: Uint8Array): HexDocumentEditReference {
		return this.model.makeEdits([{ op: HexDocumentEditOp.Insert, offset, value: data }]);
	}

	/**
	 * Replaces data into the document. If the data is larger than the document,
	 * then this results in the necessary additional insertion operation.
	 */
	public async replace(offset: number, data: Uint8Array): Promise<HexDocumentEditReference> {
		const previous = await this.readBufferWithEdits(offset, data.length);
		if (previous.length === data.length) {
			return this.makeEdits([{ op: HexDocumentEditOp.Replace, offset, value: data, previous }]);
		} else {
			return this.makeEdits([
				{
					op: HexDocumentEditOp.Replace,
					offset: offset,
					value: data.subarray(0, previous.length),
					previous,
				},
				{
					op: HexDocumentEditOp.Insert,
					offset: offset + previous.length,
					value: data.subarray(previous.length),
				},
			]);
		}
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
		this.lastSave = Date.now();
		await this.model.save();
		this.lastSave = Date.now();
	}

	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	public async saveAs(
		targetResource: vscode.Uri,
		cancellation?: vscode.CancellationToken,
	): Promise<void> {
		if (cancellation && cancellation.isCancellationRequested) {
			return;
		}
		if (!this.model.isFiniteSize) {
			// todo: we could prompt for the number of bytes to save?
			throw new Error("Cannot save a document without a finite size");
		}

		const newFile = await accessFile(targetResource);
		this.lastSave = Date.now();
		await newFile.writeStream(this.model.readWithEdits());
		this.lastSave = Date.now();
		this.model.dispose();
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
		this._onDidRevert.fire();
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
			},
		};
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
