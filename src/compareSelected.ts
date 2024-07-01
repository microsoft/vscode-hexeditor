import * as vscode from "vscode";

// Initializes our custom editor with diff capabilities
// @see https://github.com/microsoft/vscode/issues/97683
// @see https://github.com/microsoft/vscode/issues/138525
export const openCompareSelected = async (originalFile: vscode.Uri, modifiedFile: vscode.Uri) => {
	const diffOriginalUri = originalFile.with({
		scheme: "hexdiff",
	});

	const diffModifiedUri = modifiedFile.with({
		scheme: "hexdiff",
	});

	await vscode.commands.executeCommand("vscode.diff", diffOriginalUri, diffModifiedUri);
};
