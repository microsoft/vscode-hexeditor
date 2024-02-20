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
		result |= (byte & 0x7Fn) << shift;
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
		result |= (byte & 0x7Fn) << shift;
		shift += 7n; 
		if ((0x80n & byte) === 0n) {
			if (shift < 128n && (byte & 0x40n) !== 0n) {
				result |= (~0n << shift);
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
];

const addTextDecoder = (encoding: string, minBytes: number) => {
	try {
		new TextDecoder(encoding); // throws if encoding is now supported
	} catch {
		return;
	}

	inspectTypesBuilder.push({
		label: encoding.toUpperCase(),
		minBytes,
		convert: dv => {
			const utf8 = new TextDecoder(encoding).decode(dv.buffer);
			for (const char of utf8) return char;
			return utf8;
		},
	});
};

addTextDecoder("ascii", 1);
addTextDecoder("utf-8", 1);
addTextDecoder("utf-16", 2);
addTextDecoder("gb18030", 2);
addTextDecoder("big5", 2);
addTextDecoder("iso-2022-kr", 2);
addTextDecoder("shift-jis", 2);

export const inspectableTypes: readonly IInspectableType[] = inspectTypesBuilder;
