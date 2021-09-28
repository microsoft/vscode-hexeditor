/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { HexDocumentEdit } from "./hexDocumentModel";
import { SearchOptions, SearchResults } from "./search";

export const enum MessageType {
	//#region to webview
	ReadyResponse,
	ReadRangeResponse,
	SearchResponse,
	ReplaceResponse,
	Saved,
	Changed,
	//#endregion
	//#region from webview
	ReadyRequest,
	OpenDocument,
	ReadRangeRequest,
	MakeEdits,
	SearchRequest,
	ReplaceRequest,
	CancelSearch,
	DataInspector,
	//#endregion
}

export interface WebviewMessage<T> {
	messageId: number;
	inReplyTo?: number;
	body: T;
}

export interface ReadyResponseMessage {
	type: MessageType.ReadyResponse;
	initialOffset: number;
	fileSize: number | undefined;
	isLargeFile: boolean;
}

export interface ReadRangeResponseMessage {
	type: MessageType.ReadRangeResponse;
	data: ArrayBuffer;
}

export interface SearchResponseMessage {
	type: MessageType.SearchResponse;
	results: SearchResults;
}

export interface ReplaceResponseMessage {
	type: MessageType.ReplaceResponse;
	edits: HexDocumentEdit[];
}

/** Notifies the document is saved, any pending edits should be flushed */
export interface SavedMessage {
	type: MessageType.Saved;
}

/** Notifies that the underlying file is changed. Webview should throw away and re-request state. */
export interface ChangedMessage {
	type: MessageType.Changed;
}

export type ToWebviewMessage =
	| ReadyResponseMessage
	| ReadRangeResponseMessage
	| SearchResponseMessage
	| ReplaceResponseMessage
	| SavedMessage
	| ChangedMessage;

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
	edits: HexDocumentEdit[];
}

export interface SearchRequestMessage {
	type: MessageType.SearchRequest;
	searchType: "ascii" | "hex";
	query: string;
	options: SearchOptions;
}

export interface ReplaceRequestMessage {
	type: MessageType.ReplaceRequest;
	query: number[];
	offsets: number[][];
	preserveCase: boolean;
}

export interface CancelSearchMessage {
	type: MessageType.CancelSearch;
}

export interface DataInspectorMessage {
	type: MessageType.DataInspector;
	body: unknown;
}

export interface ReadyRequestMessage {
	type: MessageType.ReadyRequest;
}

export type FromWebviewMessage =
	| OpenDocumentMessage
	| ReadRangeMessage
	| MakeEditsMessage
	| SearchRequestMessage
	| CancelSearchMessage
	| DataInspectorMessage
	| ReplaceRequestMessage
	| ReadyRequestMessage;

export type ExtensionHostMessageHandler = MessageHandler<ToWebviewMessage, FromWebviewMessage>;
export type WebviewMessageHandler = MessageHandler<FromWebviewMessage, ToWebviewMessage>;

/**
 * Helper for postMessage-based RPC.
 */
export class MessageHandler<TTo, TFrom> {
	private messageIdCounter = 0;
	private readonly pendingMessages = new Map<number, { resolve: (msg: TFrom) => void, reject: (err: Error) => void }>();

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
		this.postMessage({ body: reply, messageId: this.messageIdCounter++, inReplyTo: inReplyTo.messageId });
	}

	/** Should be called when a postMessage is received */
	public handleMessage(message: WebviewMessage<TFrom>): void {
		if (message.inReplyTo !== undefined) {
			this.pendingMessages.get(message.inReplyTo)?.resolve(message.body);
			this.pendingMessages.delete(message.inReplyTo);
		} else {
			Promise.resolve(this.messageHandler(message.body)).then(reply => reply && this.sendReply(message, reply));
		}
	}
}
