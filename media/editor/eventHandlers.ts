// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getElementsGivenMouseEvent } from "./util";

/**
 * @description Toggles the hover on a cell
 * @param {MouseEvent} event The event which is handed to a mouse event listener 
 */
export function toggleHover(event: MouseEvent): void {
    const elements = getElementsGivenMouseEvent(event);
    if (elements.length === 0) return;
	elements[0].classList.toggle("hover");
	elements[1].classList.toggle("hover");
}