// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Assorted helper functions

export const isMac = navigator.userAgent.indexOf("Mac OS X") >= 0;

/**
 * Returns truthy classes passed in as parameters joined into a class string.
 */
export const clsx = (...classes: (string | false | undefined | null)[]): string | undefined => {
	let out: undefined | string;
	for (const cls of classes) {
		if (cls) {
			out = out ? `${out} ${cls}` : cls;
		}
	}

	return out;
};

/** Direction for the {@link Range} */
export const enum RangeDirection {
	/** When the range was constructed, end >= start */
	Ascending,
	/** When the range was constructed, start > end */
	Descending,
}

/**
 * @description Class which represents a range of numbers. Ranges represent
 * a number range [start, end). They may be directional, as indicated by
 * the order of arguments in the constructor and reflected in the {@link direction}.
 */
export class Range {
	public readonly direction: RangeDirection;
	/**
	 * Gets the number of integers in the range [start, end)
	 */
	public get size(): number {
		return this.end - this.start;
	}

	/**
	 * Returns a range containing the single byte.
	 */
	public static single(byte: number): Range {
		return new Range(byte, byte + 1);
	}

	/**
	 * Creates a new range representing [start, end], inclusive.
	 */
	public static inclusive(start: number, end: number): Range {
		return end >= start ? new Range(start, end + 1) : new Range(start + 1, end);
	}

	/**
	 * @description Constructs a range object representing [start, end)
	 * @param start Represents the start of the range
	 * @param end Represents the end of the range
	 * @param direction The direction of the range, inferred from
	 * argument order if not provided.
	 */
	constructor(
		public readonly start: number,
		public readonly end: number = Number.MAX_SAFE_INTEGER,
		direction?: RangeDirection,
	) {
		if (start < 0) {
			throw new Error("Cannot construct a range with a negative start");
		}

		if (end < start) {
			[this.start, this.end] = [end, start];
			direction ??= RangeDirection.Descending;
		} else {
			direction ??= RangeDirection.Ascending;
		}

		this.direction = direction;
	}
	/**
	 * @desciption Tests if the given number if within the range
	 * @param {number} num The number to test
	 * @returns {boolean} True if the number is in the range, false otherwise
	 */
	public includes(num: number): boolean {
		return num >= this.start && num < this.end;
	}

	/**
	 * Expands the range to include the given value, if it is not already
	 * within the range.
	 */
	public expandToContain(value: number): Range {
		if (value < this.start) {
			return new Range(value, this.end, this.direction);
		} else if (value >= this.end) {
			return new Range(this.start, value + 1, this.direction);
		} else {
			return this;
		}
	}
	/**
	 * Returns whether this range overlaps the other one.
	 */
	public overlaps(other: Range): boolean {
		return other.end > this.start && other.start < this.end;
	}
	/**
	 * Returns one or more ranges representing ranges covered by exactly one of
	 * this or the `otherRange`.
	 */
	public difference(otherRange: Range): Range[] {
		if (!this.overlaps(otherRange)) {
			return [this, otherRange];
		}

		const delta: Range[] = [];
		if (this.start !== otherRange.start) {
			delta.push(new Range(otherRange.start, this.start));
		}
		if (this.end !== otherRange.end) {
			delta.push(new Range(otherRange.end, this.end));
		}

		return delta;
	}
}

/**
 * @description Checks if the given number is in any of the ranges
 * @param {number} num The number to use when checking the ranges
 * @param {Range[]} ranges The ranges to check the number against
 * @returns {boolean} True if the number is in any of the ranges, false otherwise
 */
export function withinAnyRange(num: number, ranges: Range[]): boolean {
	for (const range of ranges) {
		if (range.includes(num)) {
			return true;
		}
	}
	return false;
}

/**
 * @description Creates a list of ranges containing the non renderable 8 bit char codes
 * @returns {Range[]} The ranges which represent the non renderable 8 bit char codes
 */
export function generateCharacterRanges(): Range[] {
	const ranges: Range[] = [];
	ranges.push(new Range(0, 32));
	ranges.push(new Range(127, 161));
	ranges.push(new Range(173, 174));
	ranges.push(new Range(256));
	return ranges;
}

const nonPrintableAsciiRange = generateCharacterRanges();

/**
 * Gets the ascii character for the byte, if it's printable.
 * @returns
 */
export const getAsciiCharacter = (byte: number): string | undefined => {
	if (withinAnyRange(byte, nonPrintableAsciiRange)) {
		return undefined;
	} else {
		return String.fromCharCode(byte);
	}
};
