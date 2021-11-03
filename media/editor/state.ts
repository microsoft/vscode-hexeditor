/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { atom, selector, selectorFamily } from "recoil";
import { FromWebviewMessage, MessageHandler, MessageType, ReadRangeResponseMessage, ReadyResponseMessage, ToWebviewMessage } from "../../shared/protocol";
import { Range } from "./util";

declare function acquireVsCodeApi(): ({ postMessage(msg: unknown): void });

export const vscode = acquireVsCodeApi();

export const messageHandler = new MessageHandler<FromWebviewMessage, ToWebviewMessage>(
	async () => {
		// todo
		return undefined;
	},
	msg => vscode.postMessage(msg)
);

window.addEventListener("message", ev => messageHandler.handleMessage(ev.data));

export const readyQuery = selector({
	key: "ready",
	get: () => messageHandler.sendRequest<ReadyResponseMessage>({ type: MessageType.ReadyRequest }),
});

const initialOffset = selector({
	key: "initialOffset",
	get: ({ get }) => get(readyQuery).initialOffset,
});

export const isLargeFile = selector({
	key: "isLargeFile",
	get: ({ get }) => get(readyQuery).isLargeFile,
});

export const bypassLargeFilePrompt = atom({
	key: "bypassLargeFilePrompt",
	default: false,
});

export interface IDimensions {
	width: number;
	height: number;
	rowPxHeight: number;
	rowByteWidth: number;
}

/** Information about the window and layout size */
export const dimensions = atom<IDimensions>({
	key: "dimensions",
	default: { width: 0, height: 0, rowPxHeight: 24, rowByteWidth: 16 },
});

/** Gets the number of bytes visible in the window. */
export const getDisplayedBytes = (d: IDimensions): number =>
	d.rowByteWidth * Math.ceil(d.height / d.rowPxHeight);

/** Currently displayed byte offset */
export const offset = atom({
	key: "offset",
	default: initialOffset,
});

/** Size of data pages, in bytes */
export const dataPageSize = atom({
	key: "dataPageSize",
	default: 1024
});

/** Bytes the user has selected */
export const selectedRange = atom<Range | undefined>({
	key: "selectedRange",
	default: undefined
});

/** Whether the user is currently dragging to select content */
export const isSelecting = atom({
	key: "isSelecting",
	default: false
});

/** The current byte that has focus and can be manipulated by keyboard shortcuts. */
export const focusedByte = atom<number | undefined>({
	key: "focusedByte",
	default: undefined
});

/**
 * First and last byte that can be currently scrolled to. May expand with
 * infinite scrolling.
 */
export const scrollBounds = atom<Range>({
	key: "scrollBounds",
	default: selector({
		key: "initialScrollBounds",
		get: ({ get }) => {
			const d = get(dimensions);
			const { fileSize } = get(readyQuery);
			const offset = get(initialOffset);
			const windowSize = getDisplayedBytes(d);
			return new Range(
				Math.max(0, offset - windowSize),
				Math.min(offset + windowSize * 2, fileSize ?? Infinity),
			);
		},
	}),
});

export const dataPages = selectorFamily({
	key: "dataPages",
	get: (pageNumber: number) => async ({ get }) => {
		const pageSize = get(dataPageSize);
		const response = await messageHandler.sendRequest<ReadRangeResponseMessage>({
			type: MessageType.ReadRangeRequest,
			offset: pageSize * pageNumber,
			bytes: pageSize,
		});

		return new Uint8Array(response.data);
	},
});
