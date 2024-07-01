import * as vscode from "vscode";
import { HexDocument } from "../src/hexDocument";
import { HexDocumentModel } from "./hexDocumentModel";

export class HexDiffModel {
	constructor(
		private readonly originalModel: HexDocumentModel,
		private readonly modifiedModel: HexDocumentModel,
	) {}

	public async computeDecorators(doc: HexDocument) {}
}
