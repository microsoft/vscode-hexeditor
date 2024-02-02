/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { expect } from "chai";
import {
	EditRangeOp,
	HexDocumentEdit,
	HexDocumentEditOp,
	HexDocumentModel,
	IEditTimeline,
} from "../../shared/hexDocumentModel";
import { deserializeEdits, serializeEdits } from "../../shared/serialization";
import { getTestFileAccessor, pseudoRandom } from "./util";

describe("HexDocumentModel", () => {
	const original: ReadonlyArray<number> = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

	let model: HexDocumentModel;
	beforeEach(async () => {
		model = new HexDocumentModel({
			accessor: await getTestFileAccessor(new Uint8Array(original)),
			supportsLengthChanges: false,
			isFiniteSize: true,
		});
	});

	describe("edit timeline", () => {
		it("keeps offsets in replacements", () => {
			model.makeEdits([
				{
					op: HexDocumentEditOp.Replace,
					offset: 6,
					value: new Uint8Array([16]),
					previous: new Uint8Array([6, 7, 8]),
				},
				{
					op: HexDocumentEditOp.Replace,
					offset: 1,
					value: new Uint8Array([11]),
					previous: new Uint8Array([1, 2, 3]),
				},
			]);

			const timeline: IEditTimeline = (model as any).getEditTimeline();

			expect(timeline).to.deep.equal({
				sizeDelta: -4,
				ranges: [
					{ op: EditRangeOp.Read, editIndex: 1, roffset: 0, offset: 0 },
					{ op: EditRangeOp.Insert, editIndex: 1, offset: 1, value: new Uint8Array([11]) },
					{ op: EditRangeOp.Read, editIndex: 1, roffset: 4, offset: 2 },
					{ op: EditRangeOp.Insert, editIndex: 0, offset: 4, value: new Uint8Array([16]) },
					{ op: EditRangeOp.Read, editIndex: 0, roffset: 9, offset: 5 },
				],
			});
		});
	});

	describe("serialization", () => {
		it("round trips", () => {
			const edits: HexDocumentEdit[] = [
				{ op: HexDocumentEditOp.Insert, offset: 2, value: new Uint8Array([10, 11, 12]) },
				{
					op: HexDocumentEditOp.Replace,
					offset: 2,
					value: new Uint8Array([10, 11, 12]),
					previous: new Uint8Array([1, 2, 3]),
				},
				{ op: HexDocumentEditOp.Delete, offset: 3, previous: new Uint8Array([3, 4, 5]) },
			];

			const s = serializeEdits(edits);
			expect(deserializeEdits(s)).to.deep.equal(edits);
			expect(s.data.length).to.equal(9); // sum of unique values
		});
	});

	describe("edit reading", () => {
		const assertContents = async (value: Uint8Array) => {
			for (let offset = 0; offset < value.length; offset++) {
				let built = new Uint8Array();
				for await (const buf of model.readWithEdits(offset)) {
					built = Buffer.concat([built, buf]);
				}

				expect(built).to.deep.equal(
					Buffer.from(value.subarray(offset)),
					`expected to be equal at offset ${offset}`,
				);
			}

			expect(await model.size()).to.equal(value.length);
		};

		it("reads file verbatim", async () => {
			await assertContents(new Uint8Array(original));
		});

		it("reads with a simple insert", async () => {
			model.makeEdits([
				{ op: HexDocumentEditOp.Insert, offset: 2, value: new Uint8Array([10, 11, 12]) },
			]);
			await assertContents(new Uint8Array([0, 1, 10, 11, 12, 2, 3, 4, 5, 6, 7, 8, 9]));
		});

		it("reads with a simple delete", async () => {
			model.makeEdits([
				{ op: HexDocumentEditOp.Delete, offset: 2, previous: new Uint8Array([2, 3, 4]) },
			]);
			await assertContents(new Uint8Array([0, 1, 5, 6, 7, 8, 9]));
		});

		it("reads with a simple replace", async () => {
			model.makeEdits([
				{
					op: HexDocumentEditOp.Replace,
					offset: 2,
					value: new Uint8Array([10, 11, 12]),
					previous: new Uint8Array([1, 2, 3]),
				},
			]);
			await assertContents(new Uint8Array([0, 1, 10, 11, 12, 5, 6, 7, 8, 9]));
		});

		it("replaces at beginning", async () => {
			model.makeEdits([
				{
					op: HexDocumentEditOp.Replace,
					offset: 0,
					value: new Uint8Array([10, 11, 12]),
					previous: new Uint8Array([0, 1, 2]),
				},
			]);
			await assertContents(new Uint8Array([10, 11, 12, 3, 4, 5, 6, 7, 8, 9]));
		});

		it("makes random replacements", async function () {
			this.timeout(10_000);

			const expected = new Uint8Array(original);
			const rng = pseudoRandom("vs code!");
			let str = `- [${expected.join(", ")}]\n`;

			let vc = 0;
			for (let i = 0; i < 1000; i++) {
				const start = Math.floor(rng() * expected.length);
				const len = Math.floor((expected.length - start) * rng());
				const value = new Uint8Array(len);
				const previous = new Uint8Array(len);
				for (let k = 0; k < len; k++) {
					previous[k] = expected[start + k];
					value[k] = expected[start + k] = vc++ & 0xff;
				}

				str += `- arr.set(${start}, [${value.join(", ")}]) -> [${expected.join(", ")}]\n`;
				model.makeEdits([{ op: HexDocumentEditOp.Replace, offset: start, value, previous }]);

				try {
					await assertContents(expected);
				} catch (e) {
					console.log(str);
					// console.log(JSON.stringify((model as any).getEditTimeline(), (k, v) => v instanceof Uint8Array ? Array.from(v) : v, 2));
					throw e;
				}
			}
		});

		it("works with multiple replacements", async () => {
			model.makeEdits([
				{
					op: HexDocumentEditOp.Replace,
					offset: 6,
					value: new Uint8Array([16]),
					previous: new Uint8Array([6, 7, 8]),
				},
				{
					op: HexDocumentEditOp.Replace,
					offset: 1,
					value: new Uint8Array([11]),
					previous: new Uint8Array([1, 2, 3]),
				},
			]);
			await assertContents(new Uint8Array([0, 11, 4, 5, 16, 9]));
		});

		it("overlaps replace on delete", async () => {
			model.makeEdits([
				{ op: HexDocumentEditOp.Delete, offset: 3, previous: new Uint8Array([3, 4, 5]) },
				{
					op: HexDocumentEditOp.Replace,
					offset: 1,
					value: new Uint8Array([10, 11, 12]),
					previous: new Uint8Array([1, 2, 6]),
				},
			]);
			await assertContents(new Uint8Array([0, 10, 11, 12, 7, 8, 9]));
		});

		it("overlaps replace on insert", async () => {
			model.makeEdits([
				{ op: HexDocumentEditOp.Insert, offset: 2, value: new Uint8Array([10, 11, 12]) },
				{
					op: HexDocumentEditOp.Replace,
					offset: 1,
					value: new Uint8Array([20, 21, 22]),
					previous: new Uint8Array([1, 10, 11]),
				},
			]);
			await assertContents(new Uint8Array([0, 20, 21, 22, 12, 2, 3, 4, 5, 6, 7, 8, 9]));
		});

		it("delete overlaps multiple", async () => {
			model.makeEdits([
				{ op: HexDocumentEditOp.Insert, offset: 2, value: new Uint8Array([10, 11, 12]) },
				{
					op: HexDocumentEditOp.Delete,
					offset: 1,
					previous: new Uint8Array([1, 10, 11, 12, 2, 3]),
				},
			]);
			await assertContents(new Uint8Array([0, 4, 5, 6, 7, 8, 9]));
		});
	});
});
