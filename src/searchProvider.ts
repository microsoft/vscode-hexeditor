// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ExtensionHostMessageHandler, MessageType } from "../shared/protocol";
import { ISearchRequest } from "./searchRequest";

/***
 * Simple helper class which holds the search request for a document
 */
export class SearchProvider {
	private _request: ISearchRequest | undefined;

	/***
	 * @description Creates a new search request and returns the request object
	 * @
	 */
	public start(messaging: ExtensionHostMessageHandler, request: ISearchRequest): void {
		this._request?.dispose();
		this._request = request;

		(async () => {
			for await (const results of request.search()) {
				messaging.sendEvent({ type: MessageType.SearchProgress, data: results });
			}
		})();
	}

	/**
	 * @description Cancels the search request and stops tracking in the provider
	 */
	public cancel(): void {
		this._request?.dispose();
		this._request = undefined;
	}
}
