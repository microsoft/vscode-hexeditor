/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import React, { DependencyList, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RecoilValue, useRecoilValue, useRecoilValueLoadable } from "recoil";
import { ColorMap, observeColors, parseColors } from "vscode-webview-tools";
import * as select from "./state";

export const useTheme = (): ColorMap => {
	const [colors, setColors] = useState(parseColors());
	useEffect(() => observeColors(setColors), []);
	return colors;
};

/**
 * Like useEffect, but only runs when its inputs change, not on the first render.
 */
export const useLazyEffect = (fn: () => void | (() => void), inputs: React.DependencyList): void => {
	const isFirst = useRef(true);
	useEffect(() => {
		if (!isFirst.current) {
			return fn();
		}

		isFirst.current = false;
	}, inputs);
};

/**
 * Like useState, but also persists changes to the VS Code webview API.
 */
export const usePersistedState = <T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
	const [value, setValue] = useState<T>(select.vscode.getState()?.[key] ?? defaultValue);

	useLazyEffect(() => {
		select.vscode.setState({ ...select.vscode.getState(), [key]: value });
	}, [value]);

	return [value, setValue];
};

/**
 * An effect-priority hook that invokes the function when the value changes.
 */
export const useOnChange = <T>(value: T, fn: (value: T, previous: T) => void): void => {
	const previous = useRef<T>(value);
	useEffect(() => {
		if (value !== previous.current) {
			fn(value, previous.current);
			previous.current = value;
		}
	}, [value]);
};

let idCounter = 0;

/** Creates a unique ID for use in the DOM */
export const useUniqueId = (prefix = "uniqueid-"): string =>
	useMemo(() => `${prefix}${idCounter++}`, [prefix]);

const zeroRect: DOMRectReadOnly = new DOMRect();

/** Uses the measured DOM size of the element, watching for resizes. */
export const useSize = (target: React.RefObject<HTMLElement>): DOMRectReadOnly => {
	const [size, setSize] = useState<DOMRectReadOnly>(zeroRect);

	const observer = useMemo(() => new ResizeObserver(entry => {
		if (entry.length) {
			setSize(entry[0].target.getBoundingClientRect());
		}
	}), []);

	useLayoutEffect(() => {
		if (!target.current) {
			return;
		}

		const el = target.current;
		setSize(el.getBoundingClientRect());
		observer.observe(el);
		return () => observer.unobserve(el);
	}, [target.current]);

	return size;
};

export const useLastAsyncRecoilValue = <T>(value: RecoilValue<T>): [value: T, isStale: boolean] => {
	const loadable = useRecoilValueLoadable(value);
	const lastValue = useRef<{ value: T, key: string, isStale: boolean }>();
	switch (loadable.state) {
		case "hasValue":
			lastValue.current = { value: loadable.contents, isStale: false, key: value.key };
			break;
		case "loading":
			if (lastValue.current?.key !== value.key) {
				throw loadable.contents; // throwing a promise will trigger <Suspense />
			} else {
				lastValue.current.isStale = true;
			}
			break;
		case "hasError":
			throw loadable.contents;
		default:
			throw new Error(`Unknown loadable state ${JSON.stringify(loadable)}`);
	}

	return [lastValue.current.value, lastValue.current.isStale];
};

export const useGlobalHandler = <T = Event>(name: string, handler: (evt: T) => void, deps: DependencyList = []) => {
	useEffect(() => {
		const l = (evt: Event) => handler(evt as unknown as T);
		window.addEventListener(name, l);
		return () => window.removeEventListener(name, l);
	}, deps);
};


/**
 * Hook that returns up to "count" bytes at the offset in the file.
 * @param offset The byte offset in the file
 * @param count The number of bytes to read
 * @param useLastAsync Whether to use stale bytes if new ones are being edited
 * in, as opposed to allowing the component to Suspend.
 */
export const useFileBytes = (offset: number, count: number, useLastAsync = false) => {
	const dataPageSize = useRecoilValue(select.dataPageSize);
	if (count > dataPageSize) {
		throw new Error("Cannot useFileBytes() with a count larger than the page size");
	}

	// We have to select both the 'start' and 'end' page since the data might
	// span across multiple. (We enforce the count is never larger than a page
	// size, so 2 is all we need.)
	const startPageNo = Math.floor(offset / dataPageSize);
	const startPageStartsAt = startPageNo * dataPageSize;
	const endPageNo = Math.floor((offset + count) / dataPageSize);
	const endPageStartsAt = endPageNo * dataPageSize;

	const startPageSelector = select.editedDataPages(startPageNo);
	const endPageSelector = select.editedDataPages(endPageNo);

	const startPage = useLastAsync ? useLastAsyncRecoilValue(startPageSelector)[0] : useRecoilValue(startPageSelector);
	const endPage = useLastAsync ? useLastAsyncRecoilValue(endPageSelector)[0] : useRecoilValue(endPageSelector);
	const target = useMemo(() => new Uint8Array(count), [count]);

	for (let i = 0; i < count; i++) {
		const value = offset + i >= endPageStartsAt
			? endPage[offset + i - endPageStartsAt]
			: startPage[offset + i - startPageStartsAt];
		if (value === undefined) {
			return target.subarray(0, i);
		}

		target[i] = value;
	}

	return target;
};
