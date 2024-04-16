/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { atom, DefaultValue, selector, selectorFamily } from "recoil";
import { buildEditTimeline, HexDocumentEdit, readUsingRanges } from "../../shared/hexDocumentModel";
import {
	FromWebviewMessage,
	InspectorLocation,
	MessageHandler,
	MessageType,
	ReadRangeResponseMessage,
	ReadyResponseMessage,
	SearchResultsWithProgress,
	ToWebviewMessage,
} from "../../shared/protocol";
import { deserializeEdits, serializeEdits } from "../../shared/serialization";
import { Range } from "../../shared/util/range";
import { clamp } from "./util";

const acquireVsCodeApi: () => {
	postMessage(msg: unknown): void;
	getState(): any;
	setState(value: any): void;
} = (globalThis as any).acquireVsCodeApi;

export const vscode = acquireVsCodeApi?.();

type HandlerFn = (message: ToWebviewMessage) => Promise<FromWebviewMessage> | undefined;

const handles: { [T in ToWebviewMessage["type"]]?: HandlerFn | HandlerFn[] } = {};

export const registerHandler = <T extends ToWebviewMessage["type"]>(
	typ: T,
	handler: (msg: ToWebviewMessage & { type: T }) => Promise<FromWebviewMessage> | void,
): void => {
	const cast = handler as HandlerFn;
	const prev = handles[typ];
	if (!prev) {
		handles[typ] = cast;
	} else if (typeof prev === "function") {
		handles[typ] = [prev, cast];
	} else {
		prev.push(cast);
	}
};

export const messageHandler = new MessageHandler<FromWebviewMessage, ToWebviewMessage>(
	async msg => {
		const h = handles[msg.type];
		if (!h) {
			console.warn("unhandled message", msg);
		} else if (typeof h === "function") {
			return h(msg);
		} else {
			for (const fn of h) {
				fn(msg);
			}
		}
	},
	msg => vscode.postMessage(msg),
);

window.addEventListener("message", ev => messageHandler.handleMessage(ev.data));

const readyQuery = selector({
	key: "ready",
	get: () => messageHandler.sendRequest<ReadyResponseMessage>({ type: MessageType.ReadyRequest }),
});

/**
 * Selector for where the Data Inspector should be shown, if anywhere.
 * This is partially user configured, but may also change based off the
 * available editor width.
 */
export const dataInspectorLocation = selector({
	key: "dataInspectorSide",
	get: ({ get }) => {
		const settings = get(editorSettings);
		const d = get(dimensions);
		if (settings.inspectorType === InspectorLocation.Sidebar) {
			return InspectorLocation.Sidebar;
		}

		// rough approximation, if there's no enough horizontal width then use a hover instead
		// rowPxHeight * columnWidth is the width of the 'bytes' display. Double it
		// for the Decoded Text, if any, plus some sensible padding.
		if (d.rowPxHeight * settings.columnWidth * (settings.showDecodedText ? 2 : 1) + 100 > d.width) {
			return InspectorLocation.Hover;
		}

		return settings.inspectorType;
	},
});

export const isReadonly = selector({
	key: "isReadonly",
	get: ({ get }) => get(readyQuery).isReadonly,
});

export const codeSettings = selector({
	key: "codeSettings",
	get: ({ get }) => get(readyQuery).codeSettings,
});

export const showReadonlyWarningForEl = atom<HTMLElement | null>({
	key: "showReadonlyWarningForEl",
	default: null,
});

const diskFileSize = atom({
	key: "diskFileSize",
	default: selector({
		key: "defaultDiskFileSize",
		get: ({ get }) => get(readyQuery).fileSize,
	}),
	effects_UNSTABLE: [
		fx => {
			registerHandler(MessageType.SetEdits, msg => {
				if (msg.replaceFileSize !== undefined) {
					fx.setSelf(msg.replaceFileSize ?? undefined);
				}
			});
			registerHandler(MessageType.Saved, () => {
				const size = fx.getLoadable(diskFileSize).getValue();
				if (size === undefined) {
					return;
				}
				fx.setSelf(size + fx.getLoadable(unsavedEditTimeline).getValue().sizeDelta);
			});
		},
	],
});

export const fileSize = selector({
	key: "fileSize",
	get: ({ get }) => {
		const initial = get(diskFileSize);
		const sizeDelta = get(unsavedEditTimeline).sizeDelta;
		return initial === undefined ? initial : initial + sizeDelta;
	},
});

const initialOffset = selector<number>({
	key: "initialOffset",
	get: ({ get }) => vscode.getState()?.offset ?? get(readyQuery).initialOffset,
});

/** Editor settings which have changes persisted to user settings */
export const editorSettings = atom({
	key: "editorSettings",
	default: selector({
		key: "defaultEditorSettings",
		get: ({ get }) => get(readyQuery).editorSettings,
	}),
	effects_UNSTABLE: [
		fx =>
			fx.onSet(value =>
				messageHandler.sendEvent({
					type: MessageType.UpdateEditorSettings,
					editorSettings: value,
				}),
			),
	],
});

export const columnWidth = selector({
	key: "columnWidth",
	get: ({ get }) => get(editorSettings).columnWidth,
});

export const showDecodedText = selector({
	key: "showDecodedText",
	get: ({ get }) => get(editorSettings).showDecodedText,
});

// Atom used to invalidate data when a reload is requested.
const reloadGeneration = atom({
	key: "reloadGeneration",
	default: 0,
	effects_UNSTABLE: [
		fx => {
			registerHandler(MessageType.ReloadFromDisk, () => {
				fx.setSelf(Date.now());
			});
		},
	],
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
}

/** Information about the window and layout size */
export const dimensions = atom<IDimensions>({
	key: "dimensions",
	default: { width: 0, height: 0, rowPxHeight: 24 },
});

/** Gets the number of bytes visible in the window. */
export const getDisplayedBytes = (d: IDimensions, columnWidth: number): number =>
	columnWidth * (Math.floor(d.height / d.rowPxHeight) - 1);

/** Gets whether the byte is visible in the current window. */
export const isByteVisible = (
	d: IDimensions,
	columnWidth: number,
	offset: number,
	byte: number,
): boolean => byte >= offset && byte - offset < getDisplayedBytes(d, columnWidth);

/** Returns the byte at the start of the row containing the given byte. */
export const startOfRowContainingByte = (byte: number, columnWidth: number): number =>
	Math.floor(byte / columnWidth) * columnWidth;

/** Currently displayed byte offset */
export const offset = atom({
	key: "offset",
	default: initialOffset,

	effects_UNSTABLE: [
		fx => {
			let stashedOffset: number | undefined;

			fx.onSet(offset => {
				vscode.setState({ ...vscode.getState(), offset });
			});

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
				const s = fx.getLoadable(columnWidth).getValue();
				fx.setSelf(startOfRowContainingByte(msg.offset, s));
			});
		},
	],
});

/** Current edit mode */
export const editMode = atom({
	key: "editMode",
	default: selector({
		key: "initialEditMode",
		get: ({ get }) => get(readyQuery).editMode,
	}),
	effects_UNSTABLE: [
		fx => {
			registerHandler(MessageType.SetEditMode, msg => {
				fx.setSelf(msg.mode);
			});
		},
	],
});

/** Size of data pages, in bytes */
export const dataPageSize = selector({
	key: "dataPageSize",
	get: ({ get }) => {
		const colWidth = get(columnWidth);
		const pageSize = get(readyQuery).pageSize;
		// Make sure the page size is a multiple of column width, since rendering
		// happens in page chunks.
		return Math.round(pageSize / colWidth) * colWidth;
	},
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
			const windowSize = getDisplayedBytes(get(dimensions), get(columnWidth));
			const offset = get(initialOffset);
			const scrollEnd = get(fileSize) ?? offset + windowSize * 2;

			return new Range(clamp(0, offset - windowSize, scrollEnd - windowSize), scrollEnd);
		},
	}),
});

const initialEdits = selector({
	key: "initialEdits",
	get: ({ get }) => deserializeEdits(get(readyQuery).edits),
});
/**
 * List of edits made locally and not synced with the extension host.
 */
export const edits = atom<readonly HexDocumentEdit[]>({
	key: "edits",
	default: initialEdits,

	effects_UNSTABLE: [
		fx => {
			fx.onSet((newEdits, oldEditsOrDefault) => {
				const oldEdits =
					oldEditsOrDefault instanceof DefaultValue
						? fx.getLoadable(initialEdits).getValue()
						: oldEditsOrDefault;

				if (newEdits.length > oldEdits.length) {
					messageHandler.sendEvent({
						type: MessageType.MakeEdits,
						edits: serializeEdits(newEdits.slice(oldEdits.length)),
					});
				}
			});

			registerHandler(MessageType.SetEdits, msg => {
				const edits = deserializeEdits(msg.edits);
				fx.setSelf(prev =>
					msg.appendOnly ? [...(prev instanceof DefaultValue ? [] : prev), ...edits] : edits,
				);
			});
		},
	],
});

export const unsavedEditIndex = atom({
	key: "unsavedEditIndex",
	default: selector({
		key: "initialUnsavedEditIndex",
		get: ({ get }) => get(readyQuery).unsavedEditIndex,
	}),

	effects_UNSTABLE: [
		fx => {
			registerHandler(MessageType.Saved, msg => {
				fx.setSelf(msg.unsavedEditIndex);
			});
		},
	],
});

/**
 * Timeline of all edits of the document. Includes both saved
 * and unsaved edits.
 */
export const allEditTimeline = selector({
	key: "allEditTimeline",
	get: ({ get }) => buildEditTimeline(get(edits)),
});

export const unsavedEditTimeline = selector({
	key: "unsavedEditTimeline",
	get: ({ get }) => {
		return buildEditTimeline(get(edits).slice(get(unsavedEditIndex)));
	},
});

export const editedDataPages = selectorFamily({
	key: "editedDataPages",
	get:
		(pageNumber: number) =>
		async ({ get }) => {
			const pageSize = get(dataPageSize);
			const { ranges } = get(unsavedEditTimeline);
			const target = new Uint8Array(pageSize);
			const it = readUsingRanges(
				{
					read: (offset, target) => {
						const pageNo = Math.floor(offset / pageSize);
						const page = get(rawDataPages(pageNo));
						const start = offset - pageNo * pageSize;
						const len = Math.min(page.byteLength - start, target.byteLength);
						target.set(page.subarray(start, start + len), 0);
						return Promise.resolve(len);
					},
				},
				ranges,
				pageSize * pageNumber,
				pageSize,
			);

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
	cachePolicy_UNSTABLE: {
		eviction: "lru",
		maxSize: 1024,
	},
});

const rawDataPages = selectorFamily({
	key: "rawDataPages",
	get:
		(pageNumber: number) =>
		async ({ get }) => {
			get(reloadGeneration); // used to trigger invalidation
			get(unsavedEditIndex); // used to trigger invalidation when the user saves
			const pageSize = get(dataPageSize);
			const response = await messageHandler.sendRequest<ReadRangeResponseMessage>({
				type: MessageType.ReadRangeRequest,
				offset: pageSize * pageNumber,
				bytes: pageSize,
			});

			return new Uint8Array(response.data);
		},
	cachePolicy_UNSTABLE: {
		eviction: "lru",
		maxSize: 1024,
	},
});

export const searchResults = atom<SearchResultsWithProgress>({
	key: "searchResults",
	default: {
		results: [],
		progress: 1,
	},
	effects_UNSTABLE: [
		fx => {
			registerHandler(MessageType.SearchProgress, msg => {
				fx.setSelf(prev =>
					prev instanceof DefaultValue
						? msg.data
						: {
								progress: msg.data.progress,
								capped: msg.data.capped,
								results: prev.results.concat(msg.data.results),
							},
				);
			});

			registerHandler(MessageType.ReloadFromDisk, () => {
				fx.setSelf(prev => (prev instanceof DefaultValue ? prev : { ...prev, outdated: true }));
			});
		},
	],
});
