import { strict as assert } from "assert";
import { encodeToIntelHex, tryDecodeHexEncodedText } from "../hexFormat";

describe("hexFormat", () => {
	it("decodes plain hex bytes", () => {
		const source = new TextEncoder().encode("48 65 6c 6c 6f");
		const decoded = tryDecodeHexEncodedText(source);
		assert.deepStrictEqual(decoded && Array.from(decoded.data), [0x48, 0x65, 0x6c, 0x6c, 0x6f]);
		assert.strictEqual(decoded?.baseAddress, undefined);
	});

	it("decodes Intel HEX records", () => {
		const source = new TextEncoder().encode(":0300000041424337\n:00000001FF\n");
		const decoded = tryDecodeHexEncodedText(source);
		assert.deepStrictEqual(decoded && Array.from(decoded.data), [0x41, 0x42, 0x43]);
		assert.strictEqual(decoded?.baseAddress, 0);
	});

	it("decodes Intel HEX records with non-zero base address", () => {
		const source = new TextEncoder().encode(":020000040100F9\n:0310000041424337\n:00000001FF\n");
		const decoded = tryDecodeHexEncodedText(source);
		assert.deepStrictEqual(decoded && Array.from(decoded.data), [0x41, 0x42, 0x43]);
		assert.strictEqual(decoded?.baseAddress, 0x100000);
	});

	it("ignores non-hex text", () => {
		const source = new TextEncoder().encode("hello world");
		const decoded = tryDecodeHexEncodedText(source);
		assert.strictEqual(decoded, undefined);
	});

	it("encodes and decodes with non-zero base address (Record Type 04)", () => {
		// Test data
		const testData = Uint8Array.from([0x41, 0x42, 0x43]);
		const baseAddress = 0x100000;

		// Encode with base address
		const encoded = encodeToIntelHex(testData, baseAddress);

		// Verify that Record Type 04 is present
		assert(encoded.includes(":020000040100F9"), "Record Type 04 should be present");

		// Decode the result
		const decoded = tryDecodeHexEncodedText(new TextEncoder().encode(encoded));

		// Verify round-trip
		assert.deepStrictEqual(decoded?.data, testData, "Data should match after round-trip");
		assert.strictEqual(decoded?.baseAddress, baseAddress, "Base address should be preserved");
	});

	it("encodes with zero base address (no upper address record needed)", () => {
		const testData = Uint8Array.from([0x41, 0x42, 0x43]);
		const baseAddress = 0;

		// Encode with base address 0
		const encoded = encodeToIntelHex(testData, baseAddress);

		// Decode the result
		const decoded = tryDecodeHexEncodedText(new TextEncoder().encode(encoded));

		// Verify
		assert.deepStrictEqual(decoded?.data, testData);
		assert.strictEqual(decoded?.baseAddress, 0);
	});
});
