/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { expect } from "chai";
import { HexDocumentEdit, HexDocumentEditOp } from "../../shared/hexDocumentModel";
import { Backup } from "../backup";
import { getTempFile } from "./util";

describe("Backup", () => {
	const edits: HexDocumentEdit[] = [
		{ op: HexDocumentEditOp.Delete, offset: 3, opId: 0, previous: new Uint8Array([3, 4, 5]) },
		{ op: HexDocumentEditOp.Replace, offset: 1, opId: 0, value: new Uint8Array([10, 11, 12]), previous: new Uint8Array([1, 2, 6]) },
	];

	it("round trips", async () => {
		const backup = new Backup(await getTempFile());
		await backup.write(edits);
		expect(await backup.read()).to.deep.equal(edits);
	});
});
