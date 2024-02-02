/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import { expect } from "chai";
import { getRangeSelectionsFromStack, Range } from "../../shared/util/range";

describe("Range", () => {
	describe("getRangeSelectionsFromStack", () => {
		it("works for a single", () => {
			expect(getRangeSelectionsFromStack([new Range(10, 20)])).to.deep.equal([new Range(10, 20)]);
		});

		it("works for non-overlapping", () => {
			expect(getRangeSelectionsFromStack([new Range(10, 20), new Range(30, 40)])).to.deep.equal([
				new Range(10, 20),
				new Range(30, 40),
			]);
		});

		it("excludes overlapping", () => {
			expect(
				getRangeSelectionsFromStack([new Range(10, 20), new Range(30, 40), new Range(15, 35)]),
			).to.deep.equal([new Range(10, 15), new Range(20, 30), new Range(35, 40)]);
		});

		it("excludes identity", () => {
			expect(getRangeSelectionsFromStack([new Range(10, 20), new Range(10, 20)])).to.deep.equal([]);
		});

		it("includes identity", () => {
			expect(
				getRangeSelectionsFromStack([new Range(10, 20), new Range(10, 20), new Range(10, 20)]),
			).to.deep.equal([new Range(10, 20)]);
		});

		it("pyramid#1", () => {
			expect(
				getRangeSelectionsFromStack([
					new Range(0, 100),
					new Range(10, 90),
					new Range(20, 80),
					new Range(30, 70),
					new Range(40, 60),
				]),
			).to.deep.equal([
				new Range(0, 10),
				new Range(20, 30),
				new Range(40, 60),
				new Range(70, 80),
				new Range(90, 100),
			]);
		});

		it("pyramid#2", () => {
			expect(
				getRangeSelectionsFromStack([
					new Range(0, 50),
					new Range(10, 60),
					new Range(20, 70),
					new Range(30, 80),
				]),
			).to.deep.equal([new Range(0, 10), new Range(20, 30), new Range(50, 60), new Range(70, 80)]);
		});
	});
});
