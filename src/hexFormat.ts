// Copyright (c) shreyes shalgar.
// Licensed under the MIT license.

const enum IntelHexRecordType {
	Data = 0x00,
	EndOfFile = 0x01,
	ExtendedSegmentAddress = 0x02,
	ExtendedLinearAddress = 0x04,
}

const hexDigitToValue = (ch: string): number | undefined => {
	if (ch >= "0" && ch <= "9") {
		return ch.charCodeAt(0) - 0x30;
	}

	const lower = ch.toLowerCase();
	if (lower >= "a" && lower <= "f") {
		return lower.charCodeAt(0) - 0x61 + 10;
	}

	return undefined;
};

const parseHexByte = (str: string, offset: number): number | undefined => {
	const hi = hexDigitToValue(str[offset]);
	const lo = hexDigitToValue(str[offset + 1]);
	if (hi === undefined || lo === undefined) {
		return undefined;
	}

	return (hi << 4) | lo;
};

const parseIntelHexLine = (line: string): number[] | undefined => {
	if (!line.startsWith(":")) {
		return undefined;
	}

	const payload = line.slice(1).trim();
	if (payload.length === 0 || payload.length % 2 !== 0) {
		return undefined;
	}

	const bytes: number[] = [];
	for (let i = 0; i < payload.length; i += 2) {
		const value = parseHexByte(payload, i);
		if (value === undefined) {
			return undefined;
		}
		bytes.push(value);
	}

	return bytes;
};

interface IntelHexResult {
	data: Uint8Array;
	baseAddress: number;
}

const tryParseIntelHex = (text: string): IntelHexResult | undefined => {
	const lines = text
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line.length > 0);

	console.log("[HexDecoder] Found", lines.length, "lines");

	if (lines.length === 0) {
		console.log("[HexDecoder] No lines found");
		return undefined;
	}

	// Check if most lines start with : (not necessarily all, in case of comments)
	const hexLines = lines.filter(line => line.startsWith(":"));
	if (hexLines.length === 0) {
		console.log("[HexDecoder] No Intel HEX lines (starting with :) found");
		return undefined;
	}

	console.log("[HexDecoder] Found", hexLines.length, "Intel HEX lines");

	let upperAddress = 0;
	let sawEof = false;
	let minOffset = Number.POSITIVE_INFINITY;
	let maxOffset = 0;
	const segments: Array<{ offset: number; data: Uint8Array }> = [];

	for (let lineIdx = 0; lineIdx < hexLines.length; lineIdx++) {
		const line = hexLines[lineIdx];
		const record = parseIntelHexLine(line);
		if (!record) {
			console.log("[HexDecoder] Failed to parse line", lineIdx, ":", line);
			return undefined;
		}

		if (record.length < 5) {
			console.log("[HexDecoder] Record too short at line", lineIdx);
			return undefined;
		}

		const byteCount = record[0];
		if (record.length !== byteCount + 5) {
			console.log(
				"[HexDecoder] Length mismatch at line",
				lineIdx,
				"expected",
				byteCount + 5,
				"got",
				record.length,
			);
			return undefined;
		}

		let checksum = 0;
		for (const value of record) {
			checksum = (checksum + value) & 0xff;
		}
		if (checksum !== 0) {
			console.log(
				"[HexDecoder] Checksum validation failed at line",
				lineIdx,
				"expected 0, got",
				checksum,
			);
			return undefined;
		}

		const address = (record[1] << 8) | record[2];
		const type = record[3];
		const data = record.slice(4, 4 + byteCount);

		switch (type) {
			case IntelHexRecordType.Data: {
				const offset = upperAddress + address;
				const bytes = Uint8Array.from(data);
				segments.push({ offset, data: bytes });
				minOffset = Math.min(minOffset, offset);
				maxOffset = Math.max(maxOffset, offset + bytes.length);
				break;
			}

			case IntelHexRecordType.EndOfFile:
				sawEof = true;
				console.log("[HexDecoder] Found EOF record at line", lineIdx);
				break;

			case IntelHexRecordType.ExtendedSegmentAddress:
				if (byteCount !== 2) {
					console.log("[HexDecoder] Invalid extended segment address");
					return undefined;
				}
				upperAddress = (((data[0] << 8) | data[1]) << 4) >>> 0;
				console.log("[HexDecoder] Extended segment address:", "0x" + upperAddress.toString(16));
				break;

			case IntelHexRecordType.ExtendedLinearAddress:
				if (byteCount !== 2) {
					console.log("[HexDecoder] Invalid extended linear address");
					return undefined;
				}
				upperAddress = (((data[0] << 8) | data[1]) << 16) >>> 0;
				console.log("[HexDecoder] Extended linear address:", "0x" + upperAddress.toString(16));
				break;

			default:
				console.log("[HexDecoder] Unknown record type:", type);
				break;
		}
	}

	if (segments.length === 0) {
		console.log("[HexDecoder] No data segments found");
		return undefined;
	}

	if (!sawEof) {
		console.log("[HexDecoder] No EOF record found");
		return undefined;
	}

	console.log(
		"[HexDecoder] Parsed successfully:",
		segments.length,
		"segments, range 0x" + minOffset.toString(16),
		"-0x" + maxOffset.toString(16),
	);

	const out = new Uint8Array(maxOffset - minOffset);
	for (const segment of segments) {
		out.set(segment.data, segment.offset - minOffset);
	}

	return { data: out, baseAddress: minOffset };
};

const tryParsePlainHex = (text: string): Uint8Array | undefined => {
	const normalized = text.replace(/0x/gi, "");
	const nibbles: number[] = [];

	for (const ch of normalized) {
		const value = hexDigitToValue(ch);
		if (value !== undefined) {
			nibbles.push(value);
			continue;
		}

		if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === "," || ch === "_") {
			continue;
		}

		return undefined;
	}

	if (nibbles.length === 0 || nibbles.length % 2 !== 0) {
		return undefined;
	}

	const out = new Uint8Array(nibbles.length / 2);
	for (let i = 0; i < nibbles.length; i += 2) {
		out[i >>> 1] = (nibbles[i] << 4) | nibbles[i + 1];
	}

	return out;
};

/**
 * Result of decoding hex-encoded text, optionally with base address info from Intel HEX
 */
export interface HexDecoderResult {
	data: Uint8Array;
	baseAddress?: number;
}

/**
 * Parses a byte buffer containing hex-encoded text into binary bytes.
 * Supports plain hex text and Intel HEX records.
 */
export const tryDecodeHexEncodedText = (contents: Uint8Array): HexDecoderResult | undefined => {
	if (contents.length === 0) {
		console.log("[HexDecoder] Empty content");
		return { data: new Uint8Array() };
	}

	console.log("[HexDecoder] Starting decode, input size:", contents.length);
	const text = new TextDecoder("utf-8", { fatal: false }).decode(contents);
	console.log("[HexDecoder] Decoded as UTF-8, text length:", text.length);

	const intelResult = tryParseIntelHex(text);
	if (intelResult) {
		console.log("[HexDecoder] Intel HEX parse succeeded");
		return { data: intelResult.data, baseAddress: intelResult.baseAddress };
	}

	console.log("[HexDecoder] Intel HEX parse failed, trying plain hex");
	const plainResult = tryParsePlainHex(text);
	if (plainResult) {
		console.log("[HexDecoder] Plain hex parse succeeded");
		return { data: plainResult };
	}

	console.log("[HexDecoder] All parsers failed");
	return undefined;
};

/**
 * Encodes binary data to Intel HEX format string
 */
export const encodeToIntelHex = (data: Uint8Array, baseAddress?: number): string => {
	const lines: string[] = [];
	const bytesPerRecord = 16;
	let currentUpperAddress = 0xffffffff; // Start with invalid value to force extended address record
	const startAddress = baseAddress ?? 0;

	for (let i = 0; i < data.length; i += bytesPerRecord) {
		const offset = startAddress + i;
		const upperAddress = (offset >>> 16) & 0xffff;

		// Add extended linear address record if upper address changed
		if (upperAddress !== currentUpperAddress) {
			currentUpperAddress = upperAddress;
			const extAddrRecord = createRecord(
				0x0000,
				0x04,
				Uint8Array.from([(upperAddress >>> 8) & 0xff, upperAddress & 0xff]),
			);
			lines.push(extAddrRecord);
		}

		const chunk = data.subarray(i, Math.min(i + bytesPerRecord, data.length));
		const lowerAddress = offset & 0xffff;
		const record = createRecord(lowerAddress, 0x00, chunk);
		lines.push(record);
	}

	// Add end-of-file record
	const eofRecord = createRecord(0x0000, 0x01, new Uint8Array());
	lines.push(eofRecord);

	return lines.join("\n");
};

const createRecord = (address: number, type: number, data: Uint8Array): string => {
	const byteCount = data.length;
	const record: number[] = [
		byteCount,
		(address >>> 8) & 0xff,
		address & 0xff,
		type,
		...Array.from(data),
	];

	// Calculate checksum: sum of all bytes, take 2's complement
	let checksum = 0;
	for (const byte of record) {
		checksum = (checksum + byte) & 0xff;
	}
	checksum = ((checksum ^ 0xff) + 1) & 0xff;
	record.push(checksum);

	return ":" + record.map(b => b.toString(16).padStart(2, "0").toUpperCase()).join("");
};
