import { HexDocumentEdit, HexDocumentEditOp } from "./hexDocumentModel";
import { Uint8ArrayMap } from "./util/uint8ArrayMap";

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
	const allocTable = new Uint8ArrayMap<number>();
	const allocOrReuse = (buf: Uint8Array) => {
		const offset = allocTable.set(buf, () => {
			const offset = allocOffset;
			allocOffset += buf.length;
			return offset;
		});

		return { offset, len: buf.length };
	};

	const newEdits: unknown[] = [];
	for (const edit of edits) {
		if (edit.op === HexDocumentEditOp.Insert) {
			newEdits.push({ ...edit, value: allocOrReuse(edit.value) });
		} else if (edit.op === HexDocumentEditOp.Delete) {
			newEdits.push({ ...edit, previous: allocOrReuse(edit.previous) });
		} else {
			newEdits.push({
				...edit,
				previous: allocOrReuse(edit.previous),
				value: allocOrReuse(edit.value),
			});
		}
	}

	const data = new Uint8Array(allocOffset);
	for (const [buf, offset] of allocTable.entries()) {
		data.set(buf, offset);
	}

	return { data, edits: newEdits };
};

/** Reverses {@link serializeEdits} */
export const deserializeEdits = ({ edits, data }: ISerializedEdits): HexDocumentEdit[] => {
	const unref = ({ offset, len }: { offset: number; len: number }) =>
		data.slice(offset, offset + len);

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
