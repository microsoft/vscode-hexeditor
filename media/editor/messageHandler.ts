// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { vscode } from "./hexEdit";

/**
 * Class which handles messages between the webview and the exthost
 */
export class MessageHandler {
    private maxRequests: number;
    private requestsMap: Map<number, {resolve: (value?: any) => void; reject: (reason?: any) => void}>;
    private requestId: number;
    /**
     * @description Creates a new MessageHandler
     * @param maximumRequests The maximum number of requests 
     */
    constructor(maximumRequests: number) {
        this.maxRequests = maximumRequests;
        this.requestsMap = new Map<number, {resolve: (value?: any) => void; reject: (reason?: any) => void}>();
        this.requestId = 0;
    }
    
    /**
     * @description Posts to the extension host a message and returns a promise which if successful will resolve to the response
     * @param {string} type A string defining the type of message so it can be correctly handled on both ends
     * @param {any} body The payload
     * @returns {Promise<any>} A promise which resolves to the response or rejects if the request times out
     */
    async postMessageWithResponse(type: string, body?: any): Promise<any> {
        const promise = new Promise<any>((resolve, reject) => this.requestsMap.set(this.requestId, { resolve, reject }));
        // We remove the oldest request if the current request queue is full
        // This doesn't stop the request on the Ext host side, but it will be dropped when it's received, which lessens the load on the webview
        if (this.requestsMap.size > this.maxRequests) {
            const removed: number = this.requestsMap.keys().next().value;
            this.requestsMap.get(removed)?.reject("Request Timed out");
            this.requestsMap.delete(removed);
        }
        vscode.postMessage({ requestId: this.requestId++, type, body });
        return promise;
    }
    
    /**
     * @description Post to the extension host as a message in a fire and forget manner, not expecting a response
     * @param {string} type A string defining the type of message so it can be correctly handled on both ends
     * @param {any} body The payload
     */
    postMessage(type: string, body?: any): void {
        vscode.postMessage({ type, body });
    }
    
    /**
     * @description For every incoming message that isn't the init
     * @param message The message received
     */
    incomingMessageHandler(message: any): void {
        const request = this.requestsMap.get(message.requestId);
        // We should never get a rogue response from the webview unless it's an init.
        // So if the message isn't being tracked by the message handler, we drop it
        if (!request) return;
        request.resolve(message.body);
        this.requestsMap.delete(message.requestId);
    }
}