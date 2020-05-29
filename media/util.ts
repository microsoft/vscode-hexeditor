// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Assorted helper functions


/**
 * @description Class which represents a range of numbers
 */
export class Range {
    private start: number;
    private end?: number;
    // Construct a range object representing [start, end] inclusive of both
    /**
     * @description Constructs a range object represneting [start, end] inclusive of both
     * @param {number} start Represents the start of the range 
     * @param {number} end Represents the end of the range
     */
    constructor (start: number, end?: number) {
        this.start = start;
        this.end = end;
    }
    /**
     * @desciption Tests if the given number if within the range 
     * @param {number} num The number to test
     * @returns {boolean } True if the number is in the range, false otherwise
     */
    between(num: number): boolean {
        if (this.end) {
            return num >= this.start && num <= this.end;
        } else {
            return num >= this.start;
        }
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
        if (range.between(num)) {
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
    ranges.push(new Range(0, 31));
    ranges.push(new Range(127, 160));
    ranges.push(new Range(173,173));
    ranges.push(new Range(256));
    return ranges;
}