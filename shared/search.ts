/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

export interface SearchResults {
	result: number[][];
	partial: boolean;
}

export interface SearchOptions {
	regex: boolean;
	caseSensitive: boolean;
}
