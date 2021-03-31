// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as vscode from "vscode";

/**
 * An adaptor to abstract away the extra logic required to make untitled URIs work
 * This adaptor can accept either file URIs or untitled URIs
 */
export abstract class FileSystemAdaptor {

	/**
	 * @description Calculates the size of the document associated with the uri passed in
	 * @param uri The uri
	 * @returns The file size
	 */
	public static async getFileSize(uri: vscode.Uri, untitledDocumentData?: Uint8Array): Promise<number> {
		if (uri.scheme === "untitled") {
			return untitledDocumentData?.length ?? 0;
		} else {
			return (await vscode.workspace.fs.stat(uri)).size;
		}
	}

	public static async readFile(uri: vscode.Uri, untitledDocumentData?: Uint8Array): Promise<Uint8Array> {
		if (uri.scheme === "untitled") {
			// We have the bytes so we return them
			return untitledDocumentData ?? new Uint8Array();
		} else {
			return vscode.workspace.fs.readFile(uri);
		}
	}
}