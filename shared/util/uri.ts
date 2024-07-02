export interface HexEditorUriQuery {
	baseAddress?: string;
	diffKey?: string;
	isDiff?: string;
}

/**
 * Utility function to convert a Uri query string into a map
 */
export function parseQuery(queryString: string): HexEditorUriQuery {
	const queries: HexEditorUriQuery = {};
	if (queryString) {
		const pairs = (queryString[0] === "?" ? queryString.substr(1) : queryString).split("&");
		for (const q of pairs) {
			const pair = q.split("=");
			const name = pair.shift();
			if (name) {
				queries[name as keyof HexEditorUriQuery] = pair.join("=");
			}
		}
	}
	return queries;
}

export function addQueries(baseQuery: string, ...queries: string[]): string {
	if (baseQuery.length > 0) {
		return baseQuery + queries.join("&");
	} else if (queries.length > 0) {
		return `?${queries.join("&")}`;
	}
	return "";
}
