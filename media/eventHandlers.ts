// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { clearDataInspector, populateDataInspector } from "./dataInspector";
import { vscode } from "./hexEdit";
import { ByteData } from "./byteData";
import { getElementsGivenMouseEvent, getElementsWithGivenOffset } from "./util";



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

/**
 * @description Removes the selected class from all elements, this is helpful when ensuring only one byte and its associated decoded text is selected
 */
function clearSelected(): void {
	document.querySelectorAll(".selected").forEach(element => element.classList.remove("selected"));
}

/**
 * @description Given two elements (the hex and ascii elements), returns a ByteData object representing both of them
 * @param {NodeListOf<Element>} elements The elements representing the hex and associated ascii on the DOM
 * @returns {ByteData | undefined} The ByteData object or undefined if elements was malformed or empty
 */
function retrieveSelectedByteObject(elements: NodeListOf<Element>): ByteData | undefined {
	for (const element of Array.from(elements)) {
		if (element.parentElement?.parentElement && element.parentElement.parentElement.id == "hexbody") {
			const byte_object = new ByteData(parseInt(element.innerHTML, 16));
			let current_element = element.nextElementSibling || element.parentElement.nextElementSibling?.children[0];
			for (let i = 0; i < 7; i++) {
				if (!current_element) break;
				byte_object.addAdjacentByte(new ByteData(parseInt(current_element.innerHTML, 16)));
				current_element = current_element.nextElementSibling || current_element.parentElement?.nextElementSibling?.children[0];
			}
			return byte_object;
		}
    }
    return;
}

/**
 * @description Given an offset, selects the hex and ascii element
 * @param {number} offset  The offset of the element you want to select
 */
export function selectByOffset(offset: number): void {
	clearSelected();
	const elements = getElementsWithGivenOffset(offset);
	const byte_obj = retrieveSelectedByteObject(elements);
	if (!byte_obj) return;
	const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
	populateDataInspector(byte_obj, littleEndian);
	vscode.setState({ selected_offset: offset });
	elements[0].classList.add("selected");
	elements[1].classList.add("selected");
}

/**
 * @description Selects the clicked element and its associated hex/ascii
 * @param {MouseEvent} event MouseEvent handed to a click listener
 */
export function select(event: MouseEvent): void  {
    if (!event || !event.target) return;
    const elements = getElementsGivenMouseEvent(event);
    if (!elements) return;
    // We toggle the select off if they clicked the same element
	if (elements[0].classList.contains("selected")) {
        if (document.activeElement) {
            (document.activeElement as HTMLElement).blur();
        }
        
		vscode.setState({ selected_offset: undefined });
		clearDataInspector();
		elements[0].classList.remove("selected");
		elements[1].classList.remove("selected");
	} else {
		clearSelected();
		(event.target as HTMLElement).focus();
		vscode.setState({ selected_offset: (event.target as HTMLElement).getAttribute("data-offset") });
        const byte_obj = retrieveSelectedByteObject(elements);
        // This will only be undefined if we pass in bad elements which in theory shouldn't happen
		if (!byte_obj) return;
		const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
		populateDataInspector(byte_obj, littleEndian);
		elements[0].classList.add("selected");
		elements[1].classList.add("selected");
	}
}

// This is bound to the on change event for the select which decides to render big or little endian
/**
 * @description Handles when the user changes the dropdown for whether they want little or big endianness 
 */
export function changeEndianness(): void {
	if (document.activeElement && vscode.getState() && vscode.getState().selected_offset) {
		// Since the inspector has no sense of state, it doesn't know what byte it is currently rendering
		// We must retrieve it based on the dom
		const elements = getElementsWithGivenOffset(vscode.getState().selected_offset);
		const byte_obj = retrieveSelectedByteObject(elements);
		if (!byte_obj) return;
		const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
		populateDataInspector(byte_obj, littleEndian);
	}
}