// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as vscode from "vscode";
import { FileAccessor, FileWriteOp } from "../shared/fileAccessor";

export const accessFile = (uri: vscode.Uri, untitledDocumentData?: Uint8Array): FileAccessor => {
	if (uri.scheme === "untitled") {
		return new UntitledFileAccessor(uri, untitledDocumentData ?? new Uint8Array());
	} else {
		return new SimpleFileAccessor(uri);
	}
};

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


	async copy(to: string) {
		await vscode.workspace.fs.copy(vscode.Uri.parse(this.uri), vscode.Uri.parse(to), { overwrite: true });
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
