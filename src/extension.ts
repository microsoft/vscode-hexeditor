// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import { DataInspectorView } from "./data_inspector/dataInspectorView";
const { name, version, aiKey } = require("./../../package.json") as {name: string; version: string; aiKey: string};
import { HexEditorProvider } from "./editor/hexEditorProvider";
import { SearchView } from "./search/searchView";

// Telemetry information
const extensionID = `vscode-${name}`;

let telemetryReporter: TelemetryReporter;

export function activate(context: vscode.ExtensionContext): void {
	// Register the data inspector as a separate view on the side
	const dataInspectorProvider = new DataInspectorView(context.extensionUri);
	const searchViewProvider = new SearchView(context.extensionUri);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(DataInspectorView.viewType, dataInspectorProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(SearchView.viewType, searchViewProvider));
	telemetryReporter = new TelemetryReporter(extensionID, version, aiKey);
	const openWithCommand = vscode.commands.registerTextEditorCommand("hexEditor.openFile", (textEditor: vscode.TextEditor) => {
		vscode.commands.executeCommand("vscode.openWith", textEditor.document.uri, "hexEditor.hexedit");
	});
	context.subscriptions.push(openWithCommand);
	context.subscriptions.push(telemetryReporter);
	context.subscriptions.push(HexEditorProvider.register(context, telemetryReporter, dataInspectorProvider));
}

export function deactivate(): void {
	telemetryReporter.dispose();
}
