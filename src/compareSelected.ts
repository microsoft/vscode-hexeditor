import * as vscode from "vscode";
import { HexDiffModel } from "../shared/hexDiffModel";
import { addQueries } from "../shared/util/uri";
import { HexEditorRegistry } from "./hexEditorRegistry";

// Initializes our custom editor with diff capabilities
// @see https://github.com/microsoft/vscode/issues/97683
// @see https://github.com/microsoft/vscode/issues/138525
export const showCompareSelected = async (
	originalFile: vscode.Uri,
	modifiedFile: vscode.Uri,
	registry: HexEditorRegistry,
) => {
	const diffOriginalUri = originalFile.with({
		scheme: "hexdiff",
		query: addQueries(originalFile.query, "diffId=1"),
	});

	const diffModifiedUri = modifiedFile.with({
		scheme: "hexdiff",
		query: addQueries(modifiedFile.query, "diffId=1"),
	});

	const diffModelBuilder = new HexDiffModel.Builder(diffOriginalUri, diffModifiedUri);
	const { dispose } = registry.addDiffBuilder(diffModelBuilder);
	diffModelBuilder.onBuild = dispose;
	await vscode.commands.executeCommand("vscode.diff", diffOriginalUri, diffModifiedUri, "");
};
