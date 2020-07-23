// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { HexDocument } from "./hexDocument";

// This is the same interface in the webviews search handler, we just currently do not share interfaces across the exthost and webview
interface SearchOptions {
    regex: boolean;
    caseSensitive: boolean;
}

export interface SearchResults {
    result: number[][];
    partial: boolean;
}

export class SearchRequest {

    private _documentDataWithEdits: number[];
    private _cancelled = false;

    // How many search results we will return
    private static _searchResultLimit = 100000;
    // How long we want to let the search run before interrupting it to check for cancellations
    private static _interruptTime  = 100;
    
    constructor(document: HexDocument) {
        this._documentDataWithEdits = document.documentDataWithEdits;
    }

    public async textSearch(query: string, options: SearchOptions): Promise<SearchResults> {
        const results: SearchResults = {
            result: [],
            partial: false
        };
        if (options.regex) {
            return new Promise((resolve) => {
                this.regexTextSearch(query, options.caseSensitive, results, String.fromCharCode.apply(null, Array.from(this._documentDataWithEdits)), resolve);
            });
        } else {
            return new Promise((resolve) => {
                this.normalTextSearch(query, options.caseSensitive, 0, results, resolve);
            });
        }
    }

    public async hexSearch(query: string[]): Promise<SearchResults> {
        const results: SearchResults = {
            result: [],
            partial: false
        };
        return new Promise((resolve) => {
            this.normalHexSearch(query, 0, results, resolve);
        });
    }

    /**
     * @description Searches the hex document for a given query
     * @param {string[]} query The query being searched for 
     * @param {number} documentIndex The index to start the search at
     * @param {SearchResults} results The results passed as a reference so it can be passed through the calls
     * @param {(value: SearchResults) => void} onComplete Callback which is called when the function is completed
     */
    public normalHexSearch(query: string[], documentIndex: number, results: SearchResults, onComplete: (value: SearchResults) => void): void {
        const searchStart = Date.now();
        // We compare the query to every spot in the file finding matches
        for (; documentIndex < this._documentDataWithEdits.length; documentIndex++) {
            const matchOffsets = [];
            for (let j = 0; j < query.length; j++) {
                // Once there isn't enough room in the file for the query we return
                if (documentIndex + j >= this._documentDataWithEdits.length) {
                    onComplete(results);
                    return;
                }
                let hex = this._documentDataWithEdits[documentIndex+j].toString(16).toUpperCase();
                // ensures that 0D and D produce a match because we expect hex to be two characters
                hex = hex.length !== 2 ? "0" + hex : hex; 
                const currentComparison = query[j].toUpperCase();
                // ?? is wild card and matches anything, else they must match exactly
                // If they don't we don't check things after in the query as that's wasted computation
                if (currentComparison === "??" || currentComparison === hex) {
                    matchOffsets.push(documentIndex+j);
                } else {
                    break;
                }
            }
            // If We got a complete match then it is valid
            if (matchOffsets.length === query.length) {
                results.result.push(matchOffsets);
                // We stop calculating results after we hit the limit and just call it a partial response
                if (results.result.length === SearchRequest._searchResultLimit) {
                    results.partial = true;
                    onComplete(results);
                    return;
                }
            }
            // If it's cancelled we just return what we have
            if (this._cancelled) {
                this._cancelled = false;
                results.partial = true;
                onComplete(results);
                return;
            }
            // If the search has run for awhile we use set immediate to place it back at the end of the event loop so other things can run
            if ((Date.now() - searchStart) > SearchRequest._interruptTime) {
                setImmediate(() => this.normalHexSearch(query, documentIndex, results, onComplete));
                return undefined;
            }
        }
        onComplete(results);
        return;
    }

    /**
     * @description Handles searching for regexes within the decoded text
     * @param {string} query The regex 
     * @param {boolean} caseSensitive Whether or not you care about matching cases 
     * @param {SearchResults} results The results of the completed search, this is passed by reference so that it can be passed during setImmediate
     * @param {(value: SearchResults) => void} onComplete Callback which is called when the function is completed
     */
    private regexTextSearch(query: string, caseSensitive: boolean, results: SearchResults, documentString: string, onComplete: (value: SearchResults) => void): void {
        const searchStart = Date.now();
        const flags = caseSensitive  ? "g" : "gi";
        const regex = new RegExp(query, flags);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(documentString)) !== null) {
            if (match.index === undefined) continue;
            const matchOffsets = [];
            for (let i = match.index; i < match.index + match[0].length; i++) {
                matchOffsets.push(i);
            }
            results.result.push(matchOffsets);
            // If it was cancelled we return immediately
            if (this._cancelled) {
                this._cancelled = false;
                results.partial = true;
                onComplete(results);
                return;
            }
            // If the search has run for awhile we use set immediate to place it back at the end of the event loop so other things can run
            if ((Date.now() - searchStart) > SearchRequest._interruptTime) {
                setImmediate(() => this.regexTextSearch(query, caseSensitive, results, documentString, onComplete));
                return;
            }
            // We stop calculating results after we hit the limit and just call it a partial response
            if (results.result.length === SearchRequest._searchResultLimit) {
                results.partial = true;
                onComplete(results);
                return;
            }
        }
        onComplete(results);
        return;
    }
    
    /**
     * @description Handles searching for string literals within the decoded text section
     * @param {string} query The query you're searching for 
     * @param {boolean} caseSensitive Whether or not case matters 
     * @param {number} documentIndex The index to start your search at 
     * @param {SearchResults} results The results of the completed search, this is passed by reference so that it can be passed during setImmediate
     * @param {(value: SearchResults) => void} onComplete The callback to be called when the search is completed
     */
    private normalTextSearch(query: string, caseSensitive: boolean, documentIndex: number, results: SearchResults, onComplete: (value: SearchResults) => void): void {
        const searchStart = Date.now();
        // We compare the query to every spot in the file finding matches
        for (; documentIndex < this._documentDataWithEdits.length; documentIndex++) {
            const matchOffsets = [];
            for (let j = 0; j < query.length; j++) {
                // Once there isn't enough room in the file for the query we return
                if (documentIndex + j >= this._documentDataWithEdits.length) {
                    onComplete(results);
                    return;
                }
                let ascii = String.fromCharCode(this._documentDataWithEdits[documentIndex+j]);
                let currentComparison = query[j];
                // Ignoring case we make them uppercase                
                if (!caseSensitive) {
                    ascii = ascii.toUpperCase();
                    currentComparison = currentComparison.toUpperCase();
                }
                // If it's a match we add the offset to the results
                if (currentComparison === ascii) {
                    matchOffsets.push(documentIndex+j);
                } else {
                    break;
                }
            }
            // If we got a complete match then it is valid
            if (matchOffsets.length === query.length) {
                results.result.push(matchOffsets);
                // We stop calculating results after we hit the limit and just call it a partial response
                if (results.result.length === SearchRequest._searchResultLimit) {
                    results.partial = true;
                    onComplete(results);
                    return;
                }
            }
            // If it's cancelled we just return what we have
            if (this._cancelled) {
                this._cancelled = false;
                results.partial = true;
                onComplete(results);
                return;
            }
            // If the search has run for awhile we use set immediate to place it back at the end of the event loop so other things can run
            if ((Date.now() - searchStart) > SearchRequest._interruptTime) {
                setImmediate(this.normalTextSearch.bind(this), query, caseSensitive, documentIndex, results, onComplete);
                return;
            }
        }
        onComplete(results);
        return;
    }

    public cancelSearch(): void {
        this._cancelled = true;
    }
}