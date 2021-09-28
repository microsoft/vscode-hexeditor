/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as base64 from "js-base64";
import * as vscode from "vscode";
import { HexDocumentEdit } from "../shared/hexDocumentModel";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class Backup {
	constructor(private readonly uri: vscode.Uri) {}

	/** Writes the edits to the backup file. */
	public async write(edits: readonly HexDocumentEdit[]): Promise<void> {
		const serialized = JSON.stringify(
			edits,
			(_key, value) => value instanceof Uint8Array ? { $u8: base64.fromUint8Array(value) } : value,
		);

		await vscode.workspace.fs.writeFile(this.uri, encoder.encode(serialized));
	}

	/** Writes the edits to the backup file. */
	public async read(): Promise<HexDocumentEdit[]> {
		let serialized: string;
		try {
			serialized = decoder.decode(await vscode.workspace.fs.readFile(this.uri));
		} catch {
			return [];
		}

		return JSON.parse(serialized, (_key, value) => {
			if (value && typeof value === "object" && "$u8" in value) {
				return base64.toUint8Array(value.$u8);
			} else {
				return value;
			}
		});
	}
}
