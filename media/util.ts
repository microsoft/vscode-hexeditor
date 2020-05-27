// Assorted helper functions


// Class which represents a range of numbers
// Used as a helper class for checking character codes
export class Range {
    private start: number;
    private end?: number;
    // Construct a range object representing [start, end] inclusive of both
    constructor (start: number, end?: number) {
        this.start = start;
        this.end = end;
    }
    
    between(num: number): boolean {
        if (this.end) {
            return num >= this.start && num <= this.end;
        } else {
            return num >= this.start;
        }
    }
}
// Given an array of a ranges and a number returns true 
// if the number is in any of the ranges, false otherwise
export function withinAnyRange(num: number, ranges: Range[]): boolean {
    for (const range of ranges) {
        if (range.between(num)) {
            return true;
        }
    }
    return false;
}

// Creates ranges containing the non renderable 8bit char codes
export function generateCharacterRanges(): Range[] {
    const ranges: Range[] = [];
    ranges.push(new Range(0, 31));
    ranges.push(new Range(127, 160));
    ranges.push(new Range(173,173));
    ranges.push(new Range(256));
    return ranges;
}

// We only check the verticle here as we are only worried about if it's in the viewport vertically
// if it's outside it horizontally we don't want to remove it, so we don't check
export function elementInViewport(element: HTMLElement): boolean {
    const rectangle = element.getBoundingClientRect();
    const windowHeight = (window.innerHeight || document.documentElement.clientHeight);
    return rectangle.top <= windowHeight && ((rectangle.top + rectangle.height) >= 0);
}