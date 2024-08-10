export enum HexDecoratorType {
	Insert,
	Delete,
	Empty,
}

export interface HexDecorator {
	type: HexDecoratorType;
	range: { start: number; end: number };
}
