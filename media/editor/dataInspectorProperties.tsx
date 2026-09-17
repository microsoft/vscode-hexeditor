/** Reads a GUID/UUID at offset 0 from the buffer. (RFC 4122) */
const getGUID = (arrayBuffer: ArrayBuffer, le: boolean) => {
	const buf = new Uint8Array(arrayBuffer);

	const indices = le
		? [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15]
		: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
	const parts = indices.map(index => buf[index].toString(16).padStart(2, "0").toUpperCase());
	const guid = `{${parts[0]}${parts[1]}${parts[2]}${parts[3]}-${parts[4]}${parts[5]}-${parts[6]}${parts[7]}-${parts[8]}${parts[9]}-${parts[10]}${parts[11]}${parts[12]}${parts[13]}${parts[14]}${parts[15]}}`;

	return guid;
};

/** Reads a ULEB128 at offset 0 from the buffer. */
const getULEB128 = (arrayBuffer: ArrayBuffer) => {
	const buf = new Uint8Array(arrayBuffer);

	let result = 0n;
	let shift = 0n;
	let index = 0;
	while (true) {
		if (shift > 128n || index >= buf.length) {
			return "";
		}
		const byte: bigint = BigInt(buf[index++]);
		result |= (byte & 0x7fn) << shift;
		if ((0x80n & byte) === 0n) {
			return result;
		}
		shift += 7n;
	}
};

/** Reads a SLEB128 at offset 0 from the buffer. */
const getSLEB128 = (arrayBuffer: ArrayBuffer) => {
	const buf = new Uint8Array(arrayBuffer);

	let result = 0n;
	let shift = 0n;
	let index = 0;
	while (true) {
		if (shift > 128n || index >= buf.length) {
			return "";
		}
		const byte: bigint = BigInt(buf[index++]);
		result |= (byte & 0x7fn) << shift;
		shift += 7n;
		if ((0x80n & byte) === 0n) {
			if (shift < 128n && (byte & 0x40n) !== 0n) {
				result |= ~0n << shift;
				return result;
			}
			return result;
		}
	}
};

/** Reads a uint24 at offset 0 from the buffer. */
const getUint24 = (arrayBuffer: ArrayBuffer, le: boolean) => {
	const buf = new Uint8Array(arrayBuffer);
	return le ? buf[0] | (buf[1] << 8) | (buf[2] << 16) : (buf[0] << 16) | (buf[1] << 8) | buf[2];
};

const getFloat16 = (exponentWidth: number, significandPrecision: number) => {
	const exponentMask = (2 ** exponentWidth - 1) << significandPrecision;
	const fractionMask = 2 ** significandPrecision - 1;

	const exponentBias = 2 ** (exponentWidth - 1) - 1;
	const exponentMin = 1 - exponentBias;

	return (arrayBuffer: ArrayBuffer, le: boolean) => {
		const buf = new Uint8Array(arrayBuffer);
		const uint16 = le ? buf[0] | (buf[1] << 8) : (buf[0] << 8) | buf[1];

		const e = (uint16 & exponentMask) >> significandPrecision;
		const f = uint16 & fractionMask;
		const sign = uint16 >> 15 ? -1 : 1;

		if (e === 0) {
			return sign * 2 ** exponentMin * (f / 2 ** significandPrecision);
		} else if (e === 2 ** exponentWidth - 1) {
			return f ? NaN : sign * Infinity;
		}

		return sign * 2 ** (e - exponentBias) * (1 + f / 2 ** significandPrecision);
	};
};

export interface IInspectableType {
	/** Readable label for the type */
	label: string;
	/** Minimum number of bytes needed to accurate disable this type */
	minBytes: number;
	/** Shows the representation of the type from the data view */
	convert(dv: DataView, littleEndian: boolean): string;
}

const inspectTypesBuilder: IInspectableType[] = [
	{ label: "binary", minBytes: 1, convert: dv => dv.getUint8(0).toString(2).padStart(8, "0") },

	{ label: "octal", minBytes: 1, convert: dv => dv.getUint8(0).toString(8).padStart(3, "0") },

	{ label: "uint8", minBytes: 1, convert: dv => dv.getUint8(0).toString() },
	{ label: "int8", minBytes: 1, convert: dv => dv.getInt8(0).toString() },

	{ label: "uint16", minBytes: 2, convert: (dv, le) => dv.getUint16(0, le).toString() },
	{ label: "int16", minBytes: 2, convert: (dv, le) => dv.getInt16(0, le).toString() },

	{ label: "uint24", minBytes: 3, convert: (dv, le) => getUint24(dv.buffer, le).toString() },
	{
		label: "int24",
		minBytes: 3,
		convert: (dv, le) => {
			const uint = getUint24(dv.buffer, le);
			const isNegative = !!(uint & 0x800000);
			return String(isNegative ? -(0xffffff - uint + 1) : uint);
		},
	},

	{ label: "uint32", minBytes: 4, convert: (dv, le) => dv.getUint32(0, le).toString() },
	{ label: "int32", minBytes: 4, convert: (dv, le) => dv.getInt32(0, le).toString() },

	{ label: "uint64", minBytes: 8, convert: (dv, le) => dv.getBigUint64(0, le).toString() },
	{ label: "int64", minBytes: 8, convert: (dv, le) => dv.getBigInt64(0, le).toString() },

	{ label: "ULEB128", minBytes: 1, convert: dv => getULEB128(dv.buffer).toString() },
	{ label: "SLEB128", minBytes: 1, convert: dv => getSLEB128(dv.buffer).toString() },

	{
		label: "float16",
		minBytes: 2,
		convert: (dv, le) => getFloat16(5, 10)(dv.buffer, le).toString(),
	},
	{
		label: "bfloat16",
		minBytes: 2,
		convert: (dv, le) => getFloat16(8, 7)(dv.buffer, le).toString(),
	},

	{ label: "float32", minBytes: 4, convert: (dv, le) => dv.getFloat32(0, le).toString() },
	{ label: "float64", minBytes: 8, convert: (dv, le) => dv.getFloat64(0, le).toString() },

	{ label: "GUID", minBytes: 16, convert: (dv, le) => getGUID(dv.buffer, le) },
];

const addTextDecoder = (encoding: string, minBytes: number, bigEndianAlt?: string) => {
	try {
		new TextDecoder(encoding); // throws if encoding is now supported
	} catch {
		return;
	}

	if (bigEndianAlt) {
		try {
			new TextDecoder(bigEndianAlt); // throws if encoding is now supported
		} catch {
			bigEndianAlt = undefined;
		}
	}

	inspectTypesBuilder.push({
		label: encoding.toUpperCase(),
		minBytes,
		convert: (dv, le) => {
			const utf8 = new TextDecoder(!le && bigEndianAlt ? bigEndianAlt : encoding).decode(dv.buffer);
			for (const char of utf8) return char;
			return utf8;
		},
	});
};

addTextDecoder("ascii", 1);
addTextDecoder("utf-8", 1);
addTextDecoder("utf-16", 2, "utf-16be");
addTextDecoder("gb18030", 2);
addTextDecoder("big5", 2);
addTextDecoder("iso-2022-kr", 2);
addTextDecoder("shift-jis", 2);

/** EBCDIC Code Page 037 (IBM US/Canada) to Unicode lookup table (256 entries). */
const EBCDIC_CP037 =
	"\u0000\u0001\u0002\u0003\u009C\u0009\u0086\u007F\u0097\u008D\u008E\u000B\u000C\u000D\u000E\u000F" +
	"\u0010\u0011\u0012\u0013\u009D\u0085\u0008\u0087\u0018\u0019\u0092\u008F\u001C\u001D\u001E\u001F" +
	"\u0080\u0081\u0082\u0083\u0084\u000A\u0017\u001B\u0088\u0089\u008A\u008B\u008C\u0005\u0006\u0007" +
	"\u0090\u0091\u0016\u0093\u0094\u0095\u0096\u0004\u0098\u0099\u009A\u009B\u0014\u0015\u009E\u001A" +
	"\u0020\u00A0\u00E2\u00E4\u00E0\u00E1\u00E3\u00E5\u00E7\u00F1\u00A2\u002E\u003C\u0028\u002B\u007C" +
	"\u0026\u00E9\u00EA\u00EB\u00E8\u00ED\u00EE\u00EF\u00EC\u00DF\u0021\u0024\u002A\u0029\u003B\u00AC" +
	"\u002D\u002F\u00C2\u00C4\u00C0\u00C1\u00C3\u00C5\u00C7\u00D1\u00A6\u002C\u0025\u005F\u003E\u003F" +
	"\u00F8\u00C9\u00CA\u00CB\u00C8\u00CD\u00CE\u00CF\u00CC\u0060\u003A\u0023\u0040\u0027\u003D\u0022" +
	"\u00D8\u0061\u0062\u0063\u0064\u0065\u0066\u0067\u0068\u0069\u00AB\u00BB\u00F0\u00FD\u00FE\u00B1" +
	"\u00B0\u006A\u006B\u006C\u006D\u006E\u006F\u0070\u0071\u0072\u00AA\u00BA\u00E6\u00B8\u00C6\u00A4" +
	"\u00B5\u007E\u0073\u0074\u0075\u0076\u0077\u0078\u0079\u007A\u00A1\u00BF\u00D0\u00DD\u00DE\u00AE" +
	"\u005E\u00A3\u00A5\u00B7\u00A9\u00A7\u00B6\u00BC\u00BD\u00BE\u005B\u005D\u00AF\u00A8\u00B4\u00D7" +
	"\u007B\u0041\u0042\u0043\u0044\u0045\u0046\u0047\u0048\u0049\u00AD\u00F4\u00F6\u00F2\u00F3\u00F5" +
	"\u007D\u004A\u004B\u004C\u004D\u004E\u004F\u0050\u0051\u0052\u00B9\u00FB\u00FC\u00F9\u00FA\u00FF" +
	"\u005C\u00F7\u0053\u0054\u0055\u0056\u0057\u0058\u0059\u005A\u00B2\u00D4\u00D6\u00D2\u00D3\u00D5" +
	"\u0030\u0031\u0032\u0033\u0034\u0035\u0036\u0037\u0038\u0039\u00B3\u00DB\u00DC\u00D9\u00DA\u009F";

inspectTypesBuilder.push({
	label: "EBCDIC",
	minBytes: 1,
	convert: dv => EBCDIC_CP037[dv.getUint8(0)],
});

export const inspectableTypes: readonly IInspectableType[] = inspectTypesBuilder;
