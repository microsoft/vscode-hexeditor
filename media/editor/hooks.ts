/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ColorMap, observeColors, parseColors } from "vscode-webview-tools";

export const useTheme = (): ColorMap => {
  const [colors, setColors] = useState(parseColors());
  useEffect(() => observeColors(setColors), []);
  return colors;
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
