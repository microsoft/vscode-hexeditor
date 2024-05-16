import { Range } from "./util/range";
export const enum HexEditorDecorationType {
	DiffAdded,
	DiffRemoved,
	DiffReplaced,
	None
}

export class HexEditorDecorationMap {
	private readonly map: Map<HexEditorDecorationType, Range[]>;

	constructor() {
		this.map = new Map();
	}

	public add(type: HexEditorDecorationType, range: Range[]) {
		if(this.map.has(type)) {
			this.map.set(type, this.map.get(type)!.concat(range));
		} else {
			this.map.set(type, range);
		}
	}

	public getEntries() {
		return this.map.entries();
	}
	
	// Returns an array the decoration type per byte
	public slice(begin: number, end: number) {
		const rowRange = new Range(begin, end);
		const decorationPerByte: HexEditorDecorationType[] = [];
		for(let i = rowRange.start; i < rowRange.end; i++) {
			for(const [decorationType, ranges] of this.map.entries()) {
				let found = false;
				for(const range of ranges) {
					if(range.includes(i)) {
						decorationPerByte.push(decorationType);
						found = true;
						break;
					}
				}
				if(!found) {
					decorationPerByte.push(HexEditorDecorationType.None);
				}
			}
		}
		return decorationPerByte;
	}
}