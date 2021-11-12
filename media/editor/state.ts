/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { atom, DefaultValue, selector, selectorFamily } from "recoil";
import { buildEditTimeline, editsEqual, HexDocumentEdit, readUsingRanges } from "../../shared/hexDocumentModel";
import { FromWebviewMessage, MessageHandler, MessageType, ReadRangeResponseMessage, ReadyResponseMessage, ToWebviewMessage } from "../../shared/protocol";
import { Range } from "./util";

declare function acquireVsCodeApi(): ({ postMessage(msg: unknown): void });

export const vscode = acquireVsCodeApi();

const handles: { [T in ToWebviewMessage["type"]]?: (message: ToWebviewMessage) => Promise<FromWebviewMessage> | undefined } = {};

export const registerHandler = <T extends ToWebviewMessage["type"]>(typ: T, handler: (msg: ToWebviewMessage & { type: T }) => Promise<FromWebviewMessage> | void): void => {
	handles[typ] = handler as any;
};

export const messageHandler = new MessageHandler<FromWebviewMessage, ToWebviewMessage>(
	async msg => handles[msg.type]?.(msg),
	msg => vscode.postMessage(msg)
);

window.addEventListener("message", ev => messageHandler.handleMessage(ev.data));

export const readyQuery = selector({
	key: "ready",
	get: () => messageHandler.sendRequest<ReadyResponseMessage>({ type: MessageType.ReadyRequest }),
});

export const fileSize = selector({
	key: "fileSize",
	get: ({ get }) => get(readyQuery).fileSize,
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
	d.rowByteWidth * (Math.floor(d.height / d.rowPxHeight) - 1);

/** Currently displayed byte offset */
export const offset = atom({
	key: "offset",
	default: initialOffset,

	effects_UNSTABLE: [
		fx => {
			let stashedOffset: number | undefined;

			registerHandler(MessageType.StashDisplayedOffset, () => {
				stashedOffset = fx.getLoadable(fx.node).getValue();
			});

			registerHandler(MessageType.PopDisplayedOffset, () => {
				if (stashedOffset !== undefined) {
					fx.setSelf(stashedOffset);
					stashedOffset = undefined;
				}
			});

			registerHandler(MessageType.GoToOffset, msg => {
				const d = fx.getLoadable(dimensions).getValue();
				fx.setSelf(Math.floor(msg.offset / d.rowByteWidth) * d.rowByteWidth);
			});
		}
	],
});

/** Size of data pages, in bytes */
export const dataPageSize = atom({
	key: "dataPageSize",
	default: 1024
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
			const offset = get(initialOffset);
			const windowSize = getDisplayedBytes(d);
			return new Range(
				Math.max(0, offset - windowSize),
				get(fileSize) ?? offset + windowSize * 2,
			);
		},
	}),
});

/**
 * List of edits made locally and not synced with the extension host.
 */
export const edits = atom<readonly HexDocumentEdit[]>({
	key: "edits",
	default: selector({
		key: "initialEdits",
		get: ({ get }) => get(readyQuery).edits,
	}),

	effects_UNSTABLE: [
		fx => {
			fx.onSet((newEdits, oldEdits) => {
				if (oldEdits instanceof DefaultValue || newEdits.length > oldEdits.length) {
					messageHandler.sendEvent({
						type: MessageType.MakeEdits,
						edits: newEdits.slice(oldEdits instanceof Array ? oldEdits.length : 0),
					});
				}
			});

			registerHandler(MessageType.SetEdits, msg => {
				if (!editsEqual(fx.getLoadable(fx.node).getValue(), msg.edits)) {
					fx.setSelf(msg.edits);
				}
			});
		}
	]
});

export const lastSavedEdit = atom({
	key: "lastSavedEdit",
	default: selector({
		key: "initialLastSavedEdit",
		get: ({ get }) => get(readyQuery).lastSavedEdit,
	}),

	effects_UNSTABLE: [
		fx => {
			registerHandler(MessageType.Saved, msg => {
				fx.setSelf(msg.lastEditId);
			});
		},
	]
});

export const editTimeline = selector({
	key: "editTimeline",
	get: ({ get }) => buildEditTimeline(get(edits)),
});

export const editedDataPages = selectorFamily({
	key: "editedDataPages",
	get: (pageNumber: number) => async ({ get }) => {
		const pageSize = get(dataPageSize);
		const { ranges } = get(editTimeline);
		const target = new Uint8Array(pageSize);

		const it = readUsingRanges({
			read: (offset, target) => {
				const pageNo = Math.floor(offset / pageSize);
				const page = get(rawDataPages(pageNo));
				const start = offset - pageNo * pageSize;
				const len = Math.min(page.byteLength - start, target.byteLength);
				target.set(page.subarray(start, start + len), 0);
				return Promise.resolve(len);
			}
		}, ranges, pageSize * pageNumber, pageSize);

		let soFar = 0;
		for await (const chunk of it) {
			const read = Math.min(chunk.length, target.length - soFar);
			target.set(chunk.subarray(0, read), soFar);
			soFar += read;
			if (soFar === pageSize) {
				return target;
			}
		}

		return target.subarray(0, soFar);
	},
});

const rawDataPages = selectorFamily({
	key: "rawDataPages",
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
