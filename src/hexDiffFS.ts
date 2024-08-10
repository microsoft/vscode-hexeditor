/* eslint-disable @typescript-eslint/no-unused-vars */

import * as vscode from "vscode";

/** changes our scheme to file so we can use workspace.fs */
function toFileUri(uri: vscode.Uri) {
	return uri.with({ scheme: "file" });
}
// Workaround to open our files in diff mode. Used by both web and node
// to create a diff model, but the methods are only used in web whereas
// in node we use node's fs.
export class HexDiffFSProvider implements vscode.FileSystemProvider {
	readDirectory(
		uri: vscode.Uri,
	): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		throw new Error("Method not implemented.");
	}
	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		throw new Error("Method not implemented.");
	}
	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		return vscode.workspace.fs.readFile(toFileUri(uri));
	}
	writeFile(
		uri: vscode.Uri,
		content: Uint8Array,
		options: { readonly create: boolean; readonly overwrite: boolean },
	): void | Thenable<void> {
		return vscode.workspace.fs.writeFile(toFileUri(uri), content);
	}

	delete(uri: vscode.Uri, options: { readonly recursive: boolean }): void | Thenable<void> {
		return vscode.workspace.fs.delete(toFileUri(uri), options);
	}
	rename(
		oldUri: vscode.Uri,
		newUri: vscode.Uri,
		options: { readonly overwrite: boolean },
	): void | Thenable<void> {
		throw new Error("Method not implemented");
	}
	copy?(
		source: vscode.Uri,
		destination: vscode.Uri,
		options: { readonly overwrite: boolean },
	): void | Thenable<void> {
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
		return vscode.workspace.fs.stat(toFileUri(uri));
	}
}
