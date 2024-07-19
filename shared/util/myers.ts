import { ArrayChange, diffArrays } from "diff";
import * as vscode from "vscode";
import { HexDecorator, HexDecoratorType } from "../decorators";
import { HexDocumentModel } from "../hexDocumentModel";
import { Range } from "./range";

/**
 * O(d^2) implementation
 */
export class MyersDiff {
	public static async lcs(original: HexDocumentModel, modified: HexDocumentModel) {
		const oSize = await original.sizeWithEdits();
		const mSize = await modified.sizeWithEdits();
		if (oSize === undefined || mSize === undefined) {
			throw new Error(vscode.l10n.t("HexEditor Diff: Failed to get file sizes."));
		}

		const oArray = new Uint8Array(oSize);
		const mArray = new Uint8Array(mSize);
		await original.readInto(0, oArray);
		await modified.readInto(0, mArray);
		// the types in @types/diff are incomplete.
		const changes: ArrayChange<any>[] | undefined = diffArrays(
			oArray as any,
			mArray as any,
			{
				timeout: 30000, // timeout in milliseconds
			} as any,
		);

		// Triggered timeout
		if (changes === undefined) {
			throw new Error(
				vscode.l10n.t(
					"HexEditor Diff: Reached maximum computation time to compute diff. This usually happens when comparing large files.",
				),
			);
		}
		return changes;
	}

	public static toDecorator(script: ArrayChange<any>[]) {
		const out: {
			original: HexDecorator[];
			modified: HexDecorator[];
		} = { original: [], modified: [] };
		let offset = 0;
		for (const change of script) {
			const r = new Range(offset, offset + change.count!);
			if (change.removed) {
				out.original.push({
					type: HexDecoratorType.Delete,
					range: r,
				});
				out.modified.push({
					type: HexDecoratorType.Empty,
					range: r,
				});
			} else if (change.added) {
				out.original.push({
					type: HexDecoratorType.Empty,
					range: r,
				});
				out.modified.push({
					type: HexDecoratorType.Insert,
					range: r,
				});
			}
			offset += change.count!;
		}
		return out;
	}
}
