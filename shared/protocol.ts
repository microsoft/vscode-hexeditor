/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ISerializedEdits } from "./serialization";

export const enum MessageType {
	//#region to webview
	ReadyResponse,
	ReadRangeResponse,
	SearchProgress,
	SetEdits,
	Saved,
	ReloadFromDisk,
	StashDisplayedOffset,
	GoToOffset,
	SetFocusedByte,
	SetFocusedByteRange,
	SetSelectedCount,
	PopDisplayedOffset,
	DeleteAccepted,
	//#endregion
	//#region from webview
	ReadyRequest,
	OpenDocument,
	ReadRangeRequest,
	MakeEdits,
	RequestDeletes,
	SearchRequest,
	CancelSearch,
	ClearDataInspector,
	SetInspectByte,
	UpdateEditorSettings,
	DoPaste,
	DoCopy,
	//#endregion
}

export interface WebviewMessage<T> {
	messageId: number;
	inReplyTo?: number;
	body: T;
}

export const enum Endianness {
	Big = "big",
	Little = "little",
}

export const enum InspectorLocation {
	Hover = "hover",
	Aside = "aside",
	Sidebar = "sidebar",
}

export interface IEditorSettings {
	showDecodedText: boolean;
	columnWidth: number;
	inspectorType: InspectorLocation;
	defaultEndianness: Endianness;
}

export interface ICodeSettings {
	scrollBeyondLastLine: boolean;
}

export interface ReadyResponseMessage {
	type: MessageType.ReadyResponse;
	initialOffset: number;
	pageSize: number;
	edits: ISerializedEdits;
	editorSettings: IEditorSettings;
	codeSettings: ICodeSettings;
	unsavedEditIndex: number;
	fileSize: number | undefined;
	isReadonly: boolean;
	isLargeFile: boolean;
}

export interface ReadRangeResponseMessage {
	type: MessageType.ReadRangeResponse;
	data: ArrayBuffer;
}

export interface SearchResult {
	from: number;
	to: number;
	previous: Uint8Array;
}

export interface SearchResultsWithProgress {
	results: SearchResult[];
	progress: number;
	capped?: boolean;
	outdated?: boolean;
}

export interface SearchProgressMessage {
	type: MessageType.SearchProgress;
	data: SearchResultsWithProgress;
}

/** Notifies the document is saved, any pending edits should be flushed */
export interface SavedMessage {
	type: MessageType.Saved;
	unsavedEditIndex: number;
}

/** Notifies that the underlying file is changed. Webview should throw away and re-request state. */
export interface ReloadMessage {
	type: MessageType.ReloadFromDisk;
}

/** Sets the edits that should be applied to the document */
export interface SetEditsMessage {
	type: MessageType.SetEdits;
	edits: ISerializedEdits;
	replaceFileSize?: number | null;
	appendOnly?: boolean;
}

/** Sets the displayed offset. */
export interface GoToOffsetMessage {
	type: MessageType.GoToOffset;
	offset: number;
}

/** Focuses a byte in the editor. */
export interface SetFocusedByteMessage {
	type: MessageType.SetFocusedByte;
	offset: number;
}

/** Focuses a byte range in the editor. */
export interface SetFocusedByteRangeMessage {
	type: MessageType.SetFocusedByteRange;
	startingOffset: number;
	endingOffset: number;
}

/** sets the count of selected bytes. */
export interface SetSelectedCountMessage {
	type: MessageType.SetSelectedCount;
	selected: number;
	focused?: number;
}

/** Saves the current offset shown in the editor. */
export interface StashDisplayedOffsetMessage {
	type: MessageType.StashDisplayedOffset;
}

/** Restored a stashed offset. */
export interface PopDisplayedOffsetMessage {
	type: MessageType.PopDisplayedOffset;
}

/** Acks a deletion request. */
export interface DeleteAcceptedMessage {
	type: MessageType.DeleteAccepted;
}

export type ToWebviewMessage =
	| ReadyResponseMessage
	| ReadRangeResponseMessage
	| SearchProgressMessage
	| SavedMessage
	| ReloadMessage
	| GoToOffsetMessage
	| SetEditsMessage
	| SetFocusedByteMessage
	| SetFocusedByteRangeMessage
	| PopDisplayedOffsetMessage
	| StashDisplayedOffsetMessage
	| DeleteAcceptedMessage;

export interface OpenDocumentMessage {
	type: MessageType.OpenDocument;
}

export interface ReadRangeMessage {
	type: MessageType.ReadRangeRequest;
	offset: number;
	bytes: number;
}

export interface MakeEditsMessage {
	type: MessageType.MakeEdits;
	edits: ISerializedEdits;
}

export type LiteralSearchQuery = { literal: (Uint8Array | "*")[] };

export type RegExpSearchQuery = { re: string };

export interface SearchRequestMessage {
	type: MessageType.SearchRequest;
	query: LiteralSearchQuery | RegExpSearchQuery;
	cap: number | undefined;
	caseSensitive: boolean;
}

export interface CancelSearchMessage {
	type: MessageType.CancelSearch;
}

export interface ClearDataInspectorMessage {
	type: MessageType.ClearDataInspector;
}

export interface SetInspectByteMessage {
	type: MessageType.SetInspectByte;
	offset: number;
}

export interface ReadyRequestMessage {
	type: MessageType.ReadyRequest;
}

export interface UpdateEditorSettings {
	type: MessageType.UpdateEditorSettings;
	editorSettings: IEditorSettings;
}

export const enum PasteMode {
	Insert = "insert",
	Replace = "replace",
}

export interface PasteMessage {
	type: MessageType.DoPaste;
	offset: number;
	data: Uint8Array;
	mode: PasteMode;
}

export interface CopyMessage {
	type: MessageType.DoCopy;
	selections: [from: number, to: number][];
	asText: boolean;
}

export interface RequestDeletesMessage {
	type: MessageType.RequestDeletes;
	deletes: { start: number; end: number }[];
}

export type FromWebviewMessage =
	| OpenDocumentMessage
	| ReadRangeMessage
	| MakeEditsMessage
	| SearchRequestMessage
	| CancelSearchMessage
	| ClearDataInspectorMessage
	| SetInspectByteMessage
	| SetSelectedCountMessage
	| ReadyRequestMessage
	| UpdateEditorSettings
	| PasteMessage
	| CopyMessage
	| RequestDeletesMessage;

export type ExtensionHostMessageHandler = MessageHandler<ToWebviewMessage, FromWebviewMessage>;
export type WebviewMessageHandler = MessageHandler<FromWebviewMessage, ToWebviewMessage>;

/**
 * Helper for postMessage-based RPC.
 */
export class MessageHandler<TTo, TFrom> {
	private messageIdCounter = 0;
	private readonly pendingMessages = new Map<
		number,
		{ resolve: (msg: TFrom) => void; reject: (err: Error) => void }
	>();

	constructor(
		public messageHandler: (msg: TFrom) => Promise<TTo | undefined>,
		private readonly postMessage: (msg: WebviewMessage<TTo>) => void,
	) {}

	/** Sends a request without waiting for a response */
	public sendEvent(body: TTo): void {
		this.postMessage({ body, messageId: this.messageIdCounter++ });
	}

	/** Sends a request that expects a response */
	public sendRequest<TResponse extends TFrom>(msg: TTo): Promise<TResponse> {
		const id = this.messageIdCounter++;
		this.postMessage({ body: msg, messageId: id });
		return new Promise<TResponse>((resolve, reject) => {
			this.pendingMessages.set(id, { resolve: resolve as (msg: TFrom) => void, reject });
		});
	}

	/** Sends a reply in response to a previous request */
	private sendReply(inReplyTo: WebviewMessage<TFrom>, reply: TTo): void {
		this.postMessage({
			body: reply,
			messageId: this.messageIdCounter++,
			inReplyTo: inReplyTo.messageId,
		});
	}

	/** Should be called when a postMessage is received */
	public handleMessage(message: WebviewMessage<TFrom>): void {
		if (message.inReplyTo !== undefined) {
			this.pendingMessages.get(message.inReplyTo)?.resolve(message.body);
			this.pendingMessages.delete(message.inReplyTo);
		} else {
			Promise.resolve(this.messageHandler(message.body)).then(
				reply => reply && this.sendReply(message, reply),
			);
		}
	}
}
