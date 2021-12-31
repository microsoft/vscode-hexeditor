// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import type fs from "fs";
import * as vscode from "vscode";
import { FileAccessor, FileWriteOp } from "../shared/fileAccessor";

declare function require(_name: "fs"): typeof fs;

export const accessFile = async (uri: vscode.Uri, untitledDocumentData?: Uint8Array): Promise<FileAccessor> => {
	if (uri.scheme === "untitled") {
		return new UntitledFileAccessor(uri, untitledDocumentData ?? new Uint8Array());
	}

	if (uri.scheme === "vscode-debug-memory") {
		return new DebugFileAccessor(uri);
	}

	// try to use native file access for local files to allow large files to be handled efficiently
	// todo@connor4312/lramos: push forward extension host API for this.
	if (uri.scheme === "file") {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const fs = require("fs");
			if ((await fs.promises.stat(uri.fsPath)).isFile()) {
				return new NativeFileAccessor(uri, fs);
			}
		} catch {
			// probably not node.js, or file does not exist
		}
	}

	return new SimpleFileAccessor(uri);
};

class FileHandleContainer {
	private borrowQueue: ((h: fs.promises.FileHandle | Error) => Promise<void>)[] = [];
	private handle?: fs.promises.FileHandle;
	private disposeTimeout?: NodeJS.Timeout;
	private disposed = false;

	constructor(
		private readonly path: string,
		private readonly _fs: typeof fs,
	) {}

	/** Borrows the file handle to run the function. */
	public borrow<R>(fn: (handle: fs.promises.FileHandle) => R): Promise<R> {
		if (this.disposed) {
			return Promise.reject(new Error("FileHandle was disposed"));
		}

		return new Promise<R>((resolve, reject) => {
			this.borrowQueue.push(async handle => {
				if (handle instanceof Error) {
					return reject(handle);
				}

				try {
					resolve(await fn(handle));
				} catch (e) {
					reject(e);
				}
			});

			if (this.borrowQueue.length === 1) {
				this.process();
			}
		});
	}

	public dispose() {
		this.disposed = true;
		this.handle = undefined;
		if (this.disposeTimeout) {
			clearTimeout(this.disposeTimeout);
		}
		this.rejectAll(new Error("FileHandle was disposed"));
	}

	private rejectAll(error: Error) {
		while (this.borrowQueue.length) {
			this.borrowQueue.pop()!(error);
		}
	}

	private async process() {
		if (this.disposeTimeout) {
			clearTimeout(this.disposeTimeout);
		}

		if (!this.handle) {
			try {
				this.handle = await this._fs.promises.open(this.path, this._fs.constants.O_RDWR | this._fs.constants.O_CREAT);
			} catch (e) {
				return this.rejectAll(e as Error);
			}
		}

		while (this.borrowQueue.length) {
			const fn = this.borrowQueue.pop()!;
			await fn(this.handle);
		}

		// When no one is using the handle, close it after some time. Otherwise the
		// filesystem will lock the file which would be frustating to users.
		this.disposeTimeout = setTimeout(() => {
			this.handle?.close();
			this.handle = undefined;
		}, 1000);
	}

}

/** Native accessor using Node's filesystem. This can be used. */
class NativeFileAccessor implements FileAccessor {
	public readonly uri: string;
	public readonly supportsIncremetalAccess = true;
	private readonly handle: FileHandleContainer;

	constructor(uri: vscode.Uri, private readonly fs: typeof import("fs")) {
		this.uri = uri.toString();
		this.handle = new FileHandleContainer(uri.fsPath, fs);
	}

	async getSize(): Promise<number | undefined> {
		return this.handle.borrow(async fd => (await fd.stat()).size);
	}

	async read(offset: number, target: Uint8Array): Promise<number> {
		return this.handle.borrow(async fd => {
			const { bytesRead } = await fd.read(target, 0, target.byteLength, offset);
			return bytesRead;
		});
	}

	writeBulk(ops: readonly FileWriteOp[]): Promise<void> {
		return this.handle.borrow<void>(async fd => {
			for (const { data, offset } of ops) {
				fd.write(data, 0, data.byteLength, offset);
			}
		});
	}

	async writeStream(stream: AsyncIterable<Uint8Array>, cancellation?: vscode.CancellationToken): Promise<void> {
		return this.handle.borrow(async fd => {
			if (cancellation?.isCancellationRequested) {
				return;
			}

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
		this.handle.dispose();
	}
}

class SimpleFileAccessor implements FileAccessor {
	protected contents?: Thenable<Uint8Array> | Uint8Array;
	public readonly isReadonly: boolean;
	public readonly uri: string;

	constructor(uri: vscode.Uri) {
		this.uri = uri.toString();
		this.isReadonly = vscode.workspace.fs.isWritableFileSystem(this.uri) === false;
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

/**
 * File accessor for VS Code debug memory. This is special-cased since we don't
 * yet have low level filesystem operations in the extension host API.
 *
 * !!! DO NOT COPY THIS CODE. This way of accessing debug memory is subject to
 * change in the future. Your extension will break if you copy this code. !!!
 */
class DebugFileAccessor implements FileAccessor {
	public readonly supportsIncremetalAccess = true;
	public readonly isReadonly = true;
	public readonly uri: string;

	constructor(uri: vscode.Uri) {
		this.uri = uri.toString();
	}

	async getSize(): Promise<number | undefined> {
		return undefined;
	}

	async read(offset: number, data: Uint8Array): Promise<number> {
		const contents = await vscode.workspace.fs.readFile(this.referenceRange(offset, offset + data.length));

		const cpy = Math.min(data.length, contents.length - offset);
		data.set(contents.subarray(offset, cpy + offset));
		return cpy;
	}

	async writeStream(): Promise<void> {
		throw new Error("Not supported");
	}

	async writeBulk(ops: readonly FileWriteOp[]): Promise<void> {
		await Promise.all(ops.map(op => vscode.workspace.fs.writeFile(
			this.referenceRange(op.offset, op.offset + op.data.length),
			op.data
		)));
	}

	private referenceRange(from: number, to: number) {
		return vscode.Uri.parse(this.uri).with({ query: `?range=${from}:${to}` });
	}

	public invalidate(): void {
		// no-op
	}

	dispose() {
		// no-op
	}
}
