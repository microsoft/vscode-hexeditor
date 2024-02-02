/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { SearchResult } from "../../shared/protocol";
import { ISearchRequest, LiteralSearchRequest, RegexSearchRequest } from "../searchRequest";
import { expect } from "chai";
import { HexDocument } from "../hexDocument";
import { getTestFileAccessor } from "./util";
import { HexDocumentModel } from "../../shared/hexDocumentModel";

describe("searchRequest", async () => {
	const testContent = `Esse in aliqua minim magna dolor tempor eiusmod exercitation ullamco veniam nisi ipsum cillum commodo. Velit ad aliquip dolor sint anim consequat. Excepteur culpa non adipisicing elit tempor laborum tempor qui. Do esse dolore incididunt consequat non excepteur fugiat fugiat veniam deserunt ut pariatur eiusmod. Deserunt irure qui cupidatat laboris.

Irure nulla nulla consequat reprehenderit nisi nulla consequat dolor. Ad consectetur cillum consectetur ea. Reprehenderit esse in in anim mollit laboris eiusmod. Pariatur enim ipsum dolor eiusmod laboris mollit aliqua ullamco laborum fugiat non et. Officia adipisicing duis id sit aliqua et et occaecat. Commodo Lorem laborum aliquip officia ex quis elit elit do qui consectetur dolore.

Lorem ad ullamco ad deserunt voluptate ullamco et in commodo et exercitation duis nisi. Reprehenderit deserunt deserunt eiusmod velit mollit cillum pariatur Lorem exercitation laboris non. Ad eiusmod mollit reprehenderit amet ex elit deserunt cupidatat ullamco ullamco consectetur elit. Laboris duis cupidatat ipsum id anim occaecat pariatur.`;

	const expectMatches = async (req: ISearchRequest, expected: SearchResult[]) => {
		let last: SearchResult[] | undefined;
		for await (const result of req.search()) {
			last = result.results.map(r => ({ from: r.from, to: r.to, previous: r.previous }));
		}

		if (!last) {
			throw new Error("no result");
		}

		const process = (results: SearchResult[]) =>
			results
				.sort((a, b) => a.from - b.from)
				.map(r => ({ ...r, previous: new TextDecoder().decode(r.previous) }));

		expect(process(last)).to.deep.equal(process(expected));
	};

	const testNeedle = "laboris";
	const testNeedleBytes = new TextEncoder().encode(testNeedle);
	const expectedForTestNeedle: SearchResult[] = [
		{ from: 341, previous: testNeedleBytes, to: 348 },
		{ from: 496, previous: testNeedleBytes, to: 503 },
		{ from: 547, previous: testNeedleBytes, to: 554 },
		{ from: 915, previous: testNeedleBytes, to: 922 },
	];

	const makeDocument = async (content = testContent) =>
		new HexDocument(
			new HexDocumentModel({
				accessor: await getTestFileAccessor(new TextEncoder().encode(content)),
				supportsLengthChanges: false,
				isFiniteSize: true,
			}),
			false,
			0,
		);

	it("searches for literal", async () => {
		const doc = await makeDocument();
		await expectMatches(
			new LiteralSearchRequest(doc, { literal: [testNeedleBytes] }, true, undefined),
			expectedForTestNeedle,
		);
	});

	it("searches for literal case insensitive", async () => {
		const doc = await makeDocument();
		await expectMatches(
			new LiteralSearchRequest(doc, { literal: [testNeedleBytes] }, false, undefined),
			[
				...expectedForTestNeedle,
				{ from: 1026, previous: new TextEncoder().encode("Laboris"), to: 1033 },
			],
		);
	});

	it("searches for regex", async () => {
		const doc = await makeDocument();
		await expectMatches(
			new RegexSearchRequest(doc, { re: testNeedle }, true, undefined),
			expectedForTestNeedle,
		);
	});

	it("searches for regex case insensitive", async () => {
		const doc = await makeDocument();
		await expectMatches(new RegexSearchRequest(doc, { re: testNeedle }, false, undefined), [
			...expectedForTestNeedle,
			{ from: 1026, previous: new TextEncoder().encode("Laboris"), to: 1033 },
		]);
	});
});
