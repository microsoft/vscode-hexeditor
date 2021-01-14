// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { MessageHandler } from "../common/messageHandler";
import { SearchHandler } from "./searchHandler";

// Self executing anonymous function
// This is the main entry point for the widget
((): void=> {

  // Handle messages which are sent to the search widget
	window.addEventListener("message", async e => {
    console.log(e);
	});
	// Create a message handler which can handle at most 10 requests at a time
	const messageHandler = new MessageHandler(10);
	// Initiate the search handler which handles all the keybidings
	new SearchHandler(messageHandler);
	// Signal to VS Code that the webview is initialized.
	messageHandler.postMessage("ready");
})();

