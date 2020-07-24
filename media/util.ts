// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ByteData } from "./byteData";

// Assorted helper functions

/**
 * @description Class which represents a range of numbers
 */
export class Range {
    public readonly start: number;
    public readonly end: number;

    /**
     * @description Constructs a range object representing [start, end] inclusive of both
     * @param {number} start Represents the start of the range
     * @param {number} end Represents the end of the range
     */
    constructor(start: number, end: number = Number.MAX_SAFE_INTEGER) {
        if (start > end) {
            this.start = end;
            this.end = start;
        } else {
            this.start = start;
            this.end = end;
        }
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
    ranges.push(new Range(173, 173));
    ranges.push(new Range(256));
    return ranges;
}


/**
 * @description Given an offset gets all spans with that offset
 * @param {number} offset The offset to find elements of
 * @returns {NodeListOf<HTMLElement>} returns a list of HTMLElements which have the given offset
 */
export function getElementsWithGivenOffset(offset: number): NodeListOf<HTMLElement> {
    return document.querySelectorAll(`span[data-offset='${offset}'`);
}

/**
 * @description Returns the elements with the same offset as the one clicked
 * @param {MouseEvent} event The event which is handed to a mouse event listener
 * @returns {NodeListOf<Element> | undefined} The elements with the same offset as the clicked element, or undefined if none could be retrieved
 */
export function getElementsGivenMouseEvent(event: MouseEvent): NodeListOf<Element> | undefined {
    if (!event || !event.target) return;
    const hovered = event.target as Element;
    const data_offset = hovered.getAttribute("data-offset");
    if (!data_offset) return;
    return getElementsWithGivenOffset(parseInt(data_offset));
}

/**
 * @description Given a bytedata object updates the ascii element with the correct decoded text
 * @param {ByteData} byteData The object containing information about a given byte
 * @param {HTMLSpanElement} asciiElement The decoded text element on the DOM
 */
export function updateAsciiValue(byteData: ByteData, asciiElement: HTMLSpanElement): void {
    asciiElement.classList.remove("nongraphic");
    // If it's some sort of character we cannot render we just represent it as a period with the nographic class
    if (withinAnyRange(byteData.to8bitUInt(), generateCharacterRanges())) {
        asciiElement.classList.add("nongraphic");
        asciiElement.innerText = ".";
    } else {
        const ascii_char = String.fromCharCode(byteData.to8bitUInt());
        asciiElement.innerText = ascii_char;
    }
}


/**
 * @description Given a string 0 pads it up unitl the string is of length width
 * @param {string} number The number you want to 0 pad (it's a string as you're 0 padding it to display it, not to do arithmetic)
 * @param {number} width The length of the final string (if smaller than the string provided nothing happens)
 * @returns {string} The newly padded string
 */
export function pad(number: string, width: number): string {
    number = number + "";
    return number.length >= width ? number : new Array(width - number.length + 1).join("0") + number;
}


/**
 * @description Given two elements (the hex and ascii elements), returns a ByteData object representing both of them
 * @param {NodeListOf<Element>} elements The elements representing the hex and associated ascii on the DOM
 * @returns {ByteData | undefined} The ByteData object or undefined if elements was malformed or empty
 */
export function retrieveSelectedByteObject(elements: NodeListOf<Element>): ByteData | undefined {
    for (const element of Array.from(elements)) {
        if (element.parentElement && element.classList.contains("hex")) {
            const byte_object = new ByteData(parseInt(element.innerHTML, 16));
            let current_element = element.nextElementSibling || element.parentElement.nextElementSibling?.children[0];
            for (let i = 0; i < 7; i++) {
                if (!current_element || current_element.innerHTML === "+") break;
                byte_object.addAdjacentByte(new ByteData(parseInt(current_element.innerHTML, 16)));
                current_element = current_element.nextElementSibling || current_element.parentElement?.nextElementSibling?.children[0];
            }
            return byte_object;
        }
    }
    return;
}
/**
 * @description Given a start and end offset creates an array containing all the offsets in between, inclusive of start and end
 * @param {number} startOffset The offset which defines the start of the range
 * @param {number} endOffset The offset which defines the end of the range
 * @returns {number[]} The range [startOffset, endOffset]
 */
export function createOffsetRange(startOffset: number, endOffset: number): number[] {
    const offsetsToSelect = [];
    // We flip them so that the for loop creates the range correctly
    if (endOffset < startOffset) {
        const temp = endOffset;
        endOffset = startOffset;
        startOffset = temp;
    }
    // Create an array of offsets with everything between the last selected element and what the user hit shift
    for (let i = startOffset; i <= endOffset; i++) {
        offsetsToSelect.push(i);
    }
    return offsetsToSelect;
}

/**
 * @description Converts a hex query to a string array ignoring spaces, if not evenly divisible we append a leading 0 
 * i.e A -> 0A
 * @param {string} query The query to convert to an array
 */
export function hexQueryToArray(query: string): string[] {
    let currentCharacterSequence = "";
    const queryArray: string[] = [];
    for (let i = 0; i < query.length; i++) {
        if (query[i] === " ") continue;
        currentCharacterSequence += query[i];
        if (currentCharacterSequence.length === 2) {
            queryArray.push(currentCharacterSequence);
            currentCharacterSequence = "";
        }
    }
    if (currentCharacterSequence.length > 0)  {
        queryArray.push("0" + currentCharacterSequence);
    }
    return queryArray;
}

/**
 * @description Given two sorted collections of numbers, returns the union
 * between them (OR).
 * @param {number[]} one The first sorted array of numbers
 * @param {number[]} other The other sorted array of numbers
 * @returns {number[]} A sorted collections of numbers representing the union (OR)
 * between to sorted collections of numbers
 */
export function disjunction(one: number[], other: number[]): number[] {
    const result: number[] = [];
    let i = 0, j = 0;

    while (i < one.length || j < other.length) {
        if (i >= one.length) {
            result.push(other[j++]);
        } else if (j >= other.length) {
            result.push(one[i++]);
        } else if (one[i] === other[j]) {
            result.push(one[i]);
            i++;
            j++;
            continue;
        } else if (one[i] < other[j]) {
            result.push(one[i++]);
        } else {
            result.push(other[j++]);
        }
    }

    return result;
}

/**
 * @description Given two sorted collections of numbers, returns the relative
 * complement between them (XOR).
 * @param {number[]} one The first sorted array of numbers
 * @param {number[]} other The other sorted array of numbers
 * @returns {number[]} A sorted collections of numbers representing the complement (XOR)
 * between to sorted collections of numbers
 */
export function relativeComplement(one: number[], other: number[]): number[] {
    const result: number[] = [];
    let i = 0, j = 0;

    while (i < one.length || j < other.length) {
        if (i >= one.length) {
            result.push(other[j++]);
        } else if (j >= other.length) {
            result.push(one[i++]);
        } else if (one[i] === other[j]) {
            i++;
            j++;
            continue;
        } else if (one[i] < other[j]) {
            result.push(one[i++]);
        } else {
            result.push(other[j++]);
        }
    }

    return result;
}

/**
 * @description Searches a key element inside a sorted array.
 * @template T
 * @param {T[]} array The sorted array to search in
 * @param {T} key The key to search for in the sorted array
 * @param {comparatorCallback} comparator The comparator callback
 * @returns {number} The at which a given element can be found in the array, or a negative value if it is not present
 */
export function binarySearch<T>(array: ReadonlyArray<T>, key: T, comparator: (op1: T, op2: T) => number): number {
    let low = 0,
        high = array.length - 1;

    while (low <= high) {
        const mid = ((low + high) / 2) | 0;
        const comp = comparator(array[mid], key);
        if (comp < 0) {
            low = mid + 1;
        } else if (comp > 0) {
            high = mid - 1;
        } else {
            return mid;
        }
    }
    return -(low + 1);
}
