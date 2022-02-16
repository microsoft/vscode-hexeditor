const dataInspectorPropertyMap: { [key: string]: (dv: DataView, le: boolean) => string } = {
	uint8: dv => dv.getUint8(0).toString(),
	int8: dv => dv.getInt8(0).toString(),
	uint16: (dv, le) => dv.getUint16(0, le).toString(),
	int16: (dv, le) => dv.getInt16(0, le).toString(),

	uint32: (dv, le) => dv.getUint32(0, le).toString(),
	int32: (dv, le) => dv.getInt32(0, le).toString(),

	int64: (dv, le) => dv.getBigInt64(0, le).toString(),
	uint64: (dv, le) => dv.getBigUint64(0, le).toString(),

	float32: (dv, le) => dv.getFloat32(0, le).toString(),
	float64: (dv, le) => dv.getFloat64(0, le).toString(),

	"UTF-8": dv => {
		const utf8 = new TextDecoder("utf-8").decode(dv.buffer);
		for (const char of utf8) return char;
		return utf8;
	},
	"UTF-16": dv => {
		const utf16 = new TextDecoder("utf-16").decode(dv.buffer);
		for (const char of utf16) return char;
		return utf16;
	},
};

export const dataInspectorProperties = Object.entries(dataInspectorPropertyMap);
