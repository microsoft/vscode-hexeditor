/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { randomBytes } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { promises as fs } from "fs";
import { accessFile } from "../fileSystemAdaptor";
import * as vscode from "vscode";
import { FileAccessor } from "../../shared/fileAccessor";

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
