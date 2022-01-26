/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import React, { DependencyList, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RecoilValue, useRecoilValueLoadable } from "recoil";
import { ColorMap, observeColors, parseColors } from "vscode-webview-tools";
import { vscode } from "./state";

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
  const [value, setValue] = useState<T>(vscode.getState()?.[key] ?? defaultValue);

  useLazyEffect(() => {
    vscode.setState({ ...vscode.getState(), [key]: value });
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
