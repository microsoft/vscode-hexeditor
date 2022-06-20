// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter from "@vscode/extension-telemetry";
import { DataInspectorView } from "./dataInspectorView";
import { showGoToOffset } from "./goToOffset";
import { HexEditorProvider } from "./hexEditorProvider";

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
	const openWithCommand = vscode.commands.registerCommand("hexEditor.openFile", () => {
		const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as { [key: string]: any, uri: vscode.Uri | undefined };
		if (activeTabInput.uri) {
			vscode.commands.executeCommand("vscode.openWith", activeTabInput.uri, "hexEditor.hexedit");
		}
	});
	const goToOffsetCommand = vscode.commands.registerCommand("hexEditor.goToOffset", () => {
		if (HexEditorProvider.currentWebview) {
			showGoToOffset(HexEditorProvider.currentWebview);
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
