/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import { expect } from "chai";
import { inspectableTypes } from "../../media/editor/dataInspectorProperties";

const ebcdic = inspectableTypes.find(t => t.label === "EBCDIC")!;

const dvOf = (byte: number) => new DataView(new Uint8Array([byte]).buffer);

describe("EBCDIC decoding", () => {
	it("decodes space (0x40)", () => {
		expect(ebcdic.convert(dvOf(0x40), false)).to.equal(" ");
	});

	it("decodes digits 0-9 (0xF0-0xF9)", () => {
		for (let i = 0; i <= 9; i++) {
			expect(ebcdic.convert(dvOf(0xf0 + i), false)).to.equal(String(i));
		}
	});

	it("decodes uppercase A-I (0xC1-0xC9)", () => {
		for (let i = 0; i < 9; i++) {
			expect(ebcdic.convert(dvOf(0xc1 + i), false)).to.equal(String.fromCharCode("A".charCodeAt(0) + i));
		}
	});

	it("decodes lowercase a-i (0x81-0x89)", () => {
		for (let i = 0; i < 9; i++) {
			expect(ebcdic.convert(dvOf(0x81 + i), false)).to.equal(String.fromCharCode("a".charCodeAt(0) + i));
		}
	});
});
