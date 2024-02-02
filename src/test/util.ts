/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as vscode from "vscode";
import { FileAccessor } from "../../shared/fileAccessor";
import { accessFile } from "../fileSystemAdaptor";

let testFiles: string[] = [];

export const getTempFile = async (initialContents?: Uint8Array): Promise<vscode.Uri> => {
	const fname = join(tmpdir(), `vscode-hexeditor-test-${randomBytes(8).toString("hex")}.bin`);
	testFiles.push(fname);
	if (initialContents) {
		await fs.writeFile(fname, initialContents);
	}

	return vscode.Uri.file(fname);
};

export const getTestFileAccessor = async (initialContents?: Uint8Array): Promise<FileAccessor> =>
	accessFile(await getTempFile(initialContents));

afterEach(async () => {
	await Promise.all(testFiles.map(fs.unlink));
	testFiles = [];
});

/** Simple, slow, seedable pseudo-random number generator */
export const pseudoRandom =
	(seed: string | Buffer): (() => number) =>
	() => {
		const digest = createHash("sha256").update(seed).digest();
		seed = digest;
		return digest.readUInt32BE() / 0xff_ff_ff_ff;
	};
