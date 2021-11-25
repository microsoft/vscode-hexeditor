/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import type * as vscode from "vscode";

export interface FileWriteOp {
	offset: number;
	data: Uint8Array;
}

export interface FileAccessor {
	readonly uri: string;

	/** Calculates the size of the associated document. Undefined if unbounded */
	getSize(): Promise<number | undefined>;
	/** Reads bytes at the given offset from the file, returning the number of read bytes. */
	read(offset: number, target: Uint8Array): Promise<number>;
	/** Bulk updates data in the file. */
	writeBulk(ops: readonly FileWriteOp[]): Promise<void>;
	/** Updates the file by replacing it with the contents of the stream. */
	writeStream(stream: AsyncIterable<Uint8Array>, cancellation?: vscode.CancellationToken): Promise<void>;
	/** Signalled when a full reload is requested. Cached data should be forgotten. */
	invalidate?(): void;
}
