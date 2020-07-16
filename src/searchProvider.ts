import { HexDocument } from "./hexDocument";


// This is the same interface in the webviews search handler, we just currently do not share interfaces across the exthost and webview
interface SearchOptions {
    regex: boolean;
    caseSensitive: boolean;
}

export class SearchProvider {

    private _document: HexDocument;
    
    constructor(document: HexDocument) {
        this._document = document;
    }

    public textSearch(query: string, options: SearchOptions): number[][] {
        if (options.regex) {
            return this.regexTextSearch(query, options.caseSensitive);
        } else {
            return this.normalTextSearch(query, options.caseSensitive);
        }
    }

    public hexSearch(query: string): number[][] {
        const results: number[][] = [];
        const queryArr = query.split(" ");
        // We compare the query to every spot in the file finding matches
        for (let i = 0; i < this._document.documentData.length; i++) {
            const matchOffsets = [];
            for (let j = 0; j < queryArr.length; j++) {
                // Once there isn't enough room in the file for the query we return
                if (i + j >= this._document.documentData.length) {
                    return results;
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
            }
        }
        return results;
    }

    private regexTextSearch(query: string, caseSensitive: boolean): number[][] {
        const transformed = String.fromCharCode.apply(null, Array.from(this._document.documentData));
        const flags = caseSensitive  ? "g" : "gi";
        const regex = new RegExp(query, flags);
        const results = [];
        try {
            const matches = transformed.matchAll(regex);
            for (const match of matches) {
                if (match.index === undefined) continue;
                const matchOffsets = [];
                for (let i = match.index; i < match.index + match[0].length; i++) {
                    matchOffsets.push(i);
                }
                results.push(matchOffsets);
            }
        } catch (err) {
            console.error(err);
        }
        return results;
    }
    
    private normalTextSearch(query: string, caseSensitive: boolean): number[][] {
        const results: number[][] = [];
        // We compare the query to every spot in the file finding matches
        for (let i = 0; i < this._document.documentData.length; i++) {
            const matchOffsets = [];
            for (let j = 0; j < query.length; j++) {
                // Once there isn't enough room in the file for the query we return
                if (i + j >= this._document.documentData.length) {
                    return results;
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
            }
        }
        return results;
    }
}