import * as vscode from 'vscode';
import { HexEditorProvider } from './hexEditorProvider';

export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Hexeditor is active!');

	context.subscriptions.push(HexEditorProvider.register(context));
}

// this method is called when your extension is deactivated
export function deactivate() {}
