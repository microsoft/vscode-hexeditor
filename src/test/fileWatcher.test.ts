/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { expect } from "chai";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as vscode from "vscode";
import { accessFile } from "../fileSystemAdaptor";

describe("File watcher", () => {
	let dir: string;

	beforeEach(async () => {
		dir = join(tmpdir(), `vscode-hexeditor-watch-${randomBytes(8).toString("hex")}`);
		await fs.mkdir(dir);
	});

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	const waitFor = (register: (fire: () => void) => vscode.Disposable) =>
		new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				disposable.dispose();
				reject(new Error("timed out waiting for file event"));
			}, 10_000);
			const disposable = register(() => {
				clearTimeout(timeout);
				disposable.dispose();
				resolve();
			});
		});

	for (const name of ["plain.bin", "with space.bin", "[brackets].bin", "{braces}.bin"]) {
		it(`notifies about changes to ${name}`, async () => {
			const file = join(dir, name);
			await fs.writeFile(file, new Uint8Array([1, 2, 3]));
			const accessor = await accessFile(vscode.Uri.file(file));

			const changed = waitFor(fire => accessor.watch(fire, () => {}));
			// give the watcher a moment to start before touching the file
			await new Promise(r => setTimeout(r, 500));
			await fs.writeFile(file, new Uint8Array([4, 5, 6, 7]));
			await changed;

			const deleted = waitFor(fire => accessor.watch(() => {}, fire));
			await new Promise(r => setTimeout(r, 500));
			await fs.unlink(file);
			await deleted;

			accessor.dispose();
		}).timeout(30_000);
	}

	it("ignores changes to other files in the folder", async () => {
		const file = join(dir, "[a].bin");
		const sibling = join(dir, "a.bin");
		await fs.writeFile(file, new Uint8Array([1]));
		await fs.writeFile(sibling, new Uint8Array([1]));
		const accessor = await accessFile(vscode.Uri.file(file));

		let events = 0;
		const listener = accessor.watch(
			() => events++,
			() => events++,
		);
		await new Promise(r => setTimeout(r, 500));
		await fs.writeFile(sibling, new Uint8Array([2, 3]));
		await fs.unlink(sibling);
		await new Promise(r => setTimeout(r, 2000));
		listener.dispose();
		accessor.dispose();

		expect(events).to.equal(0);
	}).timeout(30_000);
});
