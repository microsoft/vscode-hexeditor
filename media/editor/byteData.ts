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
}