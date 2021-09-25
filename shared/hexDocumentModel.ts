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
	edits?: HexDocumentEdit[];
	/** File to use for reading contents, useful if restoring from a backup. */
	readFile?: FileAccessor;
	/** Whether the file length is allowed to be changed. */
	supportsLengthChanges: boolean;
	/** Whether the read file is of a finite length. */
	isFiniteSize: boolean;
}

const enum RangeOp { Read, Skip, Insert }

type Range =
	| { op: RangeOp.Read, offset: number; roffset: number }
	| { op: RangeOp.Skip, offset: number; }
	| { op: RangeOp.Insert; offset: number; value: Uint8Array};

export class HexDocumentModel {
	public readonly supportsLengthChanges: boolean;
	public readonly isFiniteSize: boolean;
	private readonly accessor: FileAccessor;
	private readAccessor?: FileAccessor;
	private generation = 0;
	private _edits: HexDocumentEdit[];
	private _editTimeline?: { sizeDelta: number, ranges: readonly Range[] };

	constructor(options: HexDocumentModelOptions) {
		this._edits = options.edits || [];
		this.supportsLengthChanges = options.supportsLengthChanges;
		this.isFiniteSize = options.isFiniteSize;
		this.accessor = options.accessor;
		this.readAccessor = options.readFile;
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
	 * Gets whether there are unsaved edits on the model.
	 */
	public get isDirty(): boolean {
		return this._edits.length > 0;
	}

	/**
	 * Reads bytes at the offset into the target array.
	 */
	public readInto(offset: number, target: Uint8Array): Promise<number>	{
		return (this.readAccessor || this.accessor).read(offset, target);
	}

	/**
	 * Reads bytes in their edited state starting at the given offset.
	 */
	public readWithEdits(fromOffset = 0, chunkSize = 1024): AsyncIterableIterator<Uint8Array>	{
		return this.readUsingRanges(this.getEditTimeline().ranges, fromOffset, chunkSize);
	}

	/**
	 * Persists changes to the file.
	 */
	public async save(): Promise<void> {
		if (!this._edits.length) {
			return;
		}

		const edits = this._edits;
		const { ranges } = this.getEditTimeline();
		this.readAccessor = undefined;
		this.revert();

		// for length changes, we must rewrite the entire file. Or at least from
		// the offset of the first edit. For replacements we can selectively write.
		if (!this._edits.some(e => e.op !== HexDocumentEditOp.Replace) && !this.readAccessor) {
			await this.accessor.writeBulk(edits.map(e => ({ offset: e.offset, data: (e as HexDocumentReplaceEdit).value })));
		} else {
			await this.accessor.writeStream(this.readUsingRanges(ranges, 0));
		}
	}

	/**
	 * Revents to the contents last saved on disk, discarding edits,
	 */
	public revert(): void {
		this._edits = [];
		this._editTimeline = undefined;
		this.generation++;
	}

	/**
	 * Applies edits to the model, reutnring the handle. Undo *must* only be
	 * called once all subsequently made edits have also been undone, and
	 * vise versa for `redo`.
	 */
	public makeEdits(edits: HexDocumentEdit[]): HexDocumentEditReference {
		let currentGen = this.generation;
		let currentIndex = this._edits.length;
		this._edits.push(...edits);
		this._editTimeline = undefined;

		return {
			undo: () => {
				if (this.generation === currentGen) {
					this._edits.splice(currentIndex, edits.length);
				} else {
					this._edits.push(...edits.map(reverseEdit));
				}
				this._editTimeline = undefined;
			},
			redo: () => {
				currentIndex = this._edits.length;
				currentGen = this.generation;
				this._edits.push(...edits);
				this._editTimeline = undefined;
			},
		};
	}

	private async *readUsingRanges(ranges: readonly Range[], fromOffset: number, chunkSize = 1024): AsyncIterableIterator<Uint8Array>	{
		const buf = new Uint8Array(chunkSize);
		const readAccessor = this.readAccessor || this.accessor;
		for (let i = 0; i < ranges.length; i++) {
			const range = ranges[i];
			if (range.op === RangeOp.Skip) {
				continue;
			}

			if (range.op === RangeOp.Insert) {
				const offset = Math.max(0, fromOffset - range.offset);
				let toYield = range.value;
				if (offset < range.value.length && offset > 0) {
					toYield = range.value.subarray(offset);
				}
				if (toYield.length > 0) {
					yield toYield;
				}
				continue;
			}

			// range.op === Read
			const until = i + 1 < ranges.length ? ranges[i + 1].offset - range.offset : Infinity;
			let roffset = range.roffset + Math.max(0, fromOffset - range.offset);
			while (roffset < until) {
				const bytes = await readAccessor.read(roffset, buf.subarray(0, Math.min(buf.length, until - roffset)));
				if (bytes === 0) {
					break; // EOF
				}
				yield buf.subarray(0, bytes);
				roffset += bytes;
			}
		}
	}

	/**
	 * Gets the size of the file on disk. Takes the current generation, so that
	 * the file is re-read whenever the generation changes.
	 */
	private readonly getSizeInner =
		memoizeLast((_generation: number) => (this.readAccessor || this.accessor).getSize());

	/**
	 * Gets instructions for returning file data. Returns a list of contiguous
	 * `Range` instances. Each "range" issues instructions until the next
	 * "offset". This can be used to generate file data.
	 */
	private getEditTimeline() {
		if (this._editTimeline) {
			return this._editTimeline;
		}

		// Serialize all edits to a single, continuous "timeline", which we'll
		// iterate through in order to read data and yield bytes.
		const ranges: Range[] = [{ op: RangeOp.Read, roffset: 0, offset: 0 }];

		/** Splits the "range" into two parts at the given byte within the range */
		const getSplit = (split: Range, atByte: number): { before: Range, after: Range } => {
			if (split.op === RangeOp.Read) {
				return {
					before: { op: RangeOp.Read, roffset: split.roffset, offset: split.offset },
					after:	{ op: RangeOp.Read, roffset: split.roffset + atByte, offset: split.offset + atByte },
				};
			} else if (split.op === RangeOp.Skip) {
				return {
					before: { op: RangeOp.Skip,  offset: split.offset },
					after:	{ op: RangeOp.Skip, offset: split.offset + atByte },
				};
			} else {
				return {
					before: { op: RangeOp.Insert, offset: split.offset, value: split.value.subarray(0, atByte) },
					after: { op: RangeOp.Insert, offset: split.offset + atByte, value: split.value.subarray(atByte) },
				};
			}
		};

		const searcher = binarySearch<Range>(r => r.offset + 0.5);
		let sizeDelta = 0;

		/** Shifts the offset of all ranges after i by the amount */
		const shiftAfter = (i: number, byAmount: number) => {
			for (; i < ranges.length; i++) {
				ranges[i].offset += byAmount;
				sizeDelta += byAmount;
			}
		};

		for (const edit of this._edits) {
			const i = searcher(edit.offset, ranges) - 1;
			const split = ranges[i];

			if (edit.op === HexDocumentEditOp.Insert) {
				const { before, after } = getSplit(split, edit.offset - split.offset);
				ranges.splice(i, 1, before, { op: RangeOp.Insert, offset: edit.offset, value: edit.value }, after);
				shiftAfter(i + 2, edit.value.length);
			} else if (edit.op === HexDocumentEditOp.Delete || edit.op === HexDocumentEditOp.Replace) {
				const { before } = getSplit(split, edit.previous.length);
				const until = searcher(edit.offset + edit.previous.length, ranges) - 1;
				const { after } = getSplit(ranges[until], edit.offset + edit.previous.length - ranges[until].offset);
				ranges.splice(
					i, until - i + 1,
					before,
					edit.op === HexDocumentEditOp.Replace
						? { op: RangeOp.Insert, offset: edit.offset, value: edit.value }
						: { op: RangeOp.Skip, offset: edit.offset },
					after
				);
				if (edit.op !== HexDocumentEditOp.Replace) {
					shiftAfter(i + 2, -edit.previous.length);
				}
			}
		}

		return this._editTimeline = { ranges, sizeDelta };
	}
}
