import { expect } from "chai";
import { LiteralSearch, Wildcard } from "../literalSearch";

describe("literal search", () => {
	const haystack = new TextEncoder().encode(
		"Excepteur aliquip sit commodo eiusmod nulla ullamco amet reprehenderit incididunt labore ipsum pariatur non. Laborum labore deserunt incididunt mollit do ex ullamco labore quis occaecat amet. Elit amet laborum et ullamco est labore ea. Ipsum ex laborum officia sit Lorem sint enim fugiat in eu. Exercitation laborum est enim cupidatat irure reprehenderit ea duis elit aliquip anim. Sunt reprehenderit consequat consectetur velit proident cupidatat amet.",
	);

	const testNeedle = new TextEncoder().encode("laborum");
	const testMatches = [
		{ index: 202, bytes: "laborum" },
		{ index: 245, bytes: "laborum" },
		{ index: 308, bytes: "laborum" },
	];

	let matches: { bytes: string; index: number }[];

	beforeEach(() => {
		matches = [];
	});

	const addMatch = (index: number, bytes: Uint8Array) =>
		matches.push({ bytes: new TextDecoder().decode(bytes), index });

	it("is sane for simple strings", () => {
		const searcher = new LiteralSearch([testNeedle], addMatch);
		searcher.push(haystack);
		expect(matches).to.deep.equal(testMatches);
	});

	it("is sane for wildcards", () => {
		const searcher = new LiteralSearch(
			[new TextEncoder().encode("lab"), Wildcard, new TextEncoder().encode("rum")],
			addMatch,
		);
		searcher.push(haystack);
		expect(matches).to.deep.equal(testMatches);
	});

	it("is sane for leading wildcards", () => {
		const searcher = new LiteralSearch([Wildcard, new TextEncoder().encode("aborum")], addMatch);
		searcher.push(haystack);
		expect(matches).to.deep.equal([{ index: 109, bytes: "Laborum" }, ...testMatches]);
	});

	it("works with random wildcards", () => {
		for (let i = 0; i < testNeedle.length; i++) {
			for (let k = 1; k < testNeedle.length - i; k++) {
				const left = new Uint8Array(testNeedle.subarray(0, i));
				const middle = new Array(k).fill(Wildcard);
				const right = new Uint8Array(testNeedle.subarray(i + k));

				const searcher = new LiteralSearch([left, ...middle, right], addMatch);
				searcher.push(haystack);

				for (const match of testMatches) {
					expect(matches).to.deep.contain(match);
				}
				matches = [];
			}
		}
	});

	it("works with random slicing", () => {
		for (let chunkSize = 1; chunkSize < 100; chunkSize++) {
			const searcher = new LiteralSearch([testNeedle], addMatch);
			for (let i = 0; i < haystack.length; i += chunkSize) {
				searcher.push(haystack.subarray(i, i + chunkSize));
			}
			expect(matches).to.deep.equal(testMatches);
			matches = [];
		}
	});
});
