// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { ByteData } from "./byteData";
import { withinAnyRange, generateCharacterRanges } from "./util";
import { arrowKeyNavigate, hover, removeHover, select, changeEndianness, selectByOffset } from "./eventHandlers";
import { chunkHandler, virtualHexDocument, vscode } from "./hexEdit";


/**
 * @description Given a string 0 pads it up unitl the string is of length width
 * @param {string} number The number you want to 0 pad (it's a string as you're 0 padding it to display it, not to do arithmetic) 
 * @param {number} width The length of the final string (if smaller than the string provided nothing happens)
 * @returns {string} The newly padded string
 */
function pad(number: string, width: number): string {
	number = number + "";
	return number.length >= width ? number : new Array(width - number.length + 1).join("0") + number;
}


export interface VirtualizedPacket {
    offset: number;
    data: ByteData;
}

/**
 * @description Handles the presentation layer virtualizing the hex document
 */
export class VirtualDocument {
    private fileSize: number;
    private rowHeight: number;
    private documentHeight: number;
    private hexAddrPadding = NaN;
    private rows: Map<string, HTMLDivElement>[];
    /**
     * @description Constructs a VirtualDocument for a file of a given size. Also handles the initial DOM layout
     * @param {number} fileSize The size, in bytes, of the file which is being displayed
     */
    constructor(fileSize: number) {
        this.fileSize = fileSize;
        // This holds the 3 main columns rows (hexaddr, hexbody, ascii)
        this.rows = [];
        for (let i = 0; i < 3; i++) {
            this.rows.push(new Map<string, HTMLDivElement>());
        }
        // We create a span and place it on the DOM before removing it to get heights and widths of rows to setup layout correctly
        const oldHexHtml = document.getElementById("hexbody")!.innerHTML;
        const oldAsciiHtml = document.getElementById("ascii")!.innerHTML;
        const row = document.createElement("div");
        const asciiRow = document.createElement("div");
        asciiRow.className = "row";
        row.className = "row";
        for (let i = 0; i < 16; i++) {
            const hex_element = document.createElement("span");
            const ascii_element = document.createElement("span");
            hex_element.innerText = "FF";
            ascii_element.innerText = "A";
            asciiRow.appendChild(ascii_element);
            row.appendChild(hex_element);
        }

        row.style.top = "0px";
        asciiRow.style.top = "0px";
        document.getElementById("hexbody")?.appendChild(row);
        document.getElementById("ascii")?.appendChild(asciiRow);
        
        const spans = document.getElementsByTagName("span");
        this.rowHeight = spans[16].offsetHeight;
        // Utilize the fake rows to get the widths of them and alter the widths of the headers etc to fit
        const asciiRowWidth = asciiRow.offsetWidth;
        const hexRowWidth = spans[16].parentElement!.offsetWidth;
        // Calculate document height
        this.documentHeight = Math.ceil(this.fileSize / 16) * this.rowHeight;

        // We set the document back to its original state
        document.getElementById("hexbody")!.innerHTML = oldHexHtml;
        document.getElementById("ascii")!.innerHTML = oldAsciiHtml;

        // Sets the columns heights for sticky scrolling to work
        const columns = document.getElementsByClassName("column") as HTMLCollectionOf<HTMLElement>;
        for (const column of columns) {
            column.style.height = `${this.documentHeight}px`;
        }

        // Due to absolute positioning on the editor position we have to set a lot of sizes ourselves as the elements are not part of the document flow
        const rowWrappers = document.getElementsByClassName("rowwrapper") as HTMLCollectionOf<HTMLDivElement>;
        // Sets the hexaddr column to the same width as its header ( the + 1 is needed to )
        rowWrappers[0].style.width = `${(document.getElementsByClassName("header")[1] as HTMLElement).offsetWidth}px`;
        rowWrappers[0].style.height = `${this.documentHeight}px`;
        // This is the hex section
        (document.getElementsByClassName("header")[2] as HTMLElement).style.width = `${hexRowWidth}px`;
        rowWrappers[1].style.width = `${hexRowWidth}px`;
        rowWrappers[1].style.height = `${this.documentHeight}px`;
        // This is the ascii  section
        (document.getElementsByClassName("header")[3] as HTMLElement).style.width = `${asciiRowWidth}px`;
        rowWrappers[2].style.width = `${asciiRowWidth}px`;
        rowWrappers[2].style.height = `${this.documentHeight}px`;
        
        document.getElementById("endianness")?.addEventListener("change", changeEndianness);

    }

    /**
     * @description Renders the newly provided packets onto the DOM
     * @param {VirtualizedPacket[]} newPackets the packets which will be rendered
     */
    render(newPackets: VirtualizedPacket[]): void {
        let rowData: VirtualizedPacket[] = [];
        // Construct rows of 16 and render them one row at a time
        for (let i = 0; i < newPackets.length; i++) {
            rowData.push(newPackets[i]);
            if (i === newPackets.length - 1 || rowData.length == 16) {
                if (!this.rows[0].get(rowData[0].offset.toString())) {
                    this.populateHexAdresses(rowData);
                    this.populateHexBody(rowData);
                    this.populateAsciiTable(rowData);
                }
                rowData = [];
            }
        }

        if (vscode.getState() && vscode.getState().selected_offset) {
            selectByOffset(vscode.getState().selected_offset);
        }
    }

    /**
     * @description Gets the offset of the packet at the top of the viewport
     * @returns {number} the offset
     */
    public topOffset(): number {
        return (Math.floor(window.scrollY / this.rowHeight) * 16);
    }

    /**
     * @description Retrieves the Y position a given offset is at
     * @param {number} offset The offset to calculate the y position of
     * @returns {number} The Y position the offset is at
     */
    public offsetYPos(offset: number): number {
        return (Math.floor(offset / 16) * this.rowHeight);
    }

    /**
     * @description Gets executed everytime the document is scrolled, this talks to the data layer to request more packets
     */
    scrollHandler(): void {
        // We want to ensure there are at least 2 chunks above us and 4 chunks below us
        // These numbers were chosen arbitrarily under the assumption that scrolling down is more common
        const removedChunks: number[] = chunkHandler.ensureBuffer(virtualHexDocument.topOffset(), {
            topBufferSize: 20,
            bottomBufferSize: 100
        });
        // We remove the chunks from the DOM as the chunk handler is no longer tracking them
        for (const chunk of removedChunks) {
            for (let i = chunk; i < chunk + chunkHandler.chunkSize; i += 16) {
                this.rows[0].get(i.toString())?.remove();
                this.rows[0].delete(i.toString());
                this.rows[1].get(i.toString())?.remove();
                this.rows[1].delete(i.toString());
                this.rows[2].get(i.toString())?.remove();
                this.rows[2].delete(i.toString());
            }
        }
    }

    /**
     * @description Renders the gutter which holds the hex address memory offset
     * @param {VirtualizedPacket[]} rowData An array of 16 bytes representing one row
     */
    private populateHexAdresses(rowData: VirtualizedPacket[]): void {
        const hex_addr = document.getElementById("hexaddr");
        const offset = rowData[0].offset;
        const addr = document.createElement("div");
        addr.className = "row";
        addr.setAttribute("data-offset", offset.toString());
        addr.innerText = pad(offset.toString(16), 8).toUpperCase();
        hex_addr!.appendChild(addr);
        this.rows[0].set(offset.toString(), addr);
        // We only calculate the padding the first time to prevent many reflows
        if (isNaN(this.hexAddrPadding)) {
            this.hexAddrPadding = addr.parentElement!.clientWidth - addr.clientWidth;
        }
        // We add a left px offset to effectively right align the column
        addr.style.left = `${this.hexAddrPadding}px`;
        this.translateRow(addr, offset);
    }

    /**
     * @description Renders the decoded text section
     * @param {VirtualizedPacket[]} rowData An array of 16 bytes representing one row
     */
    private populateAsciiTable(rowData: VirtualizedPacket[]): void {
        const ascii_table = document.getElementById("ascii");
        const row = document.createElement("div");
        row.className = "row";
        const rowOffset = rowData[0].offset.toString();
        for (let i = 0; i < rowData.length; i++) {
            const ascii_element = document.createElement("span");
            ascii_element.setAttribute("data-offset", rowData[i].offset.toString());
            // If it's some sort of character we cannot render we just represent it as a period with the nographic class
            if (withinAnyRange(rowData[i].data.to8bitUInt(), generateCharacterRanges())) {
                ascii_element.classList.add("nongraphic");
                ascii_element.innerText = ".";
            } else {
                const ascii_char = String.fromCharCode(rowData[i].data.to8bitUInt());
                ascii_element.innerText = ascii_char;
            }
            ascii_element.tabIndex = -1;
            ascii_element.addEventListener("keydown", arrowKeyNavigate);
            ascii_element.addEventListener("mouseover", hover);
            ascii_element.addEventListener("mouseleave", removeHover);
            ascii_element.addEventListener("click", select);
            row.appendChild(ascii_element);
        }
        ascii_table?.appendChild(row);
        this.rows[2].set(rowOffset, row);
        this.translateRow(row, parseInt(rowOffset));
    }

    /**
     * @description Renders the decoded text section
     * @param {VirtualizedPacket[]} rowData An array of 16 bytes representing one row
     */
    private populateHexBody(rowData: VirtualizedPacket[]): void {
        const hex_body = document.getElementById("hexbody");
        const row = document.createElement("div");
        row.className = "row";
        const rowOffset = rowData[0].offset.toString();
        for (let i = 0; i < rowData.length; i++) {
            const hex_element = document.createElement("span");
            hex_element.setAttribute("data-offset", rowData[i].offset.toString());
            hex_element.innerText = pad(rowData[i].data.toHex(), 2);
            hex_element.tabIndex = -1;
            hex_element.addEventListener("mouseover", hover);
            hex_element.addEventListener("mouseleave", removeHover);
            hex_element.addEventListener("click", select);
            hex_element.addEventListener("keydown", arrowKeyNavigate);
            row.appendChild(hex_element);
        }
        hex_body?.appendChild(row);
        this.rows[1].set(rowOffset, row);
        this.translateRow(row, parseInt(rowOffset));
    }

    /**
     * @description Moves the rows from where they were placed to where they are supposed to be (this is due to absolute positioning)
     * @param {HTMLDivElement} row  The DivElement which needs to be moved
     * @param {number} offset The offset of the element at the beginning of the row
     */
    private translateRow(row: HTMLDivElement, offset: number): void {
        // Get the expected Y value
        const expectedY = this.offsetYPos(offset);
        row.style.top = `${expectedY}px`;
    }
}