// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { window } from "vscode";

export function getNonce(): string {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * @description Opens the input box so the user can input which offset they want to go to
 */
export async function openOffsetInput(): Promise<string | undefined> {
	return window.showInputBox({
		placeHolder: "Enter offset to go to",
		validateInput: text => {
			return text.length > 8 || new RegExp("^[a-fA-F0-9]+$").test(text) ? null : "Invalid offset string";
		}
	});
}