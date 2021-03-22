// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import { DataInspectorView } from "./dataInspectorView";
import { HexEditorProvider } from "./hexEditorProvider";
import { openOffsetInput } from "./util";

// Telemetry information
const extensionID = "ms-vscode.hexeditor";

let telemetryReporter: TelemetryReporter;

function readConfigFromPackageJson(extensionID: string): { version: string; aiKey: string } {
	const packageJSON = vscode.extensions.getExtension(extensionID)!.packageJSON;
	return {
		version: packageJSON.version,
		aiKey: packageJSON.aiKey
	};
}

export function activate(context: vscode.ExtensionContext): void {
	// Register the data inspector as a separate view on the side
	const dataInspectorProvider = new DataInspectorView(context.extensionUri);
	const configValues = readConfigFromPackageJson(extensionID);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(DataInspectorView.viewType, dataInspectorProvider));
	telemetryReporter = new TelemetryReporter(extensionID, configValues.version, configValues.aiKey);
	const openWithCommand = vscode.commands.registerTextEditorCommand("hexEditor.openFile", (textEditor: vscode.TextEditor) => {
		vscode.commands.executeCommand("vscode.openWith", textEditor.document.uri, "hexEditor.hexedit");
	});
	const goToOffsetCommand = vscode.commands.registerCommand("hexEditor.goToOffset", async () => {
		const offset = await openOffsetInput();
		// Notify the current webview that the user wants to go to a specific offset
		if (offset && HexEditorProvider.currentWebview) {
			HexEditorProvider.currentWebview.postMessage({ type: "goToOffset", body: { offset } });
		}
	});
	context.subscriptions.push(goToOffsetCommand);
	context.subscriptions.push(openWithCommand);
	context.subscriptions.push(telemetryReporter);
	context.subscriptions.push(HexEditorProvider.register(context, telemetryReporter, dataInspectorProvider));
}

export function deactivate(): void {
	telemetryReporter.dispose();
}
