/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { atom, selector, selectorFamily } from "recoil";
import { FromWebviewMessage, MessageHandler, MessageType, ReadRangeResponseMessage, ReadyResponseMessage, ToWebviewMessage } from "../../shared/protocol";

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

export const isLargeFile = selector({
	key: "isLargeFile",
	get: ({ get }) => get(readyQuery).isLargeFile,
});

export const bypassLargeFilePrompt = atom({
	key: "bypassLargeFilePrompt",
	default: false,
});

/** Information about the window and layout size */
export const dimensions = atom<{ width: number, height: number, rowHeight: number }>({
	key: "windowSize",
	default: { width: 0, height: 0, rowHeight: 0, },
});

/** Currently displayed byte offset */
export const offset = atom({
	key: "offset",
	default: selector({
		key: "initialOffset",
		get: ({ get }) => get(readyQuery).initialOffset,
	}),
});

/** Size of data pages, in bytes */
export const dataPageSize = atom({
	key: "dataPageSize",
	default: 1024
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
