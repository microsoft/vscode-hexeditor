/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const unset = Symbol("unset");

/**
 * Simple memoizer that only remembers the last value it's been invoked with.
 */
export const once = <R>(fn: () => R): { (): R; getValue(): R | undefined; forget(): void } => {
	let value: R | typeof unset = unset;
	const wrapped = () => {
		if (value === unset) {
			value = fn();
		}

		return value;
	};

	wrapped.getValue = () => {
		return value === unset ? undefined : value;
	};

	wrapped.forget = () => {
		value = unset;
	};

	return wrapped;
};
