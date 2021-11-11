// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { window } from "vscode";

export function randomString(len = 32): string {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < len; i++) {
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

/**
 * Gets the ArrayBuffer for a uint8array sized correctly for the array. TypedArrays
 * are allowed to point at subsets of the underlying ArrayBuffers.
 */
export const getCorrectArrayBuffer = (u8: Uint8Array): ArrayBuffer =>
	u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.buffer.slice(0, u8.byteLength);
