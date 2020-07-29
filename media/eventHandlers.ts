// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getElementsGivenMouseEvent, getElementsWithGivenOffset, retrieveSelectedByteObject, getElementsOffset } from "./util";
import { populateDataInspector } from "./dataInspector";

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

// This is bound to the on change event for the select which decides to render big or little endian
/**
 * @description Handles when the user changes the dropdown for whether they want little or big endianness 
 */
export function changeEndianness(): void {
	if (document.activeElement) {
		// Since the inspector has no sense of state, it doesn't know what byte it is currently rendering
		// We must retrieve it based on the dom
		const elements = getElementsWithGivenOffset(getElementsOffset(document.activeElement));
		const byte_obj = retrieveSelectedByteObject(elements);
		if (!byte_obj) return;
		const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
		populateDataInspector(byte_obj, littleEndian);
	}
}