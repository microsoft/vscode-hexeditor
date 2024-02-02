const unwrap = <T>(fn: (() => T) | T) => (typeof fn === "function" ? (fn as () => T)() : fn);

/** Map of unique values keyed by uint8 array contents */
export class Uint8ArrayMap<T> {
	private table = new Map<number, { buf: Uint8Array; value: T }[]>();

	public set(buf: Uint8Array, value: (() => T) | T): T {
		const hash = doHash(buf);
		const existing = this.table.get(hash);
		if (!existing) {
			const rec = { buf, value: unwrap(value) };
			this.table.set(hash, [rec]);
			return rec.value;
		}

		for (const r of existing) {
			if (arrEquals(r.buf, buf)) {
				return r.value;
			}
		}

		const rec = { buf, value: unwrap(value) };
		existing.push(rec);
		return rec.value;
	}

	public *entries(): IterableIterator<[Uint8Array, T]> {
		for (const entries of this.table.values()) {
			for (const { buf, value } of entries) {
				yield [buf, value];
			}
		}
	}

	public *keys(): IterableIterator<Uint8Array> {
		for (const entries of this.table.values()) {
			for (const { buf } of entries) {
				yield buf;
			}
		}
	}

	public *values(): IterableIterator<T> {
		for (const entries of this.table.values()) {
			for (const { value } of entries) {
				yield value;
			}
		}
	}
}

function arrEquals(a: Uint8Array, b: Uint8Array) {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}

/** Simple hash from vscode core */
function doHash(b: Uint8Array, hashVal = 0) {
	hashVal = numberHash(149417, hashVal);
	for (let i = 0, length = b.length; i < length; i++) {
		hashVal = numberHash(b[i], hashVal);
	}
	return hashVal;
}

function numberHash(val: number, initialHashVal: number): number {
	return ((initialHashVal << 5) - initialHashVal + val) | 0; // hashVal * 31 + ch, keep as int32
}
