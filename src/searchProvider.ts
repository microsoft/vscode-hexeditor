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

export class SearchProvider {

    private _document: HexDocument;
    private _cancelled = false;
    private _searchStart = Date.now();

    // How many search results we will return
    private static _searchResultLimit = 1000000;
    // How long we want to let the search run before interrupting it to check for cancellations
    private static _interruptTime  = 100;
    
    constructor(document: HexDocument) {
        this._document = document;
    }

    public textSearch(query: string, options: SearchOptions): SearchResults | undefined {
        if (options.regex) {
            return this.regexTextSearch(query, options.caseSensitive);
        } else {
            return this.normalTextSearch(query, options.caseSensitive, 0);
        }
    }

    /**
     * @description Searches the hex document for a given query
     * @param {string} query The query being searched for 
     * @param {number} documentIndex The index to start the search at
     * @param {number[][] | undefined} results This is passed in if some results have already been calculated, i.e when we interrupt this calls to check for cancellations
     */
    public hexSearch(query: string, documentIndex: number, results?: number[][]): SearchResults | undefined {
        this._searchStart = Date.now();
        console.log(results);
        results = results === undefined ? [] : results;
        const queryArr = query.split(" ");
        // We compare the query to every spot in the file finding matches
        for (let i = documentIndex; i < this._document.documentData.length; i++) {
            const matchOffsets = [];
            for (let j = 0; j < queryArr.length; j++) {
                // Once there isn't enough room in the file for the query we return
                if (i + j >= this._document.documentData.length) {
                    return {
                        result: results,
                        partial: false
                    };
                }
                const hex = this._document.documentData[i+j].toString(16).toUpperCase();
                const currentComparison = queryArr[j].toUpperCase();
                // ?? is wild card and matches anything, else they must match exactly
                // If they don't we don't check things after in the query as that's wasted computation
                if (currentComparison === "??" || currentComparison === hex) {
                    matchOffsets.push(i+j);
                } else {
                    break;
                }
            }
            // If We got a complete match then it is valid
            if (matchOffsets.length === queryArr.length) {
                results.push(matchOffsets);
                // We stop calculating results after we hit the limit and just call it a partial response
                if (results.length === SearchProvider._searchResultLimit) {
                    return {
                        result: results,
                        partial: true
                    };
                }
            }
            // If it's cancelled we just return what we have
            if (this._cancelled) {
                console.log("Hex cancellation!");
                this._cancelled = false;
                return {
                    result: results,
                    partial: true
                };  
            }
            // If the search has run for awhile we use set immediate to place it back at the end of the event loop so other things can run
            if ((Date.now() - this._searchStart) > SearchProvider._interruptTime) {
                setImmediate(this.hexSearch.bind(this), query, documentIndex, results);
                return undefined;
            }
        }
        return {
            result: results,
            partial: false
        };
    }

    /**
     * @description Handles searching for regexes within the decoded text
     * @param {string} query The regex 
     * @param {boolean} caseSensitive Whether or not you care about matching cases 
     * @param {string} transformedDocument The string to compare the regex against, this is normally the whole document
     */
    private regexTextSearch(query: string, caseSensitive: boolean, transformedDocument?: string): SearchResults | undefined {
        this._searchStart = Date.now();
        transformedDocument = transformedDocument === undefined ? String.fromCharCode.apply(null, Array.from(this._document.documentData)) : transformedDocument;
        // If the search has run for awhile we use set immediate to place it back at the end of the event loop so other things can run
        if ((Date.now() - this._searchStart) > SearchProvider._interruptTime) {
            setImmediate(this.regexTextSearch.bind(this), query, caseSensitive, transformedDocument);
            return undefined;
        }
        // If it was cancelled we haven't even started the search so we return nothing
        if (this._cancelled) {
            this._cancelled = false;
            return undefined;
        }
        const flags = caseSensitive  ? "g" : "gi";
        const regex = new RegExp(query, flags);
        const results = [];
        try {
            const matches = transformedDocument.matchAll(regex);
            // If the search has run for awhile we use set immediate to place it back at the end of the event loop so other things can run
            // In regex search we do this afer transforming the document and after running the matches
            if ((Date.now() - this._searchStart) > SearchProvider._interruptTime) {
                setImmediate(this.regexTextSearch.bind(this), query, caseSensitive, transformedDocument);
                return undefined;
            }
            // If it was cancelled we haven't even started the search so we return nothing
            if (this._cancelled) {
                this._cancelled = false;
                return undefined;
            }
            for (const match of matches) {
                if (match.index === undefined) continue;
                const matchOffsets = [];
                for (let i = match.index; i < match.index + match[0].length; i++) {
                    matchOffsets.push(i);
                }
                results.push(matchOffsets);
                // We stop calculating results after we hit the limit and just call it a partial response
                if (results.length === SearchProvider._searchResultLimit) {
                    return {
                        result: results,
                        partial: true
                    };
                }
            }
        } catch (err) {
            console.error(err);
        }
        return {
            result: results,
            partial: false
        };
    }
    
    /**
     * @description Handles searching for string literals within the decoded text section
     * @param {string} query The query you're searching for 
     * @param {boolean} caseSensitive Whether or not case matters 
     * @param {number} documentIndex The index to start your search at 
     * @param {number[][] | undefined} results This is passed in if some results have already been calculated, i.e when we interrupt this calls to check for cancellations
     */
    private normalTextSearch(query: string, caseSensitive: boolean, documentIndex: number, results?: number[][]): SearchResults | undefined {
        this._searchStart = Date.now();
        results = results === undefined ? [] : results;
        // We compare the query to every spot in the file finding matches
        for (let i = 0; i < this._document.documentData.length; i++) {
            const matchOffsets = [];
            for (let j = 0; j < query.length; j++) {
                // Once there isn't enough room in the file for the query we return
                if (i + j >= this._document.documentData.length) {
                    return {
                        result: results,
                        partial: false
                    };
                }
                let ascii = String.fromCharCode(this._document.documentData[i+j]);
                let currentComparison = query[j];
                // Ignoring case we make them uppercase                
                if (!caseSensitive) {
                    ascii = ascii.toUpperCase();
                    currentComparison = currentComparison.toUpperCase();
                }
                // If it's a match we add the offset to the results
                if (currentComparison === ascii) {
                    matchOffsets.push(i+j);
                } else {
                    break;
                }
            }
            // If we got a complete match then it is valid
            if (matchOffsets.length === query.length) {
                results.push(matchOffsets);
                // We stop calculating results after we hit the limit and just call it a partial response
                if (results.length === SearchProvider._searchResultLimit) {
                    return {
                        result: results,
                        partial: true
                    };
                }
            }
            // If it's cancelled we just return what we have
            if (this._cancelled) {
                console.log("Text cancellation!");
                this._cancelled = false;
                return {
                    result: results,
                    partial: true
                };  
            }
            // If the search has run for awhile we use set immediate to place it back at the end of the event loop so other things can run
            if ((Date.now() - this._searchStart) > SearchProvider._interruptTime) {
                setImmediate(this.textSearch.bind(this), query, caseSensitive, documentIndex, results);
                return undefined;
            }
        }
        return {
            result: results,
            partial: false
        };
    }

    public cancelSearch(): void {
        console.log("cancelled");
        this._cancelled = true;
    }
}