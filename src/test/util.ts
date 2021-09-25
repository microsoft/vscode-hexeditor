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

export const getTestFileAccessor = async (initialContents?: Uint8Array): Promise<FileAccessor> => {
	const fname = join(tmpdir(), `vscode-hexeditor-test-${randomBytes(8).toString("hex")}.bin`);
	testFiles.push(fname);
	if (initialContents) {
		await fs.writeFile(fname, initialContents);
	}

	return accessFile(vscode.Uri.file(fname));
};

afterEach(async () => {
	await Promise.all(testFiles.map(fs.unlink));
	testFiles = [];
});
