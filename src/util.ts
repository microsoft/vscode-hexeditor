// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { l10n, window } from "vscode";

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
			return text.length > 8 || new RegExp("^[a-fA-F0-9]+$").test(text)
				? null
				: l10n.t("Invalid offset string");
		},
	});
}

/**
 * Gets the ArrayBuffer for a uint8array sized correctly for the array. TypedArrays
 * are allowed to point at subsets of the underlying ArrayBuffers.
 */
export const getCorrectArrayBuffer = (u8: Uint8Array): ArrayBuffer =>
	u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.buffer.slice(0, u8.byteLength);

/** Returns the number of bytes in the str when interpreted as utf-8 */
export const utf8Length = (str: string): number => {
	if (typeof Buffer !== "undefined") {
		return Buffer.byteLength(str);
	} else {
		// todo: maybe doing some loops by hand here would be faster? does it matter?
		return new Blob([str]).size;
	}
};

export const flattenBuffers = (buffers: readonly Uint8Array[]): Uint8Array => {
	let size = 0;
	for (const buffer of buffers) {
		size += buffer.byteLength;
	}

	const target = new Uint8Array(size);
	let offset = 0;
	for (const buffer of buffers) {
		target.set(buffer, offset);
		offset += buffer.byteLength;
	}

	return target;
};
