// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
	buildDataInspectorUi,
	changeEndianness,
	clearDataInspector,
	populateDataInspector,
} from "./dataInspector";

declare const acquireVsCodeApi: any;
export const vscode = acquireVsCodeApi();
let currentByteData: ArrayBuffer;

// Self executing anonymous function
// This is the main entry point
((): void => {
	buildDataInspectorUi();

	// Handle messages which are sent to the inspector
	window.addEventListener("message", async e => {
		switch (e.data.method) {
			case "update":
				currentByteData = e.data.data;
				populateDataInspector(
					currentByteData,
					(document.getElementById("endianness") as HTMLSelectElement).value === "little",
				);
				return;
			case "clear":
				clearDataInspector();
				return;
		}
	});

	// Signal to VS Code that the webview is initialized.
	// On the inspector side we currently don't do anything with this message
	vscode.postMessage({ type: "ready" });
})();

// Bind an event listener to detect when the user changes the endinaness
document
	.getElementById("endianness")
	?.addEventListener("change", () => changeEndianness(currentByteData));
