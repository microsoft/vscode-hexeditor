/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

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
 * Takes a DisplayContext-style list of ranges, where each range overlap
 * toggles the selected state of the overlapped bytes, and returns the
 * positively-selected data.
 */
export function getRangeSelectionsFromStack(ranges: readonly Range[]) {
	const result: Range[] = [];
	const pending = new Set(ranges);
	const within = new Set<Range>();
	let last = -1;
	while (pending.size || within.size) {
		let nextStart: Range | undefined;
		for (const range of pending) {
			if (!nextStart || nextStart.start > range.start) {
				nextStart = range;
			}
		}

		let nextEnd: Range | undefined;
		for (const range of within) {
			if (!nextEnd || nextEnd.end > range.end) {
				nextEnd = range;
			}
		}

		if (nextStart && (!nextEnd || nextStart.start < nextEnd.end)) {
			if (last !== -1 && within.size && within.size % 2 === 1 && last !== nextStart.start) {
				result.push(new Range(last, nextStart.start));
			}
			last = nextStart.start;
			within.add(nextStart);
			pending.delete(nextStart);
		} else if (nextEnd) {
			if (within.size % 2 === 1 && last !== nextEnd.end) {
				result.push(new Range(last, nextEnd.end));
			}
			last = nextEnd.end;
			within.delete(nextEnd);
		}
	}

	return result;
}
