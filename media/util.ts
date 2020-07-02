// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ByteData } from "./byteData";
import { selectByOffset } from "./eventHandlers";

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

/***
 * @description Given an offset, selects the elements and focuses the element in the same column as previous focus. Defaults to hex.
 * @param {number} offset The offset of the elements you want to select and focus
 */
export function focusElementWithGivenOffset(offset: number): void {
    const elements = getElementsWithGivenOffset(offset);
    if (elements.length != 2) return;
    selectByOffset(offset);
    // If an ascii element is currently focused then we focus that, else we focus hex
    if (document.activeElement?.parentElement?.parentElement?.parentElement?.classList.contains("right")) {
        elements[1].focus();
    } else {
        elements[0].focus();
    }
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
