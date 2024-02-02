/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

export const binarySearch =
	<T>(mapFn: (a: T) => number) =>
	(value: number, nodes: readonly T[]): number => {
		let mid: number;
		let lo = 0;
		let hi = nodes.length - 1;

		while (lo <= hi) {
			mid = Math.floor((lo + hi) / 2);

			if (mapFn(nodes[mid]) >= value) {
				hi = mid - 1;
			} else {
				lo = mid + 1;
			}
		}

		return lo;
	};
