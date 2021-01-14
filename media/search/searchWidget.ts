// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

declare const acquireVsCodeApi: any;
export const vscode = acquireVsCodeApi();

// Self executing anonymous function
// This is the main entry point for the widget
((): void=> {

  // Handle messages which are sent to the search widget
	window.addEventListener("message", async e => {
    console.log(e);
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: "ready" });
})();

