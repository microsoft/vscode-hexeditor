import { Range } from "./util/range";

export enum HexDecoratorType {
	Insert,
	Delete,
}

export interface HexDecorator {
	type: HexDecoratorType;
	range: Range;
}
