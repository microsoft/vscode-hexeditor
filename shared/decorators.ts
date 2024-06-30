import { Range } from "./util/range";
export enum HexDecoratorType {
}

export interface HexDecorator {
	type: HexDecoratorType;
	range: Range;
}
