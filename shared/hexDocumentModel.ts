/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { bulkhead } from "cockatiel";
import { FileAccessor } from "./fileAccessor";
import { binarySearch } from "./util/binarySearch";
import { once } from "./util/once";

export const enum HexDocumentEditOp {
	Insert,
	Delete,
	Replace,
}

export interface GenericHexDocumentEdit {
	op: HexDocumentEditOp;
	offset: number;
}

/** note: value.length === previous.length in replace operations */
export interface HexDocumentReplaceEdit extends GenericHexDocumentEdit {
	op: HexDocumentEditOp.Replace;
	value: Uint8Array;
	previous: Uint8Array;
}

export interface HexDocumentDeleteEdit extends GenericHexDocumentEdit {
	op: HexDocumentEditOp.Delete;
	previous: Uint8Array;
}

export interface HexDocumentInsertEdit extends GenericHexDocumentEdit {
	op: HexDocumentEditOp.Insert;
	value: Uint8Array;
}

export type HexDocumentEdit =
	| HexDocumentInsertEdit
	| HexDocumentDeleteEdit
	| HexDocumentReplaceEdit;

/**
 * Reference returned from a hexdocument edit. Undo and redo return the
 * edit(s) that were applied as part of the undo/redo operation.
 */
export interface HexDocumentEditReference {
	undo(): readonly HexDocumentEdit[];
	redo(): readonly HexDocumentEdit[];
}

const reverseEdit = (edit: HexDocumentEdit): HexDocumentEdit => {
	if (edit.op === HexDocumentEditOp.Insert) {
		return { ...edit, op: HexDocumentEditOp.Delete, previous: edit.value };
	} else if (edit.op === HexDocumentEditOp.Delete) {
		return { ...edit, op: HexDocumentEditOp.Insert, value: edit.previous };
	} else {
		return { ...edit, value: edit.previous, previous: edit.value };
	}
};

export interface HexDocumentModelOptions {
	/** Acessor for the underlying file */
	accessor: FileAccessor;
	/** Initial hex document edits. */
	edits?: { unsaved: HexDocumentEdit[]; saved: HexDocumentEdit[] };
	/** Whether the file length is allowed to be changed. */
	supportsLengthChanges: boolean;
	/** Whether the read file is of a finite length. */
	isFiniteSize: boolean;
}

export const enum EditRangeOp {
	Read,
	Skip,
	Insert,
}

export type EditRange =
	/** Read from "roffset" in the file, starting at "offset" in the edited version */
	| { op: EditRangeOp.Read; editIndex: number; offset: number; roffset: number }
	/** Skip starting at "offset" in the edited version of the file */
	| { op: EditRangeOp.Skip; editIndex: number; offset: number }
	/** Insert "value" at the "offset" in th edited version of the file */
	| { op: EditRangeOp.Insert; editIndex: number; offset: number; value: Uint8Array };

export interface IEditTimeline {
	/** Instructions on how to read the file, in order. */
	ranges: readonly EditRange[];
	/** Difference in file size as a result of the edits that were made. */
	sizeDelta: number;
}

export class HexDocumentModel {
	public readonly supportsLengthChanges: boolean;
	public readonly isFiniteSize: boolean;
	public readonly pageSize: number;
	private readonly accessor: FileAccessor;
	/** Guard to make sure only one save operation happens at a time */
	private readonly saveGuard = bulkhead(1, Infinity);
	/** First index in the _edits array that's unsaved */
	private _unsavedEditIndex = 0;
	private _edits: HexDocumentEdit[];

	constructor(options: HexDocumentModelOptions) {
		this._edits = options.edits ? options.edits.saved.concat(options.edits.unsaved) : [];
		this._unsavedEditIndex = options.edits?.saved.length ?? 0;
		this.supportsLengthChanges = options.supportsLengthChanges;
		this.isFiniteSize = options.isFiniteSize;
		this.accessor = options.accessor;
		this.pageSize = options.accessor.pageSize;
	}

	/**
	 * Gets the URI associated with this document model.
	 */
	public get uri(): string {
		return this.accessor.uri;
	}

	/**
	 * Gets whether the model is read-only.
	 */
	public get isReadonly(): boolean {
		return !!this.accessor.isReadonly;
	}

	/**
	 * Gets the document size, accounting for all edits.
	 * Returns undefined if infinite.
	 */
	public async size(): Promise<number | undefined> {
		if (!this.isFiniteSize) {
			return undefined;
		}

		const diskSize = await this.getSizeInner();
		if (diskSize === undefined) {
			return undefined;
		}

		const { sizeDelta } = this.getEditTimeline();
		return diskSize + sizeDelta;
	}

	/**
	 * Gets current document edits.
	 */
	public get edits(): readonly HexDocumentEdit[] {
		return this._edits;
	}

	/**
	 * Gets unsaved document edits.
	 */
	public get unsavedEdits(): readonly HexDocumentEdit[] {
		return this._edits.slice(this.unsavedEditIndex);
	}

	/**
	 * Gets the index of the first unsaved edit. This may be equal to
	 * the edits length if the model is synced.
	 */
	public get unsavedEditIndex(): number {
		return this._unsavedEditIndex;
	}

	/**
	 * Returns false if there are changes made on the model that have not
	 * yet been saved.
	 */
	public get isSynced(): boolean {
		return this.unsavedEditIndex === this.edits.length;
	}

	/**
	 * Reads bytes at the offset into the target array. Returns the number of
	 * bytes that were read.
	 */
	public readInto(offset: number, target: Uint8Array): Promise<number> {
		return this.accessor.read(offset, target);
	}

	/**
	 * Reads bytes in their edited state starting at the given offset.
	 */
	public readWithEdits(fromOffset = 0, chunkSize = 128 * 1024): AsyncIterableIterator<Uint8Array> {
		return readUsingRanges(this.accessor, this.getEditTimeline().ranges, fromOffset, chunkSize);
	}

	/**
	 * Persists changes to the file.
	 */
	public save(): Promise<void> {
		const toSave = this._edits.slice(this.unsavedEditIndex);
		if (toSave.length === 0) {
			return Promise.resolve();
		}

		this._unsavedEditIndex += toSave.length;

		return this.saveGuard.execute(async () => {
			// for length changes, we must rewrite the entire file. Or at least from
			// the offset of the first edit. For replacements we can selectively write.
			if (
				!toSave.some(
					e => e.op !== HexDocumentEditOp.Replace || e.previous.length !== e.value.length,
				)
			) {
				await this.accessor.writeBulk(
					toSave.map(e => ({ offset: e.offset, data: (e as HexDocumentReplaceEdit).value })),
				);
			} else {
				// todo: technically only need to rewrite starting from the first edit
				await this.accessor.writeStream(this.readWithEdits());
			}

			this.getSizeInner.forget();
		});
	}

	/**
	 * Reverts to the contents last saved on disk, discarding edits,
	 */
	public revert(): void {
		this._unsavedEditIndex = 0;
		this._edits = [];
		this.accessor.invalidate?.();
		this.getEditTimeline.forget();
		this.getSizeInner.forget();
	}

	/**
	 * Applies edits to the model, returning the handle. Undo *must* only be
	 * called once all subsequently made edits have also been undone, and
	 * vise versa for `redo`.
	 */
	public makeEdits(edits: readonly HexDocumentEdit[]): HexDocumentEditReference {
		const index = this._edits.length;
		this._edits.push(...edits);
		this.getEditTimeline.forget();

		return {
			undo: () => {
				// If the file wasn't saved, just removed the pending edits.
				// Otherwise, append reversed edits.
				if (this.unsavedEditIndex <= index) {
					this._edits.splice(index, edits.length);
				} else {
					this._edits.push(...edits.map(reverseEdit));
				}
				this.getEditTimeline.forget();
				return this._edits;
			},
			redo: () => {
				this._edits.push(...edits);
				this.getEditTimeline.forget();
				return this._edits;
			},
		};
	}

	/** Disposes of unmanaged resources. */
	public dispose(): void {
		this.accessor.dispose();
	}

	/**
	 * Gets the size of the file on disk.
	 */
	private readonly getSizeInner = once(() => this.accessor.getSize());

	/**
	 * Gets instructions for returning file data. Returns a list of contiguous
	 * `Range` instances. Each "range" issues instructions until the next
	 * "offset". This can be used to generate file data.
	 */
	private readonly getEditTimeline = once(() => buildEditTimeline(this._edits));
}

export async function* readUsingRanges(
	readable: Pick<FileAccessor, "read">,
	ranges: readonly EditRange[],
	fromOffset = 0,
	chunkSize = 1024,
): AsyncIterableIterator<Uint8Array> {
	const buf = new Uint8Array(chunkSize);
	for (let i = 0; i < ranges.length; i++) {
		const range = ranges[i];
		if (range.op === EditRangeOp.Skip) {
			continue;
		}

		if (range.op === EditRangeOp.Insert) {
			const readLast = range.offset + range.value.length - fromOffset;
			if (readLast <= 0) {
				continue;
			}

			const toYield = readLast < range.value.length ? range.value.subarray(-readLast) : range.value;
			if (toYield.length > 0) {
				yield toYield;
			}
			continue;
		}

		// range.op === Read
		const until =
			range.roffset + (i + 1 < ranges.length ? ranges[i + 1].offset : Infinity) - range.offset;
		let roffset = range.roffset + Math.max(0, fromOffset - range.offset);
		while (roffset < until) {
			const bytes = await readable.read(
				roffset,
				buf.subarray(0, Math.min(buf.length, until - roffset)),
			);
			if (bytes === 0) {
				break; // EOF
			}
			yield buf.subarray(0, bytes);
			roffset += bytes;
		}
	}
}

export const buildEditTimeline = (edits: readonly HexDocumentEdit[]): IEditTimeline => {
	// Serialize all edits to a single, continuous "timeline", which we'll
	// iterate through in order to read data and yield bytes.
	const ranges: EditRange[] = [{ op: EditRangeOp.Read, editIndex: -1, roffset: 0, offset: 0 }];

	/** Splits the "range" into two parts at the given byte within the range */
	const getSplit = (
		editIndex: number,
		split: EditRange,
		atByte: number,
	): { before: EditRange; after: EditRange } => {
		if (split.op === EditRangeOp.Read) {
			return {
				before: { op: EditRangeOp.Read, editIndex, roffset: split.roffset, offset: split.offset },
				after: {
					op: EditRangeOp.Read,
					editIndex,
					roffset: split.roffset + atByte,
					offset: split.offset + atByte,
				},
			};
		} else if (split.op === EditRangeOp.Skip) {
			return {
				before: { op: EditRangeOp.Skip, editIndex, offset: split.offset },
				after: { op: EditRangeOp.Skip, editIndex, offset: split.offset + atByte },
			};
		} else {
			return {
				before: {
					op: EditRangeOp.Insert,
					editIndex,
					offset: split.offset,
					value: split.value.subarray(0, atByte),
				},
				after: {
					op: EditRangeOp.Insert,
					editIndex,
					offset: split.offset + atByte,
					value: split.value.subarray(atByte),
				},
			};
		}
	};

	const searcher = binarySearch<EditRange>(r => r.offset);
	let sizeDelta = 0;

	/** Shifts the offset of all ranges after i by the amount */
	const shiftAfter = (i: number, byAmount: number) => {
		sizeDelta += byAmount;
		for (; i < ranges.length; i++) {
			ranges[i].offset += byAmount;
		}
	};

	for (let editIndex = 0; editIndex < edits.length; editIndex++) {
		const edit = edits[editIndex];
		let i = searcher(edit.offset, ranges);
		if (i === ranges.length || ranges[i].offset > edit.offset) {
			i--;
		}
		const split = ranges[i];

		if (edit.op === HexDocumentEditOp.Insert) {
			const { before, after } = getSplit(editIndex, split, edit.offset - split.offset);
			ranges.splice(
				i,
				1,
				before,
				{ op: EditRangeOp.Insert, editIndex, offset: edit.offset, value: edit.value },
				after,
			);
			shiftAfter(i + 2, edit.value.length);
		} else if (edit.op === HexDocumentEditOp.Delete || edit.op === HexDocumentEditOp.Replace) {
			const { before } = getSplit(editIndex, split, edit.offset - split.offset);
			let until = searcher(edit.offset + edit.previous.length, ranges);
			if (until === ranges.length || ranges[until].offset > edit.offset) {
				until--;
			}

			const { after } = getSplit(
				editIndex,
				ranges[until],
				edit.offset + edit.previous.length - ranges[until].offset,
			);
			ranges.splice(
				i,
				until - i + 1,
				before,
				edit.op === HexDocumentEditOp.Replace
					? { op: EditRangeOp.Insert, editIndex, offset: edit.offset, value: edit.value }
					: { op: EditRangeOp.Skip, editIndex, offset: edit.offset },
				after,
			);

			shiftAfter(
				i + 2,
				(edit.op === HexDocumentEditOp.Replace ? edit.value.length : 0) - edit.previous.length,
			);
		}
	}

	return { ranges, sizeDelta };
};
