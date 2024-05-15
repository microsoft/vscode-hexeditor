import { Range } from "./util/range";
export const enum HexEditorDecorationType {
	DiffAdded,
	DiffRemoved,
	DiffReplaced,
	None
}

export class HexEditorDecorationMap {
	private readonly map: Map<HexEditorDecorationType, Range[]> = new Map();

	public add(type: HexEditorDecorationType, range: Range[]) {
		if(this.map.has(type)) {
			this.map.set(type, this.map.get(type)!.concat(range));
		} else {
			this.map.set(type, range);
		}
	}

	// Returns an array of each decoration type
	public slice(begin: number, end: number) {
		const rowRange = new Range(begin, end);
		const decorationPerByte: HexEditorDecorationType[] = [];
		for(let i = rowRange.start; i < rowRange.end; i++) {
			for(const [decorationType, ranges] of this.map.entries()) {
				for(const range of ranges) {
					if(range.includes(i)) {
						decorationPerByte.push(decorationType);
						break;
					}
				}
			}
		}
		return decorationPerByte;
	}
}