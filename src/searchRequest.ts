// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Disposable } from "vscode";
import {
	LiteralSearchQuery,
	RegExpSearchQuery,
	SearchResult,
	SearchResultsWithProgress,
} from "../shared/protocol";
import { Uint8ArrayMap } from "../shared/util/uint8ArrayMap";
import { HexDocument } from "./hexDocument";
import { LiteralSearch, Wildcard, caseInsensitiveEquivalency } from "./literalSearch";

/** Type that defines a search request created from the {@link SearchProvider} */
export interface ISearchRequest extends Disposable {
	search(): AsyncIterable<SearchResultsWithProgress>;
}

class ResultsCollector {
	private static readonly targetUpdateInterval = 1000;
	private readonly buffers = new Uint8ArrayMap<Uint8Array>();

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
	public push(previousRef: Uint8Array, from: number, to: number) {
		// Copy the array, if new, since the search will return mutable references
		const previous = this.buffers.set(previousRef, () => new Uint8Array(previousRef));

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

/** Request that handles searching for byte or text literals. */
export class LiteralSearchRequest implements ISearchRequest {
	private cancelled = false;

	constructor(
		private readonly document: HexDocument,
		private readonly query: LiteralSearchQuery,
		private readonly isCaseSensitive: boolean,
		private readonly cap: number | undefined,
	) {}

	/** @inheritdoc */
	public dispose(): void {
		this.cancelled = true;
	}

	/** @inheritdoc */
	public async *search(): AsyncIterableIterator<SearchResultsWithProgress> {
		const { isCaseSensitive, query, document, cap } = this;
		const collector = new ResultsCollector(await document.size(), cap);

		const streamSearch = new LiteralSearch(
			query.literal.map(c => (c === "*" ? Wildcard : c)),
			(index, data) => collector.push(data, index, index + data.length),
			isCaseSensitive ? undefined : caseInsensitiveEquivalency,
		);

		for await (const chunk of document.readWithEdits(0)) {
			if (this.cancelled || collector.capped) {
				yield collector.final();
				return;
			}

			streamSearch.push(chunk);
			collector.fileOffset += chunk.length;

			const toYield = collector.toYield();
			if (toYield) {
				yield toYield;
			}
		}

		yield collector.final();
	}
}

const regexSearchWindow = 8 * 1024;

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
		re: RegExpSearchQuery,
		caseSensitive: boolean,
		private readonly cap: number | undefined,
	) {
		this.re = new RegExp(re.re, caseSensitive ? "g" : "ig");
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
		const decoder = new TextDecoder("ascii");
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
				const start = strStart + str.slice(0, match.index!).length;
				const length = match[0].length;
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
