export const Wildcard = Symbol("Wildcard");

export const identityEquivalency = new Uint8Array(0xff);
for (let i = 0; i < 0xff; i++) {
	identityEquivalency[i] = i;
}

export const caseInsensitiveEquivalency = new Uint8Array(0xff);
for (let i = 0; i < 0xff; i++) {
	caseInsensitiveEquivalency[i] = String.fromCharCode(i).toUpperCase().charCodeAt(0);
}

/**
 * A simple literal search implementation with support for placeholders. I've
 * attempted to use or adapt several string search algorithms for use here,
 * such as Boyer-Moore and a DFA approach, but was not able to find one that
 * worked with placeholders.
 *
 * A DFA can work with wildcards easily enough, and an implementation of that
 * can be found in commit 5bcc7b4e, but I don't think placeholders can be
 * efficiently encoded into the DFA in that approach. Eventually that just
 * becomes a regex engine...
 *
 * Note that streamsearch (connor4312/streamsearch) is 70% faster than this,
 * but doesn't have support for the equivalency table or placeholders. We could
 * add a happy path that uses that library if no placeholders are present, but
 * I've opted for simplicity for the moment. This operates at
 * around 50 MB/s on my macbook.
 */
export class LiteralSearch {
	/** Rolling window of the last bytes, used to emit matched text */
	private readonly buffer: Uint8Array;
	/** Temporary buffer used to construct and return the match */
	private matchTmpBuf?: Uint8Array;
	/** Length of the needle string */
	private readonly needleLen = 0;
	/** Index in the source stream we're at. */
	private index = 0;
	/** Amount of usable data in the buffer. Reset whenever a match happens */
	private usableBuffer = 0;

	constructor(
		private readonly needle: readonly (typeof Wildcard | Uint8Array)[],
		private readonly onMatch: (index: number, match: Uint8Array) => void,
		private readonly equivalencyTable = identityEquivalency,
	) {
		for (const chunk of needle) {
			if (chunk === Wildcard) {
				this.needleLen++;
			} else {
				this.needleLen += chunk.length;
			}
		}

		this.buffer = new Uint8Array(this.needleLen);
	}

	push(chunk: Uint8Array): void {
		const { needleLen, buffer } = this;
		for (let i = 0; i < chunk.length; i++) {
			buffer[this.index++ % needleLen] = chunk[i];
			this.usableBuffer++;
			this.attemptMatch();
		}
	}

	private attemptMatch() {
		const { needle, needleLen, buffer, index, equivalencyTable } = this;
		if (this.usableBuffer < needleLen) {
			return;
		}

		let k = 0;
		for (let i = 0; i < needle.length; i++) {
			const chunk = needle[i];
			if (chunk === Wildcard) {
				k++;
				continue;
			}

			for (let j = 0; j < chunk.length; j++) {
				if (equivalencyTable[chunk[j]] !== equivalencyTable[buffer[(index + k) % needleLen]]) {
					return;
				}
				k++;
			}
		}

		if (!this.matchTmpBuf) {
			this.matchTmpBuf = new Uint8Array(needleLen);
		}

		const split = this.index % needleLen;
		this.matchTmpBuf.set(buffer.subarray(split), 0);
		this.matchTmpBuf.set(buffer.subarray(0, split), needleLen - split);
		this.onMatch(this.index - needleLen, this.matchTmpBuf);
		this.usableBuffer = 0;
	}
}
