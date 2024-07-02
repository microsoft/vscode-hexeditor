import { HexDecorator, HexDecoratorType } from "../decorators";
import { HexDocumentModel } from "../hexDocumentModel";
import { Range } from "./range";

type ScriptType = InsertScript | DeleteScript;

interface InsertScript {
	type: "insert";
	valuePositionModified: number;
	atPositionOriginal: number;
}

interface DeleteScript {
	type: "delete";
	atPositionOriginal: number;
}

/**
 * O(d^2) implementation
 */
export class MyersDiff {
	public static async chunkified(model: HexDocumentModel) {
		const size = await model.size();
		if (size === undefined) {
			throw new Error("undefined size");
		}
		let range = new Range(0, 1024);
		const chunk = new Uint8Array(1024);
		await model.readInto(0, chunk);

		return {
			get: async (offset: number) => {
				if (!range.includes(offset)) {
					range = new Range(
						1024 * Math.floor(offset / 1024),
						1024 * Math.floor(offset / 1024) + 1024,
					);
					await model.readInto(range.start, chunk);
				}
				return chunk[offset % 1024];
			},
		};
	}

	public static async lcs(
		original: HexDocumentModel,
		modified: HexDocumentModel,
	): Promise<Array<ScriptType>> {
		const originalChunk = await this.chunkified(original);
		const modifiedChunk = await this.chunkified(modified);

		const N = await original.size();
		const M = await modified.size();
		if (N === undefined || M === undefined) {
			return [];
		}
		const max = N + M;
		const V = new Array(2 * max + 2).fill(0);
		V[1] = 0;
		const trace: number[][] = [];

		for (let d = 0; d <= max; d++) {
			trace.push(V.slice());
			for (let k = -d; k <= d; k += 2) {
				let x: number;
				if (k === -d || (k !== d && V.at(k - 1) < V.at(k + 1))) {
					x = V.at(k + 1);
				} else {
					x = V.at(k - 1) + 1;
				}

				let y = x - k;
				while (x < N && y < M && (await originalChunk.get(x)) === (await modifiedChunk.get(y))) {
					x++;
					y++;
				}

				V[k] = x;
				if (x >= N && y >= M) {
					return this.traceback(trace, N, M);
				}
			}
		}
		return [];
	}

	private static traceback(trace: number[][], n: number, m: number): Array<ScriptType> {
		let d = trace.length - 1;
		let x = n;
		let y = m;
		const script: Array<ScriptType> = [];

		while (d >= 0) {
			const v = trace[d];
			const k = x - y;
			let prevK: number;
			if (k === -d || (k !== d && v.at(k - 1)! < v.at(k + 1)!)) {
				prevK = k + 1;
			} else {
				prevK = k - 1;
			}

			const prevX = v.at(prevK)!;
			const prevY = prevX - prevK;
			while (x > prevX && y > prevY) {
				x--;
				y--;
			}

			if (d > 0) {
				if (x == prevX) {
					script.push({ type: "insert", valuePositionModified: y - 1, atPositionOriginal: x - 1 });
				} else {
					script.push({ type: "delete", atPositionOriginal: x - 1 });
				}
				x = prevX;
				y = prevY;
			}
			d--;
		}

		return script.reverse();
	}

	public static toDecorator(script: ScriptType[]) {
		const out: {
			original: HexDecorator[];
			modified: HexDecorator[];
		} = { original: [], modified: [] };
		for (const diffType of script) {
			if (diffType.type === "delete") {
				out.original.push({
					type: HexDecoratorType.Delete,
					range: new Range(diffType.atPositionOriginal, diffType.atPositionOriginal + 1),
				});
			} else {
				//out.modified.push({
				//	type: HexDecoratorType.Insert,
				//	range: new Range(diffType.atPositionOriginal, diffType.atPositionOriginal + 1),
				//});
				out.modified.push({
					type: HexDecoratorType.Insert,
					range: new Range(diffType.valuePositionModified, diffType.valuePositionModified + 1),
				});
			}
		}
		return out;
	}
}
