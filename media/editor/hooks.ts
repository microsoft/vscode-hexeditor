/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

const zeroRect: DOMRectReadOnly = new DOMRect();

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
