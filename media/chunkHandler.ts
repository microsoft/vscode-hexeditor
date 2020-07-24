// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { virtualHexDocument, messageHandler } from "./hexEdit";
import { VirtualizedPacket } from "./virtualDocument";
import { ByteData } from "./byteData";
import { EditMessage } from "./editHandler";

/**
 * @description BufferOptions type used to describe how many chunks are wanted above and below a given chunk 
 */
export type BufferOptions =  {
    topBufferSize: number;
    bottomBufferSize: number;
}
/**
 * @description A chunkhandler which holds the chunks and handles requesting new ones
 */
export class ChunkHandler {
    private chunks: Set<number>;
    private _chunkSize: number
    /**
     * @description Constructs a chunk handler which handles chunks of size chunkSize
     * @param {number} chunkSize The size of the chunks which the chunkhandler holds
     */
    constructor (chunkSize: number) {
        this.chunks = new Set<number>();
        this._chunkSize = chunkSize;
    }

    /**
     * @description Returns the size of a chunk in the chunk handler
     * @returns {number} the size of a chunk
     */
    public get chunkSize(): number {
        return this._chunkSize;
    }

    /**
     * @description Whether or not a chunk holding the offset is being tracked by the chunkhandler
     * @param {number} offset The offset to check against
     * @returns {boolean} whether or not a chunk containing that offset is being tracked
     */
    public hasChunk(offset: number): boolean {
        const chunkStart = this.retrieveChunkStart(offset);
        return this.chunks.has(chunkStart);
    }
    
    /**
     * @description Sends a request to the extension for the packets which would make up the requested chunks
     * @param {number} chunkStart The start of the chunk which you're requesting
     */
    public async requestMoreChunks(chunkStart: number): Promise<void> {
        // If the chunk start is above the document size we know it will not give us anything back so we don't do anything
        if (chunkStart >= virtualHexDocument.documentSize && chunkStart !== 0) return;
        // Requests the chunks from the extension
        try {
            const request = await messageHandler.postMessageWithResponse("packet", {
                initialOffset: chunkStart,
                numElements: this.chunkSize
            });
            this.processChunks(request.offset, request.data, request.edits, request.fileSize);
        } catch (err) {
            return;
        }
    }

    /**
     * @description Given an offset tells you which offset begins it chunks
     * @param {number} offset The offset which you want to know the chunk start of
     * @returns {number} The chunk start of the provided offset
     */
    public retrieveChunkStart(offset: number): number {
        return Math.floor(offset / this.chunkSize) * this.chunkSize;
    }

    /**
     * @description Called by the virtualDocument to ensure there is bufferSize chunks above and below the offset provided
     * @param {number} offset The offset given to check the buffer around
     * @param {BufferOptions} bufferOpts The options describing how many chunks above and below the given offset you want
     * @returns {Promise<{removed: number[]; requested: Promise<void[]>}>} A promise with an array of removed chunk starts and a promise which is awaiting the requested chunks
     */
    public async ensureBuffer(offset: number, bufferOpts: BufferOptions): Promise<{removed: number[]; requested: Promise<void[]>}> {
        const chunksToRequest: Set<number> = new Set<number>();
        const chunkStart = this.retrieveChunkStart(offset);

        // If it doesn't have even the starting chunk it means we must have scrolled far outside the viewport and will need to requet starting chunk
        // We can add this everytime since we compute a set difference later it will be removed
        chunksToRequest.add(chunkStart);
        // Get the offsets of the chunks that would make up the buffers
        for (let i = 1; i <= bufferOpts.topBufferSize; i++ ) {
            chunksToRequest.add(Math.max(0, chunkStart - (i * this.chunkSize)));
        }
        for (let i = 1; i <= bufferOpts.bottomBufferSize; i++ ) {
            chunksToRequest.add(chunkStart + (i * this.chunkSize));
        }
        // We don't request chunks we already have so we filter them out here
        const chunksToRequestArr: number[] = [...chunksToRequest].filter(x => !this.chunks.has(x));
        //If it's inside the buffer (which the chunksToRequest set holds) then we keep it, else it's deleted
        const chunksOutsideBuffer: number[] = [...this.chunks].filter(x => !chunksToRequest.has(x));
        
        // We stop tracking the old chunks and we request the new ones
        chunksOutsideBuffer.forEach(chunk => this.removeChunk(chunk));
        const requested: Promise<void>[] = [];
        chunksToRequestArr.forEach(chunkOffset => requested.push(this.requestMoreChunks(chunkOffset)));
        const result = {
            removed: chunksOutsideBuffer,
            requested: Promise.all(requested)
        };
        return result;
    }

    /**
     * @description Handles the incoming chunks from the extension (this gets called by the message handler)
     * @param {number} offset The offset which was requestd
     * @param {Uint8Array} data The data which was returned back
     * @param {number} fileSize The size of the file, this is passed back from the exthost and helps to ensure the webview and exthost sizes are synced
     */
    public processChunks(offset: number, data: Uint8Array, edits: EditMessage[], fileSize: number): void {
        const packets: VirtualizedPacket[] = [];
        for (let i = 0; i < data.length; i++) {
            // If it's a chunk boundary we want to make sure we're tracking that chunk
            if ((i + offset ) % this.chunkSize === 0) {
                this.addChunk(i + offset);
            }
            packets.push({
                offset: i + offset,
                data: new ByteData(data[i])
            });
            // At the very end we want the plus cell, so we add a dummy packet that is greater than the filesize
            if (i + offset + 1 === virtualHexDocument.documentSize) {
                packets.push({
                    offset: i + offset + 1,
                    data: new ByteData(0)
                });
            }
        }
        // If it's an empty file we just send over the dummy packet for the plus cell
        if (data.length === 0 && fileSize === 0) {
            packets.push({
                offset: 0,
                data: new ByteData(0)
            });
        }
        virtualHexDocument.render(packets);
        virtualHexDocument.redo(edits, fileSize);
    }
     
    /**
     * @description Adds a chunk with the given chunk offset to the handler
     * @param {number} offset The offset which holds the chunk start 
     */
    public addChunk(offset: number): void {
        this.chunks.add(offset);
    }

    /**
     * @description Deletes a chunk with the given chunk offset to the handler
     * @param {number} offset The offset which holds the chunk start 
     */
    public removeChunk(offset: number): void {
        this.chunks.delete(offset);
    }

    /**
     * @description Getter for all the chunks in the chunk handler
     * @returns {Set<numer>} the starting offsets of all the chunks being tracked
     */
    public get allChunks(): Set<number> {
        return this.chunks;
    }
}