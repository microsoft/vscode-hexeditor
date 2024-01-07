// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import TelemetryReporter from "@vscode/extension-telemetry";
import * as vscode from "vscode";
import { DataInspectorView } from "./dataInspectorView";
import { showGoToOffset } from "./goToOffset";
import { HexEditorProvider } from "./hexEditorProvider";
import { HexEditorRegistry } from "./hexEditorRegistry";
import { showSelectBetweenOffsets } from "./selectBetweenOffsets";
import StatusSelectionCount from "./statusSelectionCount";

function readConfigFromPackageJson(extension: vscode.Extension<any>): { extId: string; version: string; aiKey: string } {
	const packageJSON = extension.packageJSON;
	return {
		extId: `${packageJSON.publisher}.${packageJSON.name}`,
		version: packageJSON.version,
		aiKey: packageJSON.aiKey
	};
}

function reopenWithHexEditor() {
	const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as { [key: string]: any, uri: vscode.Uri | undefined };
	if (activeTabInput.uri) {
		vscode.commands.executeCommand("vscode.openWith", activeTabInput.uri, "hexEditor.hexedit");
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const registry = new HexEditorRegistry();
	// Register the data inspector as a separate view on the side
	const dataInspectorProvider = new DataInspectorView(context.extensionUri, registry);
	const configValues = readConfigFromPackageJson(context.extension);
	context.subscriptions.push(
		registry,
		dataInspectorProvider,
		vscode.window.registerWebviewViewProvider(DataInspectorView.viewType, dataInspectorProvider)
	);

	const telemetryReporter = new TelemetryReporter(configValues.extId, configValues.version, configValues.aiKey);
	context.subscriptions.push(telemetryReporter);
	const openWithCommand = vscode.commands.registerCommand("hexEditor.openFile", reopenWithHexEditor);
	const goToOffsetCommand = vscode.commands.registerCommand("hexEditor.goToOffset", () => {
		const first = registry.activeMessaging[Symbol.iterator]().next();
		if (first.value) {
			showGoToOffset(first.value);
		}
	});
	const selectBetweenOffsetsCommand = vscode.commands.registerCommand("hexEditor.selectBetweenOffsets", () => {
		const first = registry.activeMessaging[Symbol.iterator]().next();
		if (first.value) {
			showSelectBetweenOffsets(first.value);
		}
	});
	context.subscriptions.push(new StatusSelectionCount(registry));
	context.subscriptions.push(goToOffsetCommand);
	context.subscriptions.push(selectBetweenOffsetsCommand);
	context.subscriptions.push(openWithCommand);
	context.subscriptions.push(telemetryReporter);
	context.subscriptions.push(HexEditorProvider.register(context, telemetryReporter, dataInspectorProvider, registry));

}

export function deactivate(): void { /* no-op */ }
