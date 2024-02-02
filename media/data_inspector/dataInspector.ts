// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { inspectableTypes } from "../editor/dataInspectorProperties";

/**
 * Gets (building if necessary) the input elements for each inspectable
 * type, in order.
 */
const getInputElements = (() => {
	let inputs: HTMLInputElement[] | undefined;

	return () => {
		if (inputs) {
			return inputs;
		}

		const container = document.querySelector("#data-inspector .grid-container") as HTMLElement;
		const existingChild = container.firstElementChild;
		inputs = [];

		for (const { label } of inspectableTypes) {
			const labelGridItem = document.createElement("div");
			labelGridItem.className = "grid-item";
			const labelEl = labelGridItem.appendChild(document.createElement("label"));
			labelEl.htmlFor = `inspect-${label}`;
			labelEl.textContent = label;

			const inputGridItem = document.createElement("div");
			inputGridItem.className = "grid-item";
			const inputEl = inputGridItem.appendChild(document.createElement("input"));
			inputEl.id = `inspect-${label}`;
			inputEl.type = "text";
			inputEl.disabled = true;
			inputEl.readOnly = true;
			inputEl.autocomplete = "off";
			inputEl.spellcheck = false;

			container.insertBefore(labelGridItem, existingChild);
			container.insertBefore(inputGridItem, existingChild);
			inputs.push(inputEl);
		}

		return inputs;
	};
})();

/**
 * @description Builds input elemenets and labels for the data inspector.
 */
export const buildDataInspectorUi = () => {
	getInputElements();
};

/**
 * @description Clears the data inspector back to its default state
 */
export function clearDataInspector(): void {
	for (const element of getInputElements()) {
		element.disabled = true;
		element.value = "";
	}
}

/**
 * @description Giving an ArrayBuffer object and what endianness, populates the data inspector
 * @param {ByteData} arrayBuffer The ArrayBuffer object to represent on the data inspector
 * @param {boolean} littleEndian Wether the data inspector is in littleEndian or bigEndian mode
 */
export function populateDataInspector(arrayBuffer: ArrayBuffer, littleEndian: boolean): void {
	const dv = new DataView(arrayBuffer);
	const inputElements = getInputElements();
	for (let i = 0; i < inputElements.length; i++) {
		const element = inputElements[i];
		const { convert, minBytes } = inspectableTypes[i];
		if (dv.byteLength < minBytes) {
			element.disabled = true;
			element.value = "End of File";
		} else {
			element.disabled = false;
			element.value = convert(dv, littleEndian);
		}
	}
}

// This is bound to the on change event for the select which decides to render big or little endian
/**
 * @description Handles when the user changes the dropdown for whether they want little or big endianness
 * @param {ByteData} arrayBuffer The ArrayBuffer object to represent on the data inspector
 */
export function changeEndianness(arrayBuffer: ArrayBuffer): void {
	const littleEndian =
		(document.getElementById("endianness") as HTMLInputElement).value === "little";
	populateDataInspector(arrayBuffer, littleEndian);
}
