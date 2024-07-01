/* eslint-disable @typescript-eslint/no-unused-vars */

import * as vscode from "vscode";

// Workaround to open our files in diff mode.
export class HexDiffFSProvider implements vscode.FileSystemProvider {
	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		throw new Error("Method not implemented.");
	}
	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		throw new Error("Method not implemented.");
	}
	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		throw new Error("Method not implemented.");
	}
	writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error("Method not implemented.");
	}
	delete(uri: vscode.Uri, options: { readonly recursive: boolean; }): void | Thenable<void> {
		throw new Error("Method not implemented.");
	}
	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error("Method not implemented.");
	}
	copy?(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error("Method not implemented.");
	}
	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;
	public watch(
		uri: vscode.Uri,
		options: { readonly recursive: boolean; readonly excludes: readonly string[] },
	): vscode.Disposable {
		return new vscode.Disposable(() => {});
	}
	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return vscode.workspace.fs.stat(uri);
	}
}
