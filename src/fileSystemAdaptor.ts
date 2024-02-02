// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { ConstantBackoff, handleWhen, retry } from "cockatiel";
import type fs from "fs";
import type os from "os";
import * as vscode from "vscode";
import { FileAccessor, FileWriteOp } from "../shared/fileAccessor";

declare function require(_name: "fs"): typeof fs;
declare function require(_name: "os"): typeof os;

export const accessFile = async (
	uri: vscode.Uri,
	untitledDocumentData?: Uint8Array,
): Promise<FileAccessor> => {
	if (uri.scheme === "untitled") {
		return new UntitledFileAccessor(uri, untitledDocumentData ?? new Uint8Array());
	}

	if (uri.scheme === "vscode-debug-memory") {
		const { permissions = 0 } = await vscode.workspace.fs.stat(uri);
		return new DebugFileAccessor(uri, !!(permissions & vscode.FilePermission.Readonly));
	}

	// try to use native file access for local files to allow large files to be handled efficiently
	// todo@connor4312/lramos: push forward extension host API for this.
	if (uri.scheme === "file") {
		try {
			// eslint-disable @typescript-eslint/no-var-requires
			const fs = require("fs");
			const os = require("os");
			// eslint-enable @typescript-eslint/no-var-requires

			const fileStats = await fs.promises.stat(uri.fsPath);
			const { uid, gid } = os.userInfo();

			const isReadonly: boolean =
				uid === -1 || uid === fileStats.uid
					? !(fileStats.mode & 0o200) // owner
					: gid === fileStats.gid
						? !(fileStats.mode & 0o020) // group
						: !(fileStats.mode & 0o002); // other

			if (fileStats.isFile()) {
				return new NativeFileAccessor(uri, isReadonly, fs);
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
		public readonly path: string,
		public readonly flags: number,
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

	/* Closes the handle, but allows it to be reopened if another borrow happens */
	public async close() {
		await this.handle?.close();
		this.handle = undefined;
		if (this.disposeTimeout) {
			clearTimeout(this.disposeTimeout);
		}
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

		while (this.borrowQueue.length) {
			if (!this.handle) {
				try {
					this.handle = await this._fs.promises.open(
						this.path,
						this.flags | this._fs.constants.O_CREAT,
					);
				} catch (e) {
					return this.rejectAll(e as Error);
				}
			}

			await this.borrowQueue[0]?.(this.handle);
			this.borrowQueue.shift();
		}

		// When no one is using the handle, close it after some time. Otherwise the
		// filesystem will lock the file which would be frustating to users.
		if (this.handle) {
			this.disposeTimeout = setTimeout(() => {
				this.handle?.close();
				this.handle = undefined;
			}, 1000);
		}
	}
}

const retryOnENOENT = retry(
	handleWhen(e => (e as any).code === "ENOENT"),
	{
		maxAttempts: 50,
		backoff: new ConstantBackoff(50),
	},
);

const filePageSize = 128 * 1024;

/** Native accessor using Node's filesystem. This can be used. */
class NativeFileAccessor implements FileAccessor {
	public readonly uri: string;
	public readonly supportsIncremetalAccess = true;
	private readonly handle: FileHandleContainer;
	public readonly pageSize = filePageSize;
	public readonly isReadonly?: boolean | undefined;

	constructor(
		uri: vscode.Uri,
		isReadonly: boolean,
		private readonly fs: typeof import("fs"),
	) {
		this.uri = uri.toString();
		this.isReadonly = isReadonly;
		this.handle = new FileHandleContainer(
			uri.fsPath,
			isReadonly ? fs.constants.O_RDONLY : fs.constants.O_RDWR,
			fs,
		);
	}

	watch(onDidChange: () => void, onDidDelete: () => void): vscode.Disposable {
		return watchWorkspaceFile(this.uri, onDidChange, onDidDelete);
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

	async writeStream(
		stream: AsyncIterable<Uint8Array>,
		cancellation?: vscode.CancellationToken,
	): Promise<void> {
		// We write to a tmp file for two reasons:
		// - writes can mess up any reads that we do, so this simplifies lots of things
		// - sometimes the written file will be shorter than the original
		// - prevents any torn state if we crash/exit while writing
		// Renames are very fast and atomic on the same drive, so this should have
		// minimal impact on performance.

		const tmpName = `${this.handle.path}.tmp`;
		const tmp = await this.fs.promises.open(
			tmpName,
			this.fs.constants.O_WRONLY | this.fs.constants.O_CREAT | this.fs.constants.O_TRUNC,
		);
		try {
			let offset = 0;
			for await (const chunk of stream) {
				if (cancellation?.isCancellationRequested) {
					return;
				}

				await tmp.write(chunk, 0, chunk.byteLength, offset);
				offset += chunk.byteLength;
			}
		} finally {
			await tmp.close();
		}

		await this.handle.borrow(async () => {
			await this.handle.close();
			// Retry the rename a few times since the file might take a moment to show up on disk after operations flush.
			await retryOnENOENT.execute(() => this.fs.promises.rename(tmpName, this.handle.path));
		});

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
	private readonly fsPath: string;
	public readonly isReadonly: boolean;
	public readonly uri: string;
	public readonly pageSize = filePageSize;

	constructor(uri: vscode.Uri) {
		this.uri = uri.toString();
		this.fsPath = uri.fsPath;
		this.isReadonly = vscode.workspace.fs.isWritableFileSystem(this.uri) === false;
	}

	watch(onDidChange: () => void, onDidDelete: () => void): vscode.Disposable {
		return watchWorkspaceFile(this.uri, onDidChange, onDidDelete);
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

	async writeStream(
		stream: AsyncIterable<Uint8Array>,
		cancellation?: vscode.CancellationToken,
	): Promise<void> {
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
	public readonly uri: string;

	/**
	 * Page size is smaller than the native filesystem, since large pages are
	 * problematic for embedded debuggers.
	 * @see https://github.com/microsoft/debug-adapter-protocol/issues/322
	 */
	public readonly pageSize = 4 * 1024;

	constructor(
		uri: vscode.Uri,
		public readonly isReadonly: boolean,
	) {
		this.uri = uri.toString();
	}

	watch(onDidChange: () => void, onDidDelete: () => void): vscode.Disposable {
		return watchWorkspaceFile(this.uri, onDidChange, onDidDelete);
	}

	async getSize(): Promise<number | undefined> {
		return undefined;
	}

	async read(offset: number, data: Uint8Array): Promise<number> {
		const contents = await vscode.workspace.fs.readFile(
			this.referenceRange(offset, offset + data.length),
		);
		const cpy = Math.min(data.length, contents.length);
		data.set(contents.subarray(0, cpy));
		return cpy;
	}

	async writeStream(): Promise<void> {
		throw new Error("Not supported");
	}

	async writeBulk(ops: readonly FileWriteOp[]): Promise<void> {
		await Promise.all(
			ops.map(op =>
				vscode.workspace.fs.writeFile(
					this.referenceRange(op.offset, op.offset + op.data.length),
					op.data,
				),
			),
		);
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

const watchWorkspaceFile = (
	uri: string,
	onDidChange: () => void,
	onDidDelete: () => void,
): vscode.Disposable => {
	const base = uri.split("/");
	const fileName = base.pop()!;
	const pattern = new vscode.RelativePattern(vscode.Uri.parse(base.join("/")), fileName);

	const watcher = vscode.workspace.createFileSystemWatcher(pattern);
	const l1 = watcher.onDidChange(onDidChange);
	const l2 = watcher.onDidDelete(onDidDelete);
	return new vscode.Disposable(() => {
		l1.dispose();
		l2.dispose();
		watcher.dispose();
	});
};
