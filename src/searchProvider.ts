// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { HexDocument } from "./hexDocument";
import { SearchRequest } from "./searchRequest";

/***
 * Simple helper class which holds the search request for a document
 */
export class SearchProvider {
    private _document: HexDocument;
    private _request: SearchRequest | undefined;

    constructor(document: HexDocument) {
        this._document = document;
    }

    /***
     * @description Creates a new search request and returns the request object
     * @
     */
    public createNewRequest(): SearchRequest {
        this._request = new SearchRequest(this._document);
        return this._request;
    }

    /**
     * @description Cancels the search request and stops tracking in the provider
     */
    public cancelRequest(): void {
        // If it's undefined there's no request to cancel
        if (this._request === undefined) return;
        this._request.cancelSearch();
        this._request = undefined;
    }
}