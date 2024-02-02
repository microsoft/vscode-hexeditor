/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const unset = Symbol("unset");

/**
 * Simple memoizer that only remembers the last value it's been invoked with.
 */
export const memoizeLast = <T, R>(fn: (arg: T) => R): ((arg: T) => R) => {
	let lastArg: T | typeof unset = unset;
	let lastReturn: R | undefined;

	return arg => {
		if (arg !== lastArg) {
			lastReturn = fn(arg);
			lastArg = arg;
		}

		return lastReturn!;
	};
};
