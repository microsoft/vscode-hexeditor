import { ArrayChange, diffArrays } from "diff";
import { HexDecorator, HexDecoratorType } from "../decorators";
import { Range } from "./range";

/**
 * O(d^2) implementation
 */
export class MyersDiff {
	public static lcs(original: Uint8Array, modified: Uint8Array) {
		// the types in @types/diff are incomplete.
		const changes: ArrayChange<any>[] | undefined = diffArrays(
			original as any,
			modified as any,
		);
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
