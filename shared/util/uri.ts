export interface HexEditorUriQuery {
	baseAddress?: string;
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
