export const Wildcard = Symbol("Wildcard");

const nextStateIn = (chunk: Uint8Array, state: number, byte: number) => chunk[256] ? state + 1 : chunk[byte];

/**
 * A DFA-based literal search implementation.
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

	private readonly dfa: readonly Uint8Array[];
	private state = 0;

	constructor(
		needle: readonly (typeof Wildcard | Uint8Array)[],
		private readonly onMatch: (index: number, match: Uint8Array) => void,
	) {
		for (const chunk of needle) {
			if (chunk === Wildcard) {
				this.needleLen++;
			} else {
				this.needleLen += chunk.length;
			}
		}

		this.buffer = new Uint8Array(this.needleLen);

		const dfa = this.dfa = new Array<Uint8Array>(this.needleLen + 1);
		for (let state = 0; state < dfa.length; state++) {
			dfa[state] = new Uint8Array(0xFF + 1);
		}

		let lps = -1;
		let state = 0;
		for (const chunk of needle) {
			if (chunk === Wildcard) {
				if (lps !== -1) { dfa[state].set(dfa[lps]); }
				dfa[state].fill(state + 1);
				lps = state;
				state++;
			} else {
				for (let j = 0; j < chunk.length; j++) {
					if (lps !== -1) { dfa[state].set(dfa[lps]); }
					dfa[state][chunk[j]] = state + 1;
					lps = lps === -1 ? 0 : dfa[lps][chunk[j]];
					state++;
				}
			}
		}
	}

	push(chunk: Uint8Array): void {
		const { dfa, needleLen, buffer } = this;
		for (let i = 0; i < chunk.length; i++) {
			this.state = dfa[this.state][chunk[i]];
			buffer[this.index++ % needleLen] = chunk[i];

			if (this.state === dfa.length - 1) {
				this.state = 0;
				if (!this.matchTmpBuf) {
					this.matchTmpBuf = new Uint8Array(needleLen);
				}

				const split = this.index % needleLen;
				this.matchTmpBuf.set(buffer.subarray(split), 0);
				this.matchTmpBuf.set(buffer.subarray(0, split), needleLen - split);
				this.onMatch(this.index - needleLen, this.matchTmpBuf);
			}
		}
	}
}
