// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter   from "vscode-extension-telemetry";
const { name, version, aiKey } = require("../package.json") as {name: string; version: string; aiKey: string};
import { HexEditorProvider } from "./hexEditorProvider";

// Telemetry information
const extensionID = `vscode-${name}`;

let telemetryReporter: TelemetryReporter;

export function activate(context: vscode.ExtensionContext): void {
	console.log("Hexeditor is active!");
	telemetryReporter = new TelemetryReporter(extensionID, version, aiKey);
	context.subscriptions.push(telemetryReporter);
	context.subscriptions.push(HexEditorProvider.register(context, telemetryReporter));
}

export function deactivate(): void {
	telemetryReporter.dispose();
}
