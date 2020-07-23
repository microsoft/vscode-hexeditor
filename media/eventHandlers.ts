// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getElementsGivenMouseEvent, getElementsWithGivenOffset, retrieveSelectedByteObject } from "./util";
import { WebViewStateManager } from "./webviewStateManager";
import { populateDataInspector } from "./dataInspector";

/**
 * @description Handles what should be done when an element is hovered over
 * @param {MouseEvent} event The event which is handed to a mouse event listener 
 */
export function hover(event: MouseEvent): void {
    const elements = getElementsGivenMouseEvent(event);
    if (!elements) return;
	elements[0].classList.add("hover");
	elements[1].classList.add("hover");
}

/**
 * @description Handles what should be done when an element is no longer hovered over
 * @param {MouseEvent} event The event which is handed to a mouse event listener 
 */
export function removeHover(event: MouseEvent): void {
    const elements = getElementsGivenMouseEvent(event);
    if (!elements) return;
	elements[0].classList.remove("hover");
	elements[1].classList.remove("hover");
}

// This is bound to the on change event for the select which decides to render big or little endian
/**
 * @description Handles when the user changes the dropdown for whether they want little or big endianness 
 */
export function changeEndianness(): void {
	if (document.activeElement) {
		// Since the inspector has no sense of state, it doesn't know what byte it is currently rendering
		// We must retrieve it based on the dom
		const offset = document.activeElement.getAttribute("data-offset");
		if (offset === null) return;
		const elements = getElementsWithGivenOffset(parseInt(offset));
		const byte_obj = retrieveSelectedByteObject(elements);
		if (!byte_obj) return;
		const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
		populateDataInspector(byte_obj, littleEndian);
	}
}