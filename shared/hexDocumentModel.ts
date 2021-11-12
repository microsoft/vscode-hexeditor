/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { FileAccessor } from  "./fileAccessor";
import { binarySearch } from "./util/binarySearch";
import { memoizeLast } from "./util/memoize";

export const enum HexDocumentEditOp {
	Insert,
	Delete,
	Replace,
}

export interface GenericHexDocumentEdit {
	op: HexDocumentEditOp;
	opId: number;
	offset: number;
}

/** note: value.length === previous.length in replace operations */
export interface HexDocumentReplaceEdit  extends GenericHexDocumentEdit {
	op: HexDocumentEditOp.Replace;
	value: Uint8Array;
	previous: Uint8Array;
}

export interface HexDocumentDeleteEdit  extends GenericHexDocumentEdit {
	op: HexDocumentEditOp.Delete;
	previous: Uint8Array;
}

export interface HexDocumentInsertEdit  extends GenericHexDocumentEdit {
	op: HexDocumentEditOp.Insert;
	value: Uint8Array;
}

export type HexDocumentEdit = HexDocumentInsertEdit | HexDocumentDeleteEdit | HexDocumentReplaceEdit;

export const editsEqual = (a: readonly HexDocumentEdit[], b: readonly HexDocumentEdit[]): boolean => {
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		if (a[i].opId !== b[i].opId) {
			return false;
		}
	}

	return true;
};

export interface HexDocumentEditReference {
	undo(): void;
	redo(): void;
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

export const enum EditRangeOp { Read, Skip, Insert }

export type EditRange =
	/** Read from "roffset" in the file, starting at "offset" in the edited version */
	| { op: EditRangeOp.Read; opId: number; offset: number; roffset: number }
	/** Skip starting at "offset" in the edited version of the file */
	| { op: EditRangeOp.Skip; opId: number; offset: number; }
	/** Insert "value" at the "offset" in th edited version of the file */
	| { op: EditRangeOp.Insert; opId: number; offset: number; value: Uint8Array};

export interface IEditTimeline {
	/** Instructions on how to read the file, in order. */
	ranges: readonly EditRange[];
	/** Difference in file size as a result of the edits that were made. */
	sizeDelta: number;
}

export class HexDocumentModel {
	public readonly supportsLengthChanges: boolean;
	public readonly isFiniteSize: boolean;
	private readonly accessor: FileAccessor;
	/** First index in the _edits array that's unsaved */
	private unsavedEditIndex = 0;
	private generation = 0;
	private _edits: HexDocumentEdit[];
	private _editTimeline?: IEditTimeline;

	constructor(options: HexDocumentModelOptions) {
		this._edits = options.edits ? options.edits.saved.concat(options.edits.unsaved) : [];
		this.unsavedEditIndex = options.edits?.saved.length ?? 0;
		this.supportsLengthChanges = options.supportsLengthChanges;
		this.isFiniteSize = options.isFiniteSize;
		this.accessor = options.accessor;
	}

	/**
	 * Gets the URI associated with this document model.
	 */
	public get uri(): string {
		return this.accessor.uri;
	}

	/**
	 * Gets the document size, accounting for all edits.
	 * Returns undefined if infinite.
	 */
	public async size(): Promise<number | undefined> {
		if (!this.isFiniteSize) {
			return undefined;
		}

		const diskSize = await this.getSizeInner(this.generation);
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
	 * Gets the opId of the last saved edit.
	 */
	public get lastSavedEdit(): number {
		return this._edits[this.unsavedEditIndex - 1]?.opId ?? -1;
	}

	/**
	 * Gets whether there are unsaved edits on the model.
	 */
	public get isDirty(): boolean {
		return this._edits.length > 0;
	}

	/**
	 * Reads bytes at the offset into the target array. Returns the number of
	 * bytes that were read.
	 */
	public readInto(offset: number, target: Uint8Array): Promise<number>	{
		return this.accessor.read(offset, target);
	}

	/**
	 * Reads bytes in their edited state starting at the given offset.
	 */
	public readWithEdits(fromOffset = 0, chunkSize = 1024): AsyncIterableIterator<Uint8Array>	{
		return readUsingRanges(this.accessor, this.getEditTimeline().ranges, fromOffset, chunkSize);
	}

	/**
	 * Persists changes to the file.
	 */
	public async save(): Promise<void> {
		if (!this._edits.length) {
			return;
		}

		const edits = this._edits;

		// for length changes, we must rewrite the entire file. Or at least from
		// the offset of the first edit. For replacements we can selectively write.
		if (!edits.some(e => e.op !== HexDocumentEditOp.Replace)) {
			await this.accessor.writeBulk(edits.map(e => ({ offset: e.offset, data: (e as HexDocumentReplaceEdit).value })));
		} else {
			await this.accessor.writeStream(this.readWithEdits());
		}

		this.unsavedEditIndex = this._edits.length;
	}

	/**
	 * Reverts to the contents last saved on disk, discarding edits,
	 */
	public revert(): void {
		this.unsavedEditIndex = 0;
		this._edits = [];
		this._editTimeline = undefined;
	}

	/**
	 * Applies edits to the model, returning the handle. Undo *must* only be
	 * called once all subsequently made edits have also been undone, and
	 * vise versa for `redo`.
	 */
	public makeEdits(edits: readonly HexDocumentEdit[]): HexDocumentEditReference {
		let currentIndex = this._edits.length;
		this._edits.push(...edits);
		this._editTimeline = undefined;

		return {
			undo: () => {
				if (this.unsavedEditIndex <= currentIndex) {
					this._edits.splice(currentIndex, edits.length);
				} else {
					this._edits.push(...edits.map(reverseEdit));
				}
				this._editTimeline = undefined;
			},
			redo: () => {
				currentIndex = this._edits.length;
				this._edits.push(...edits);
				this._editTimeline = undefined;
			},
		};
	}

	/**
	 * Gets the size of the file on disk. Takes the current generation, so that
	 * the file is re-read whenever the generation changes.
	 */
	private readonly getSizeInner =
		memoizeLast((_generation: number) => this.accessor.getSize());

	/**
	 * Gets instructions for returning file data. Returns a list of contiguous
	 * `Range` instances. Each "range" issues instructions until the next
	 * "offset". This can be used to generate file data.
	 */
	private getEditTimeline() {
		if (!this._editTimeline) {
			this._editTimeline = buildEditTimeline(this._edits);
		}

		return this._editTimeline;
	}
}

export async function *readUsingRanges(readable: Pick<FileAccessor, "read">, ranges: readonly EditRange[], fromOffset = 0, chunkSize = 1024): AsyncIterableIterator<Uint8Array>	{
	const buf = new Uint8Array(chunkSize);
	for (let i = 0; i < ranges.length; i++) {
		const range = ranges[i];
		if (range.op === EditRangeOp.Skip) {
			continue;
		}

		if (range.op === EditRangeOp.Insert) {
			const readLast = (range.offset + range.value.length) - fromOffset;
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
		const until = i + 1 < ranges.length ? ranges[i + 1].offset : Infinity;
		let roffset = range.roffset + Math.max(0, fromOffset - range.offset);
		while (roffset < until) {
			const bytes = await readable.read(roffset, buf.subarray(0, Math.min(buf.length, until - roffset)));
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
	const ranges: EditRange[] = [{ op: EditRangeOp.Read, opId: -1, roffset: 0, offset: 0 }];

	/** Splits the "range" into two parts at the given byte within the range */
	const getSplit = (split: EditRange, atByte: number): { before: EditRange, after: EditRange } => {
		if (split.op === EditRangeOp.Read) {
			return {
				before: { op: EditRangeOp.Read, opId: split.opId, roffset: split.roffset, offset: split.offset },
				after:	{ op: EditRangeOp.Read, opId: split.opId, roffset: split.roffset + atByte, offset: split.offset + atByte },
			};
		} else if (split.op === EditRangeOp.Skip) {
			return {
				before: { op: EditRangeOp.Skip, opId: split.opId, offset: split.offset },
				after:	{ op: EditRangeOp.Skip, opId: split.opId, offset: split.offset + atByte },
			};
		} else {
			return {
				before: { op: EditRangeOp.Insert, opId: split.opId, offset: split.offset, value: split.value.subarray(0, atByte) },
				after: { op: EditRangeOp.Insert, opId: split.opId, offset: split.offset + atByte, value: split.value.subarray(atByte) },
			};
		}
	};

	const searcher = binarySearch<EditRange>(r => r.offset);
	let sizeDelta = 0;

	/** Shifts the offset of all ranges after i by the amount */
	const shiftAfter = (i: number, byAmount: number) => {
		for (; i < ranges.length; i++) {
			ranges[i].offset += byAmount;
			sizeDelta += byAmount;
		}
	};

	for (const edit of edits) {
		let i = searcher(edit.offset, ranges);
		if (i === ranges.length || ranges[i].offset > edit.offset) {
			i--;
		}
		const split = ranges[i];

		if (edit.op === HexDocumentEditOp.Insert) {
			const { before, after } = getSplit(split, edit.offset - split.offset);
			ranges.splice(i, 1, before, { op: EditRangeOp.Insert, opId: edit.opId, offset: edit.offset, value: edit.value }, after);
			shiftAfter(i + 2, edit.value.length);
		} else if (edit.op === HexDocumentEditOp.Delete || edit.op === HexDocumentEditOp.Replace) {
			const { before } = getSplit(split, edit.offset - split.offset);
			let until = searcher(edit.offset + edit.previous.length, ranges);
			if (until === ranges.length || ranges[until].offset > edit.offset) {
				until--;
			}

			const { after } = getSplit(ranges[until], edit.offset + edit.previous.length - ranges[until].offset);
			ranges.splice(
				i, until - i + 1,
				before,
				edit.op === HexDocumentEditOp.Replace
					? { op: EditRangeOp.Insert, opId: edit.opId, offset: edit.offset, value: edit.value }
					: { op: EditRangeOp.Skip, opId: edit.opId, offset: edit.offset },
				after
			);
			if (edit.op !== HexDocumentEditOp.Replace) {
				shiftAfter(i + 2, -edit.previous.length);
			}
		}
	}

	return { ranges, sizeDelta };
};
