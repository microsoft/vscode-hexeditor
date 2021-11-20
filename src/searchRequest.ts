// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { HexDocument } from "./hexDocument";
import StreamSearch from "@vscode/streamsearch";
import { SearchResult, SearchResultsWithProgress } from "../shared/protocol";
import { Disposable } from "vscode";
import { utf8Length } from "./util";

/** Type that defines a search request created from the {@link SearchProvider} */
export interface ISearchRequest extends Disposable {
	search(): AsyncIterable<SearchResultsWithProgress>
}

class ResultsCollector {
	private static readonly targetUpdateInterval = 1000;

	public get capped() {
		return this.cap === 0;
	}

	constructor(
		private readonly filesize: number | undefined,
		private cap: number | undefined,
	) {}

	public fileOffset = 0;

	private lastYieldedTime = Date.now();
	private results: SearchResult[] = [];

	/** Adds results to the collector */
	public push(previous: Uint8Array, from: number, to: number) {
		if (this.cap === undefined) {
			this.results.push({ from, to, previous });
		} else if (this.cap > 0) {
			this.results.push({ from, to, previous });
			this.cap--;
		}
	}

	/** Returns the results to yield right now, if any */
	public toYield(): SearchResultsWithProgress | undefined {
		const now = Date.now();
		if (now - this.lastYieldedTime > ResultsCollector.targetUpdateInterval) {
			this.lastYieldedTime = now;
			const results = this.results;
			this.results = [];
			return { progress: this.filesize ? this.fileOffset / this.filesize : 0, results };
		}

		return undefined;
	}

	/** Returns the final set of results */
	public final(): SearchResultsWithProgress {
		return { progress: 1, capped: this.capped, results: this.results };
	}
}

// Table that maps from ASCII character codes to a transformed case-insensitive code.
const caseInsensitiveTable = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
	caseInsensitiveTable[i] = String.fromCharCode(i).toUpperCase().charCodeAt(0);
}

/** In-place transformation that makes the buffer case-insensitive */
const transformToInsensitive = (buf: Uint8Array) => {
	for (let i = 0; i < buf.length; i++) {
		buf[i] = caseInsensitiveTable[buf[i]];
	}
};

/** Request that handles searching for byte or text literals. */
export class LiteralSearchRequest implements ISearchRequest {
	private cancelled = false;
	private readonly searchNeedle = this.originalNeedle;

	constructor(
		private readonly document: HexDocument,
		private readonly originalNeedle: Uint8Array,
		private readonly isCaseSensitive: boolean,
		private readonly cap: number | undefined,
	) {
		if (!isCaseSensitive) {
			this.searchNeedle = new Uint8Array(this.originalNeedle);
			transformToInsensitive(this.searchNeedle);
		}
	}

	/** @inheritdoc */
	public dispose(): void {
		this.cancelled = true;
	}

	/** @inheritdoc */
	public async *search(): AsyncIterableIterator<SearchResultsWithProgress> {
		const { isCaseSensitive, originalNeedle, searchNeedle, document, cap } = this;
		const collector = new ResultsCollector(await document.size(), cap);

		const streamSearch = new StreamSearch(searchNeedle, (match, data) => {
			if (data) {
				collector.fileOffset += data.length;
			}
			if (match) {
				collector.push(originalNeedle, collector.fileOffset, collector.fileOffset + searchNeedle.length);
				collector.fileOffset += searchNeedle.length;
			}
		});

		for await (const chunk of document.readWithEdits(0)) {
			if (this.cancelled || collector.capped) {
				yield collector.final();
				return;
			}

			if (!isCaseSensitive) {
				const transformed = new Uint8Array(chunk);
				transformToInsensitive(transformed);
				streamSearch.push(transformed);
			} else {
				streamSearch.push(chunk);
			}


			const toYield = collector.toYield();
			if (toYield) {
				yield toYield;
			}
		}

		yield collector.final();
	}
}

const regexSearchWindow = 5 * 1024;

/**
 * Request that handles searching for text regexes. This works on a window of
 * data and is not an ideal implementation. For instance, a regex could start
 * matching at byte 0 and end matching 10 GB later. For this, we need a
 * streaming regex matcher. There are a few of them, but none that I can find
 * in JavaScript/npm today.
 *
 * Neither Rust's regex engine or RE2 support streaming, but PCRE2 does, so we
 * may at some point evaluate wrapping that into webassembly and using it here.
 *
 * @see https://www.pcre.org/current/doc/html/pcre2partial.html
 */
export class RegexSearchRequest implements ISearchRequest {
	private cancelled = false;
	private re: RegExp;

	constructor(
		private readonly document: HexDocument,
		reSource: string,
		caseSensitive: boolean,
		private readonly cap: number | undefined,
	) {
		this.re = new RegExp(reSource, caseSensitive ? "g" : "ig");
	}

	/** @inheritdoc */
	public dispose(): void {
		this.cancelled = true;
	}

	/** @inheritdoc */
	public async *search(): AsyncIterableIterator<SearchResultsWithProgress> {
		let str = "";
		let strStart = 0;

		const { re, document } = this;
		const decoder = new TextDecoder();
		const encoder = new TextEncoder();
		const collector = new ResultsCollector(await document.size(), this.cap);

		for await (const chunk of document.readWithEdits(0)) {
			if (this.cancelled || collector.capped) {
				yield collector.final();
				return;
			}

			str += decoder.decode(chunk);

			let lastReIndex = 0;
			for (const match of str.matchAll(re)) {
				const start = strStart + utf8Length(str.slice(0, match.index!));
				const length = utf8Length(match[0]);
				collector.push(encoder.encode(match[0]), start, start + length);
				lastReIndex = match.index! + match[0].length;
			}

			collector.fileOffset += chunk.length;

			// Cut off the start of the string either to meet the window requirements,
			// or at the index of the last match -- whichever is greater.
			const overflow = Math.max(str.length - regexSearchWindow, lastReIndex);
			if (overflow > 0) {
				strStart += overflow;
				re.lastIndex = 0;
				str = str.slice(overflow);
			}

			const toYield = collector.toYield();
			if (toYield) {
				yield toYield;
			}
		}

		yield collector.final();
	}
}
