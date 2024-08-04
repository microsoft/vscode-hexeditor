export interface HexEditorUriQuery {
	baseAddress?: string;
	token?: string;
	side?: "modified" | "original";
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
			const name = pair.shift() as keyof HexEditorUriQuery;
			if (name) {
				const value = pair.join("=");
				if (name === "side") {
					if (value === "modified" || value === "original" || value === undefined) {
						queries.side = value;
					}
				} else {
					queries[name] = value;
				}
			}
		}
	}
	return queries;
}

/**
 * Forms a valid HexEditor Query to be used in vscode.Uri
 */
export function formQuery(queries: HexEditorUriQuery): string {
	const query: string[] = [];
	for (const q in queries) {
		const queryValue = queries[q as keyof HexEditorUriQuery];
		if (queryValue !== undefined && queryValue !== "") {
			query.push(`${q}=${queryValue}`);
		}
	}
	return query.join("&");
}
