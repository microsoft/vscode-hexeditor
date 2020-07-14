import { HexDocument } from "./hexDocument";

export class SearchProvider {

    private _document: HexDocument;
    
    constructor(document: HexDocument) {
        this._document = document;
    }

    public textSearch(query: string): number[][] {
        const transformed = String.fromCharCode.apply(null, Array.from(this._document.documentData));
        const regex = new RegExp(query, "g");
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

}