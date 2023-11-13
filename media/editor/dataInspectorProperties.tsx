/** Reads a uint24 at offset 0 from the buffer. */
const getUint24 = (arrayBuffer: ArrayBuffer, le: boolean) => {
	const buf = new Uint8Array(arrayBuffer);
	return le ? buf[0] | buf[1] << 8 | buf[2] << 16 : buf[0] << 16 | buf[1] << 8 | buf[2];
};

const getFloat16 = (exponentWidth: number, significandPrecision: number) => {
	const exponentMask = (2 ** exponentWidth - 1) << significandPrecision;
	const fractionMask = 2 ** significandPrecision - 1;

	const exponentBias = 2 ** (exponentWidth - 1) - 1;
	const exponentMin = 1 - exponentBias;

	return (arrayBuffer: ArrayBuffer, le: boolean) => {
		const buf = new Uint8Array(arrayBuffer);
		const uint16 = le ? buf[0] | buf[1] << 8 : buf[0] << 8 | buf[1];

		const e = (uint16 & exponentMask) >> significandPrecision;
		const f = uint16 & fractionMask;
		const sign = uint16 >> 15 ? -1 : 1;

		if (e === 0) {
			return sign * (2 ** exponentMin) * (f / (2 ** significandPrecision));
		} else if (e === (2 ** exponentWidth - 1)) {
			return f ? NaN : sign * Infinity;
		}

		return sign * (2 ** (e - exponentBias)) * (1 + (f / (2 ** significandPrecision)));
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

export const inspectableTypes: readonly IInspectableType[] = [
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
		}
	},

	{ label: "uint32", minBytes: 4, convert: (dv, le) => dv.getUint32(0, le).toString() },
	{ label: "int32", minBytes: 4, convert: (dv, le) => dv.getInt32(0, le).toString() },

	{ label: "int64", minBytes: 8, convert: (dv, le) => dv.getBigInt64(0, le).toString() },
	{ label: "uint64", minBytes: 8, convert: (dv, le) => dv.getBigUint64(0, le).toString() },

	{ label: "float16", minBytes: 2, convert: (dv, le) => getFloat16(5, 10)(dv.buffer, le).toString() },
	{ label: "bfloat16", minBytes: 2, convert: (dv, le) => getFloat16(8, 7)(dv.buffer, le).toString() },

	{ label: "float32", minBytes: 4, convert: (dv, le) => dv.getFloat32(0, le).toString() },
	{ label: "float64", minBytes: 8, convert: (dv, le) => dv.getFloat64(0, le).toString() },

	{
		label: "UTF-8",
		minBytes: 1,
		convert: dv => {
			const utf8 = new TextDecoder("utf-8").decode(dv.buffer);
			for (const char of utf8) return char;
			return utf8;
		},
	},
	{
		label: "UTF-16",
		minBytes: 2,
		convert: (dv, le) => {
			const utf16 = new TextDecoder(le ? "utf-16le" : "utf-16be").decode(dv.buffer);
			for (const char of utf16) return char;
			return utf16;
		},
	},
	{
		label: "GB18030",
		minBytes: 2,
		convert: dv => {
			// the valid encoding for TextDecoder is list on
			// https://developer.mozilla.org/en-US/docs/Web/API/Encoding_API/Encodings
			// GBK Character Set is an extension of GB2312. GB18030 is an extension of GBK.
			// So choose GB18030 as the encoding here.
			// see also http://herongyang.com/GB2312/Introduction-GB2312-GBK-GB18030.html
			// and https://www.ibm.com/docs/en/aix/7.1?topic=sets-gb18030
			const utf8 = new TextDecoder("gb18030").decode(dv.buffer);
			for (const char of utf8) return char;
			return utf8;
		},
	},
	{
		label: "BIG5",
		minBytes: 2,
		convert: dv => {
			const utf8 = new TextDecoder("big5").decode(dv.buffer);
			for (const char of utf8) return char;
			return utf8;
		},
	},
	{
		label: "ISO-2022-KR",
		minBytes: 2,
		convert: dv => {
			const utf8 = new TextDecoder("iso-2022-kr").decode(dv.buffer);
			for (const char of utf8) return char;
			return utf8;
		},
	},
	{
		label: "SHIFT-JIS",
		minBytes: 2,
		convert: dv => {
			const utf8 = new TextDecoder("shift-jis").decode(dv.buffer);
			for (const char of utf8) return char;
			return utf8;
		},
	},
];
