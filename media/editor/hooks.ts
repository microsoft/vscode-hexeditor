/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { useEffect, useState } from "react";
import { ColorMap, observeColors, parseColors } from "vscode-webview-tools";

export const useTheme = (): ColorMap => {
  const [colors, setColors] = useState(parseColors());
  useEffect(() => observeColors(setColors), []);
  return colors;
};
