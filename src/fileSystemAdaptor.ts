// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as vscode from "vscode";
import { FileAccessor, FileWriteOp } from "../shared/fileAccessor";
import { once } from "../shared/util/once";
import { Policy } from "cockatiel";

export const accessFile = async (uri: vscode.Uri, untitledDocumentData?: Uint8Array): Promise<FileAccessor> => {
	if (uri.scheme === "untitled") {
		return new UntitledFileAccessor(uri, untitledDocumentData ?? new Uint8Array());
	}

	// try to use native file access for local files to allow large files to be handled efficiently
	// todo@connor4312/lramos: push forward extension host API for this.
	if (uri.scheme === "file") {
		try {
			const fs = await import("fs");
			if ((await fs.promises.stat(uri.fsPath)).isFile()) {
				return new NativeFileAccessor(uri, fs);
			}
		} catch {
			// probably not node.js, or file does not exist
		}
	}

	return new SimpleFileAccessor(uri);
};

/** Native accessor using Node's filesystem. This can be used. */
class NativeFileAccessor implements FileAccessor {
	public readonly uri: string;
	public readonly supportsIncremetalAccess = true;
	private readonly fsPath: string;
	private readonly writeGuard = Policy.bulkhead(1, Infinity);

	constructor(uri: vscode.Uri, private readonly fs: typeof import("fs")) {
		this.uri = uri.toString();
		this.fsPath = uri.fsPath;
	}

	async getSize(): Promise<number | undefined> {
		const fd = await this.getHandle();
		return (await fd.stat()).size;
	}

	async read(offset: number, target: Uint8Array): Promise<number> {
		const fd = await this.getHandle();
		const { bytesRead } = await fd.read(target, 0, target.byteLength, offset);
		return bytesRead;
	}

	writeBulk(ops: readonly FileWriteOp[]): Promise<void> {
		return this.writeGuard.execute(async () => {
			const fd = await this.getHandle();
			for (const { data, offset } of ops) {
				fd.write(data, 0, data.byteLength, offset);
			}
		});
	}

	async writeStream(stream: AsyncIterable<Uint8Array>, cancellation?: vscode.CancellationToken): Promise<void> {
		return this.writeGuard.execute(async () => {
			if (cancellation?.isCancellationRequested) {
				return;
			}

			const fd = await this.getHandle();
			let offset = 0;
			for await (const chunk of stream) {
				if (cancellation?.isCancellationRequested) {
					return;
				}

				await fd.write(chunk, 0, chunk.byteLength, offset);
				offset += chunk.byteLength;
			}
		});
	}

	public dispose() {
		this.getHandle.getValue()?.then(h => h.close()).catch(() => { /* ignore */ });
	}

	private readonly getHandle = once(async () => {
		try {
			return await this.fs.promises.open(this.fsPath, this.fs.constants.O_RDWR | this.fs.constants.O_CREAT);
		} catch (e) {
			this.getHandle.forget();
			throw e;
		}
	});
}

class SimpleFileAccessor implements FileAccessor {
	protected contents?: Thenable<Uint8Array> | Uint8Array;
	public readonly uri: string;

	constructor(uri: vscode.Uri) {
		this.uri = uri.toString();
	}

	async getSize(): Promise<number> {
		return (await vscode.workspace.fs.stat(vscode.Uri.parse(this.uri))).size;
	}

	async read(offset: number, data: Uint8Array): Promise<number> {
		const contents = await this.getContents();
		const cpy = Math.min(data.length, contents.length - offset);
		data.set(contents.subarray(offset, cpy + offset));
		return cpy;
	}

	async writeStream(stream: AsyncIterable<Uint8Array>, cancellation?: vscode.CancellationToken): Promise<void> {
		let length = 0;
		const chunks: ArrayLike<number>[] = [];
		for await (const chunk of stream) {
			if (cancellation?.isCancellationRequested) {
				throw new vscode.CancellationError();
			}

			chunks.push(chunk);
			length += chunk.length;
		}

		const data = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) {
			data.set(chunk, offset);
			offset += chunk.length;
		}

		await vscode.workspace.fs.writeFile(vscode.Uri.parse(this.uri), data);
	}

	async writeBulk(ops: readonly FileWriteOp[]): Promise<void> {
		const contents = await this.getContents();
		for (const { data, offset } of ops) {
			contents.set(data, offset);
		}
		return vscode.workspace.fs.writeFile(vscode.Uri.parse(this.uri), contents);
	}

	public invalidate(): void {
		this.contents = undefined;
	}

	dispose() {
		this.contents = undefined;
	}

	private getContents() {
		this.contents ??= vscode.workspace.fs.readFile(vscode.Uri.parse(this.uri));
		return this.contents;
	}
}

class UntitledFileAccessor extends SimpleFileAccessor {
	protected override contents: Uint8Array;

	constructor(uri: vscode.Uri, untitledContents: Uint8Array) {
		super(uri);
		this.contents = untitledContents;
	}

	public override getSize() {
		return Promise.resolve(this.contents.byteLength);
	}
}
