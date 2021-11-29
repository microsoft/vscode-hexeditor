import { HexDocumentEdit, HexDocumentEditOp } from "./hexDocumentModel";

export interface ISerializedEdits {
	edits: readonly unknown[];
	data: Uint8Array;
}

/**
 * Serializes edits for transfer, see vscode#137757.
 *
 * Normally each edit has its own stored buffer inside of it, but this is
 * problematic. This modifies it so that there's a single Uint8Array and each
 * edit points to a region in that array for transportation.
 */
export const serializeEdits = (edits: readonly HexDocumentEdit[]): ISerializedEdits => {
	let allocOffset = 0;
	const allocTable = new Map<number, { buf: Uint8Array; offset: number }[]>();
	const allocOrReuse = (buf: Uint8Array) => {
		const hash = doHash(buf);
		const existing = allocTable.get(hash);
		if (!existing) {
			const record = { buf, offset: allocOffset };
			allocOffset += buf.length;
			allocTable.set(hash, [record]);
			return { offset: record.offset, len: buf.length };
		}

		for (const r of existing) {
			if (arrEquals(r.buf, buf)) {
				return { offset: r.offset, len: buf.length };
			}
		}


		const record = { buf, offset: allocOffset };
		allocOffset += buf.length;
		existing.push(record);
		return { offset: record.offset, len: buf.length };
	};

	const newEdits: unknown[] = [];
	for (const edit of edits) {
		if (edit.op === HexDocumentEditOp.Insert) {
			newEdits.push({ ...edit, value: allocOrReuse(edit.value) });
		} else if (edit.op === HexDocumentEditOp.Delete) {
			newEdits.push({ ...edit, previous: allocOrReuse(edit.previous) });
		} else {
			newEdits.push({ ...edit, previous: allocOrReuse(edit.previous), value: allocOrReuse(edit.value) });
		}
	}

	const data = new Uint8Array(allocOffset);
	for (const allocations of allocTable.values()) {
		for (const { buf, offset } of allocations) {
			data.set(buf, offset);
		}
	}

	return { data, edits: newEdits };
};

/** Reverses {@link serializeEdits} */
export const deserializeEdits = ({ edits, data }: ISerializedEdits): HexDocumentEdit[] => {
	const unref = ({ offset, len }: { offset: number, len: number }) => data.slice(offset, offset + len);

	return edits.map((edit: any) => {
		if (edit.op === HexDocumentEditOp.Insert) {
			return { ...edit, value: unref(edit.value) };
		} else if (edit.op === HexDocumentEditOp.Delete) {
			return { ...edit, previous: unref(edit.previous) };
		} else {
			return { ...edit, previous: unref(edit.previous), value: unref(edit.value) };
		}
	});
};

function arrEquals(a: Uint8Array, b: Uint8Array) {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}

/** Simple hash from vscode core */
function doHash(b: Uint8Array, hashVal = 0) {
	hashVal = numberHash(149417, hashVal);
	for (let i = 0, length = b.length; i < length; i++) {
		hashVal = numberHash(b[i], hashVal);
	}
	return hashVal;
}


function numberHash(val: number, initialHashVal: number): number {
	return (((initialHashVal << 5) - initialHashVal) + val) | 0;  // hashVal * 31 + ch, keep as int32
}
