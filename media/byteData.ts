export class ByteData {
    private decimal: number;
    private adjacentBytes: ByteData[];

	constructor(uint8num: number) {
		this.decimal = uint8num;
		this.adjacentBytes = [];
	}
	// adds a ByteData object to the adjacent bytes array
	addAdjacentByte(byte_obj: ByteData): void {
		this.adjacentBytes.push(byte_obj);
	}

	toHex(): string {
		return this.decimal.toString(16).toUpperCase();
	}

	// COnvert the uint8num into 8bit binary
	toBinary(): string {
		return ("00000000"+ this.decimal.toString(2)).slice(-8);
	}

	to8bitUInt(): number {
		return this.decimal;
	}

	to8bitInt(): number {
		let uint = this.decimal;
		// Each decimal is guaranteed to be 8 bits because that is how the file is
		uint <<= 24;
		uint >>= 24;
		return uint;
	}

	byteConverter(numBits: number, signed: boolean, littleEndian: boolean): number | bigint {
		if (numBits % 8 != 0) {
			throw new Error ("Bits must be a multiple of 8!");
		}
		if (this.adjacentBytes.length < (numBits / 8) - 1) return NaN;
		const bytes = [];
		bytes.push(this.to8bitUInt());
		for (let i = 0; i < (numBits / 8) - 1; i++) {
			bytes.push(this.adjacentBytes[i].to8bitUInt());
		}
		const uint8bytes = Uint8Array.from(bytes);
		const dataview = new DataView(uint8bytes.buffer);
		if (numBits == 64 && signed) {
			return dataview.getBigInt64(0, littleEndian);
		} else if (numBits == 64 && !signed) {
			return dataview.getBigUint64(0, littleEndian);
		} else if (numBits == 32 && signed) {
			return dataview.getInt32(0, littleEndian);
		} else if (numBits == 32 && !signed) {
			return dataview.getUint32(0, littleEndian);
        // 24 bit isn't supported by default so we must add it
        // It's safe to cast here as the only numbits that produces a big int is 64.
		} else if (numBits == 24 && signed) {
			const first8 = (this.adjacentBytes[1].byteConverter(8, signed, littleEndian) as number) << 16;
			return first8 | this.byteConverter(16, signed, littleEndian) as number;
		} else if (numBits == 24 && !signed) {
			const first8 = (this.adjacentBytes[1].byteConverter(8, signed, littleEndian) as number & 0xFF) << 16;
			return first8 | this.byteConverter(16, signed, littleEndian) as number;
		} else if (numBits == 16 && signed) {
			return dataview.getInt16(0, littleEndian);
		} else if (numBits == 16 && !signed) {
			return dataview.getUint16(0, littleEndian);
		} else if (numBits == 8 && signed) {
			return dataview.getInt8(0);
		} else if (numBits == 8 && !signed) {
			return this.decimal;
        }
        return NaN;
	}
}