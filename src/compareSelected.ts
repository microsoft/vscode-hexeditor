import * as vscode from "vscode";
import { formQuery, parseQuery } from "../shared/util/uri";

const uuidGenerator = () => {
	let uuid = 0;
	return () => (uuid++).toString();
};
const uuid = uuidGenerator();

// Initializes our custom editor with diff capabilities
// @see https://github.com/microsoft/vscode/issues/97683
// @see https://github.com/microsoft/vscode/issues/138525
export const openCompareSelected = (originalFile: vscode.Uri, modifiedFile: vscode.Uri) => {
	const token = uuid();
	const diffOriginalUri = originalFile.with({
		scheme: "hexdiff",
		query: formQuery({
			...parseQuery(originalFile.query),
			side: "original",
			token: token,
		}),
	});

	const diffModifiedUri = modifiedFile.with({
		scheme: "hexdiff",
		query: formQuery({
			...parseQuery(originalFile.query),
			side: "modified",
			token: token,
		}),
	});

	vscode.commands.executeCommand("vscode.diff", diffOriginalUri, diffModifiedUri);
};
