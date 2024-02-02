// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Assorted helper functions

import { Range } from "../../shared/util/range";
import _style from "./util.css";

/**
 * Wraps the object in another object that throws when accessing undefined properties.
 */
export const throwOnUndefinedAccessInDev = <T extends object>(value: T): T => {
	if (process.env.NODE_ENV === "production") {
		return value; // check that react does too, and esbuild defines
	}

	return new Proxy<T>(value, {
		get: (target, prop) => {
			if (prop in target) {
				return (target as any)[prop];
			}

			throw new Error(`Accessing undefined property ${String(prop)}`);
		},
	});
};

const style = throwOnUndefinedAccessInDev(_style);

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
	ranges.push(new Range(127));
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

/**
 * Returns `x` clamped between the provided lower and upper bounds.
 */
export const clamp = (lower: number, x: number, upper: number): number =>
	Math.max(lower, Math.min(upper, x));

/**
 * Parses the string as hex. Non-hex characters will be treated as 0.
 */
export const hexDecode = (str: string): Uint8Array => {
	const value = new Uint8Array(Math.ceil(str.length / 2));
	for (let i = 0; i < str.length; i += 2) {
		value[i >>> 1] = ((parseHexDigit(str[i]) || 0) << 4) | (parseHexDigit(str[i + 1]) || 0);
	}

	return value;
};

export const isHexString = (s: string): boolean => {
	for (const char of s) {
		if (parseHexDigit(char) === undefined) {
			return false;
		}
	}

	return true;
};

export const parseHexDigit = (s: string): number | undefined => {
	switch (s) {
		case "0":
			return 0;
		case "1":
			return 1;
		case "2":
			return 2;
		case "3":
			return 3;
		case "4":
			return 4;
		case "5":
			return 5;
		case "6":
			return 6;
		case "7":
			return 7;
		case "8":
			return 8;
		case "9":
			return 9;
		case "a":
			return 10;
		case "A":
			return 10;
		case "b":
			return 11;
		case "B":
			return 11;
		case "c":
			return 12;
		case "C":
			return 12;
		case "d":
			return 13;
		case "D":
			return 13;
		case "e":
			return 14;
		case "E":
			return 14;
		case "f":
			return 15;
		case "F":
			return 15;
		default:
			return undefined;
	}
};

/** Calculates the dimensions of the browser scrollbar */
export const getScrollDimensions = (() => {
	let value: { width: number; height: number } | undefined;
	return () => {
		if (value !== undefined) {
			return value;
		}

		const el = document.createElement("div");
		el.classList.add(style.scrollbar);
		document.body.appendChild(el);
		const width = el.offsetWidth - el.clientWidth;
		const height = el.offsetHeight - el.clientHeight;
		document.body.removeChild(el);
		value = { width, height };
		return value;
	};
})();
