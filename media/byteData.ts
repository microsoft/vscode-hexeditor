// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export class ByteData {
    private decimal: number;
    private adjacentBytes: ByteData[];

	/**
	 * @description Creates a ByteData object which acts as the datalayer for a single hex value
	 * @param uint8num The 8bit number from the file to be represented
	 */
	constructor(uint8num: number) {
		this.decimal = uint8num;
		this.adjacentBytes = [];
	}

	/**
	 * @description Adds a given ByteData object as adjancent to the current one (utilized for higher than 8bit calculations) 
	 * @param {ByteData} byte_obj The ByteData obvject to add to the array
	 */
	addAdjacentByte(byte_obj: ByteData): void {
		this.adjacentBytes.push(byte_obj);
	}

	/**
	 * @description Returns the hex representation of the ByteData object
	 * @returns {string} The ByteData represented as a hex string
	 */
	toHex(): string {
		return this.decimal.toString(16).toUpperCase();
	}

	/**
	 * @description Returns the binary representation of the ByteData object
	 * @returns {string} The ByteData represented a binary string
	 */
	toBinary(): string {
		return ("00000000"+ this.decimal.toString(2)).slice(-8);
	}

	/**
	 * @description Returns the 8bit unsigned int representation of the ByteData object
	 * @returns {number} The 8 bit unsigned int
	 */
	to8bitUInt(): number {
		return this.decimal;
	}

	/**
	 * @description Converts the byte data to a utf-8 character
	 * @param {boolean} littleEndian Whether or not it's represented in little endian
	 * @returns {string} The utf-8 character
	 */
	toUTF8(littleEndian: boolean): string {
		let uint8Data = [this.to8bitUInt()];
		for (let i = 0; i < 3 && i < this.adjacentBytes.length; i++) {
			uint8Data.push(this.adjacentBytes[i].to8bitUInt());
		}
		if (!littleEndian) {
			uint8Data = uint8Data.reverse();
		}
		const utf8 = new TextDecoder("utf-8").decode(new Uint8Array(uint8Data));
		// We iterate through the string and immediately reutrn the first character
		for (const char of utf8) return char;
		return utf8;
	}

	/**
	 * @description Converts the byte data to a utf-16 character
	 * @param {boolean} littleEndian Whether or not it's represented in little endian
	 * @returns {string} The utf-16 character
	 */
	toUTF16(littleEndian: boolean): string {
		let uint8Data = [this.to8bitUInt()];
		if (this.adjacentBytes.length === 0) return "End of File";
		for (let i = 0; i < 3 && i < this.adjacentBytes.length; i++) {
			uint8Data.push(this.adjacentBytes[i].to8bitUInt());
		}
		if (!littleEndian) {
			uint8Data = uint8Data.reverse();
		}
		const utf16 = new TextDecoder("utf-16").decode(new Uint8Array(uint8Data));
		// We iterate through the string and immediately reutrn the first character
		for (const char of utf16) return char;
		return utf16;
	}

	/**
	 * @description Handles converting the ByteData object into many of the unsigned and signed integer formats
	 * @param {number} numBits The numbers of bits you want represented, must be a multiple of 8 and <= 64
	 * @param {boolean} signed Whether you want the returned representation to be signed or unsigned
	 * @param {boolean} littleEndian True if you want it represented in little endian, false if big endian
	 * @param {boolean} float If you pass in 32 or 64 as numBits do you want them to be float32 or float64, defaults to false
	 * @returns {number | bigint} The new representation
	 */
	byteConverter(numBits: number, signed: boolean, littleEndian: boolean, float = false): number | bigint {
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
		if (numBits == 64 && float) {
			return dataview.getFloat64(0, littleEndian);
		} else if (numBits == 64 && signed) {
			return dataview.getBigInt64(0, littleEndian);
		} else if (numBits == 64 && !signed) {
			return dataview.getBigUint64(0, littleEndian);
		} else if (numBits == 32 && float) {
			return dataview.getFloat32(0, littleEndian);
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