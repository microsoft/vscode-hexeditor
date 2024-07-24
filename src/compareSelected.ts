import * as vscode from "vscode";
import { DiffExtensionHostMessageHandler } from "../shared/diffWorkerProtocol";
import { HexDiffModel } from "../shared/hexDiffModel";
import { HexEditorRegistry } from "./hexEditorRegistry";

// Initializes our custom editor with diff capabilities
// @see https://github.com/microsoft/vscode/issues/97683
// @see https://github.com/microsoft/vscode/issues/138525
export const openCompareSelected = async (
	originalFile: vscode.Uri,
	modifiedFile: vscode.Uri,
	registry: HexEditorRegistry,
	diffExtensionHostMessageHandler: DiffExtensionHostMessageHandler,
) => {
	const diffOriginalUri = originalFile.with({
		scheme: "hexdiff",
	});

	const diffModifiedUri = modifiedFile.with({
		scheme: "hexdiff",
	});

	const diffModelBuilder = new HexDiffModel.Builder(
		diffOriginalUri,
		diffModifiedUri,
		diffExtensionHostMessageHandler,
	);
	registry.addDiff(diffModelBuilder);
	vscode.commands.executeCommand("vscode.diff", diffOriginalUri, diffModifiedUri);
};
