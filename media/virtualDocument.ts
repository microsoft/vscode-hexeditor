// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { ByteData } from "./byteData";
import { getElementsWithGivenOffset, updateAsciiValue, pad, createOffsetRange, retrieveSelectedByteObject } from "./util";
import { hover, removeHover, changeEndianness } from "./eventHandlers";
import { chunkHandler, virtualHexDocument } from "./hexEdit";
import { ScrollBarHandler } from "./srollBarHandler";
import { EditHandler, EditMessage } from "./editHandler";
import { WebViewStateManager } from "./webviewStateManager";
import { SelectHandler } from "./selectHandler";
import { SearchHandler } from "./searchHandler";
import { populateDataInspector } from "./dataInspector";

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
    public readonly documentHeight: number;
    private viewPortHeight!: number
    private hexAddrPadding: number;
    private readonly scrollBarHandler: ScrollBarHandler;
    private readonly editHandler: EditHandler;
    private readonly selectHandler: SelectHandler;
    private readonly searchHandler: SearchHandler;
    private rows: Map<string, HTMLDivElement>[];
    private readonly editorContainer: HTMLElement;

    /**
     * @description Constructs a VirtualDocument for a file of a given size. Also handles the initial DOM layout
     * @param {number} fileSize The size, in bytes, of the file which is being displayed
     */
    constructor(fileSize: number) {
        this.fileSize = fileSize;
        this.editHandler = new EditHandler();
        this.selectHandler = new SelectHandler();
        this.searchHandler = new SearchHandler();
        // This holds the 3 main columns rows (hexaddr, hexbody, ascii)
        this.rows = [];
        for (let i = 0; i < 3; i++) {
            this.rows.push(new Map<string, HTMLDivElement>());
        }
        // We create elements and place them on the DOM before removing them to get heights and widths of rows to setup layout correctly
        const ascii = document.getElementById("ascii")!;
        const hex = document.getElementById("hexbody")!;
        const hexaddr = document.getElementById("hexaddr")!;
        const oldHexAddrHtml = hexaddr.innerHTML;
        const oldHexHtml = hex.innerHTML;
        const oldAsciiHtml = ascii.innerHTML;
        // We have to set the ascii columns width to be large before appending the ascii or else it wraps and messes up the width calculation
        // This is a change in the next gen layout engine
        ascii.style.width = "500px";
        const row = document.createElement("div");
        const asciiRow = document.createElement("div");
        const hexAddrRow = document.createElement("div");
        hexAddrRow.className = "row";
        asciiRow.className = "row";
        row.className = "row";
        // For ascii we want to test more than just one character as sometimes that doesn't set the width correctly
        const asciiTestString = "Testing String!!";
        for (let i = 0; i < 16; i++) {
            const hex_element = document.createElement("span");
            const ascii_element = document.createElement("span");
            hex_element.innerText = "FF";
            ascii_element.innerText = asciiTestString[i];
            asciiRow.appendChild(ascii_element);
            row.appendChild(hex_element);
        }
        hexAddrRow.innerText = "00000000";
        row.style.top = "0px";
        asciiRow.style.top = "0px";
        hex.appendChild(row);
        hexaddr.appendChild(hexAddrRow);
        ascii.appendChild(asciiRow);

        const spans = document.getElementsByTagName("span");
        this.rowHeight = spans[16].offsetHeight;
        // Utilize the fake rows to get the widths of them and alter the widths of the headers etc to fit
        // The plus one is because the new layout engine in chrome would wrap the text otherwise which I'm unsure why
        const asciiRowWidth = asciiRow.offsetWidth + 1;
        const hexRowWidth = spans[16].parentElement!.offsetWidth;
        // Calculate document height, we max out at 500k due to browser limitations on large div
        this.documentHeight = 500000;
        // Calculate the padding needed to make the offset column right aligned
        this.hexAddrPadding = hexAddrRow.parentElement!.clientWidth - hexAddrRow.clientWidth;


        // We set the document back to its original state
        hex.innerHTML = oldHexHtml;
        ascii.innerHTML = oldAsciiHtml;
        hexaddr.innerHTML = oldHexAddrHtml;

        // Sets the columns heights for sticky scrolling to work
        const columns = document.getElementsByClassName("column") as HTMLCollectionOf<HTMLElement>;
        for (const column of columns) {
            column.style.height = `${this.documentHeight}px`;
        }

        // Due to absolute positioning on the editor position we have to set a lot of sizes ourselves as the elements are not part of the document flow
        const rowWrappers = document.getElementsByClassName("rowwrapper") as HTMLCollectionOf<HTMLDivElement>;
        // Sets the hexaddr column to the same width as its header ( the + 1 is needed to )
        rowWrappers[0].style.width = `${(document.getElementsByClassName("header")[0] as HTMLElement).offsetWidth}px`;
        // We remove the text from the header to make it look like it's not there
        const headerHeight = (document.getElementsByClassName("header")[0] as HTMLElement).offsetHeight;
        (document.getElementsByClassName("header")[0] as HTMLElement).innerText = "";
        (document.getElementsByClassName("header")[0] as HTMLElement).style.width = `${rowWrappers[0].style.width}px`;
        // The plus one is to account for all other headers having borders
        (document.getElementsByClassName("header")[0] as HTMLElement).style.height = `${headerHeight + 1}px`;
        rowWrappers[0].style.height = `${this.documentHeight}px`;
        // This is the hex section
        (document.getElementsByClassName("header")[1] as HTMLElement).style.width = `${hexRowWidth}px`;
        rowWrappers[1].style.width = `${hexRowWidth}px`;
        rowWrappers[1].style.height = `${this.documentHeight}px`;
        // This is the ascii  section
        (document.getElementsByClassName("header")[2] as HTMLElement).style.width = `${asciiRowWidth}px`;
        rowWrappers[2].style.width = `${asciiRowWidth}px`;
        rowWrappers[2].style.height = `${this.documentHeight}px`;

        // Creates the scrollBar Handler
        this.scrollBarHandler = new ScrollBarHandler("scrollbar", this.fileSize / 16, this.rowHeight);
        // Intializes a few things such as viewport size and the scrollbar positions
        this.documentResize();

        this.editorContainer = document.getElementById("editor-container")!;
        // Bind the event listeners
        // Will need to refactor this section soon as its getting pretty messy
        document.getElementById("endianness")?.addEventListener("change", changeEndianness);
        this.editorContainer.addEventListener("keydown", this.keyBoardHandler.bind(this));
        this.editorContainer.addEventListener("mouseover", hover);
        this.editorContainer.addEventListener("mouseleave", removeHover);

        // Event handles to handle when the user drags to create a selection
        this.editorContainer.addEventListener("click", this.clickHandler.bind(this));
        this.editorContainer.addEventListener("mousedown", this.mouseDownHandler.bind(this));

        window.addEventListener("copy", (event: Event) => {
            if (document.activeElement?.classList.contains("hex") || document.activeElement?.classList.contains("ascii")) {
                this.editHandler.copy(event as ClipboardEvent);
            }
        });
        window.addEventListener("paste", (event: Event) => {
            if (document.activeElement?.classList.contains("hex") || document.activeElement?.classList.contains("ascii")) {
                this.editHandler.paste(event as ClipboardEvent);
            }
        });
        window.addEventListener("resize", this.documentResize.bind(this));
        window.addEventListener("keydown", this.keyBoardScroller.bind(this));
    }

    /**
     * @description Renders the newly provided packets onto the DOM
     * @param {VirtualizedPacket[]} newPackets the packets which will be rendered
     */
    public render(newPackets: VirtualizedPacket[]): void {
        let rowData: VirtualizedPacket[] = [];
        const addrFragment = document.createDocumentFragment();
        const hexFragment = document.createDocumentFragment();
        const asciiFragment = document.createDocumentFragment();
        // Construct rows of 16 and add them to the associated fragments
        for (let i = 0; i < newPackets.length; i++) {
            rowData.push(newPackets[i]);
            if (i === newPackets.length - 1 || rowData.length == 16) {
                if (!this.rows[0].get(rowData[0].offset.toString())) {
                    this.populateHexAdresses(addrFragment, rowData);
                    this.populateHexBody(hexFragment, rowData);
                    this.populateAsciiTable(asciiFragment, rowData);
                }
                rowData = [];
            }
        }

        // Render the fragments to the DOM
        document.getElementById("hexaddr")?.appendChild(addrFragment);
        document.getElementById("hexbody")?.appendChild(hexFragment);
        document.getElementById("ascii")?.appendChild(asciiFragment);

        if (WebViewStateManager.getState()) {
            const selectedOffsets = this.selectHandler.getSelected();
            if (selectedOffsets.length > 0) {
                this.selectHandler.setSelected(selectedOffsets, selectedOffsets[0], true);
            }
            // This isn't the best place for this, but it can't go in the constructor due to the document not being instantiated yet
            // This ensures that the srollTop is the same as in the state object, should only be out of sync on initial webview load
            const savedScrollTop = WebViewStateManager.getState().scroll_top;
            if (savedScrollTop && savedScrollTop !== this.scrollBarHandler.virtualScrollTop) {
                this.scrollBarHandler.resyncScrollPosition();
            }
        }
    }

    /**
     * @description Event handler which is called everytime the viewport is resized
     */
    private documentResize(): void {
        this.viewPortHeight = document.documentElement.clientHeight;
        if (this.scrollBarHandler) {
            this.scrollBarHandler.updateScrollBar(this.fileSize / 16);
        }
    }

    /**
     * @description Gets the offset of the packet at the top of the viewport
     * @returns {number} the offset
     */
    public topOffset(): number {
        return (Math.floor(this.scrollBarHandler.virtualScrollTop / this.rowHeight) * 16);
    }

    /**
     * @description Retrieves the Y position a given offset is at
     * @param {number} offset The offset to calculate the y position of
     * @returns {number} The Y position the offset is at
     */
    public offsetYPos(offset: number): number {
        return (Math.floor(offset / 16) * this.rowHeight) % this.documentHeight;
    }

    /**
     * @description Gets executed everytime the document is scrolled, this talks to the data layer to request more packets
     */
    public async scrollHandler(): Promise<void[]> {
        // We want to ensure there are at least 2 chunks above us and 4 chunks below us
        // These numbers were chosen arbitrarily under the assumption that scrolling down is more common
        const chunkHandlerResponse = await chunkHandler.ensureBuffer(virtualHexDocument.topOffset(), {
            topBufferSize: 2,
            bottomBufferSize: 4
        });
        const removedChunks: number[] = chunkHandlerResponse.removed;
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
        return chunkHandlerResponse.requested;
    }

    /**
     * @description Renders the gutter which holds the hex address memory offset
     * @param {DocumentFragment} fragment The fragment which elements get added to
     * @param {VirtualizedPacket[]} rowData An array of 16 bytes representing one row
     */
    private populateHexAdresses(fragment: DocumentFragment, rowData: VirtualizedPacket[]): void {
        const offset = rowData[0].offset;
        const addr = document.createElement("div");
        addr.className = "row";
        addr.setAttribute("data-offset", offset.toString());
        addr.innerText = pad(offset.toString(16), 8).toUpperCase();
        fragment.appendChild(addr);
        this.rows[0].set(offset.toString(), addr);
        // We add a left px offset to effectively right align the column
        addr.style.left = `${this.hexAddrPadding}px`;
        this.translateRow(addr, offset);
    }

    /**
     * @description Renders the decoded text section
     * @param {DocumentFragment} fragment The fragment which elements get added to
     * @param {VirtualizedPacket[]} rowData An array of 16 bytes representing one row
     */
    private populateAsciiTable(fragment: DocumentFragment, rowData: VirtualizedPacket[]): void {
        const row = document.createElement("div");
        row.className = "row";
        const rowOffset = rowData[0].offset.toString();
        for (let i = 0; i < rowData.length; i++) {
            const ascii_element = this.createAsciiElement(rowData[i]);
            row.appendChild(ascii_element);
        }
        fragment.appendChild(row);
        this.rows[2].set(rowOffset, row);
        this.translateRow(row, parseInt(rowOffset));
    }

    /**
     * @description Renders the decoded text section
     * @param {DocumentFragment} fragment The fragment which elements get added to
     * @param {VirtualizedPacket[]} rowData An array of 16 bytes representing one row
     */
    private populateHexBody(fragment: DocumentFragment, rowData: VirtualizedPacket[]): void {
        const row = document.createElement("div");
        row.className = "row";
        const rowOffset = rowData[0].offset.toString();
        for (let i = 0; i < rowData.length; i++) {
            const hex_element = this.createHexElement(rowData[i]);
            row.appendChild(hex_element);
        }
        fragment.appendChild(row);
        this.rows[1].set(rowOffset, row);
        this.translateRow(row, parseInt(rowOffset));
    }

    /**
     * @description Creates a single hex span element from a packet
     * @param {VirtualizedPacket} packet The VirtualizedPacket holding the data needed to generate the element
     * @returns {HTMLSpanElement} The html span element ready to be added to the DOM
     */
    private createHexElement(packet: VirtualizedPacket): HTMLSpanElement {
        const hex_element = document.createElement("span");
        hex_element.classList.add("hex");
        hex_element.setAttribute("data-offset", packet.offset.toString());
        // If the offset is greater than or equal to fileSize that's our placeholder so it's just a + symbol to signal you can type and add bytes there
        if (packet.offset < this.fileSize) {
            hex_element.innerText = pad(packet.data.toHex(), 2);
        } else {
            hex_element.classList.add("add-cell");
            hex_element.innerText = "+";
        }
        hex_element.tabIndex = -1;
        hex_element.addEventListener("mouseleave", removeHover);
        return hex_element;
    }

    /**
     * @description Creates a single ascii span element from a packet
     * @param {VirtualizedPacket} packet The VirtualizedPacket holding the data needed to generate the element
     * @returns {HTMLSpanElement} The html span element ready to be added to the DOM
     */
    private createAsciiElement(packet: VirtualizedPacket): HTMLSpanElement {
        const ascii_element = document.createElement("span");
        ascii_element.setAttribute("data-offset", packet.offset.toString());
        ascii_element.classList.add("ascii");
        // If the offset is greater than or equal to fileSize that's our placeholder so it's just a + symbol to signal you can type and add bytes there
        if (packet.offset < this.fileSize) {
            updateAsciiValue(packet.data, ascii_element);
        } else {
            ascii_element.classList.add("add-cell");
            ascii_element.innerText = "+";
        }
        ascii_element.addEventListener("mouseleave", removeHover);
        ascii_element.tabIndex = -1;
        return ascii_element;
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

    /**
     * @description Handles the click events within the editor
     * @param {MouseEvent} event The MouseEvent passed to the event handler.
     */
    private clickHandler(event: MouseEvent): void {
        if (event.buttons > 1) return;
        const target = event.target as HTMLElement;
        if (!target || !target.hasAttribute("data-offset")) {
            return;
        }

        event.preventDefault();
        this.editHandler.completePendingEdits();
        const offset = parseInt(target.getAttribute("data-offset")!);
        if (event.shiftKey) {
            const startSelection = this.selectHandler.getSelectionStart();
            if (startSelection !== undefined) {
                this.selectHandler.setFocused(offset);
                const min = Math.min(startSelection, offset);
                const max = Math.max(startSelection, offset);
                this.selectHandler.setSelected(createOffsetRange(min, max), startSelection);
                target.focus({ preventScroll: true });
            }
        } else {
            this.selectHandler.setFocused(offset);
            if (event.ctrlKey) {
                const selection = this.selectHandler.getSelected();
                const newSelection = selection.filter(i => i !== offset);
                if (selection.length === newSelection.length) {
                    this.selectHandler.setSelected([...newSelection, offset], offset);
                } else {
                    this.selectHandler.setSelected(newSelection, offset);
                }
            } else {
                this.selectHandler.setSelected([offset], offset);
            }
            this.updateInspector();
            target.focus({ preventScroll: true });
        }
    }

    /**
     * @description Handles the mousedown events within the editor
     * @param {MouseEvent} event The MouseEvent passed to the event handler.
     */
    private mouseDownHandler(event: MouseEvent): void {
        if (event.buttons !== 1) {
            return;
        }

        const target = event.target as HTMLElement;
        if (!target || !target.hasAttribute("data-offset")) {
            return;
        }

        event.preventDefault();
        this.editHandler.completePendingEdits();
        const offset = parseInt(target.getAttribute("data-offset")!);
        const startMouseMoveOffset = offset;
        const startSelection = event.shiftKey ? this.selectHandler.getSelectionStart() : offset;

        const onMouseMove = (event: MouseEvent): void => {
            if (event.buttons !== 1) {
                return;
            }

            const target = event.target as HTMLElement;
            if (!target || !target.hasAttribute("data-offset")) {
                return;
            }

            const offset = parseInt(target.getAttribute("data-offset")!);
            if (startSelection !== undefined && offset !== startMouseMoveOffset) {
                this.selectHandler.setFocused(offset);
                const min = Math.min(startSelection, offset);
                const max = Math.max(startSelection, offset);
                this.selectHandler.setSelected(createOffsetRange(min, max), startSelection);
                target.focus({ preventScroll: true });
            }
        };

        const onMouseUp = (): void => {
            this.editorContainer.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        this.editorContainer.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }

    /**
     * @description Handles all keyboard interaction with the document
     * @param {KeyboardEvent} event The KeyboardEvent passed to the event handler.
     */
    private async keyBoardHandler(event: KeyboardEvent): Promise<void> {
        if (!event || !event.target) return;
        const targetElement = event.target as HTMLElement;
        const modifierKeyPressed = event.metaKey || event.altKey || event.ctrlKey;
        if ((event.metaKey || event.ctrlKey) && event.key === "f") {
            // If the user presses ctrl / cmd + f we focus the search box and change the dropdown
            this.searchHandler.searchKeybindingHandler();
        } else if ((event.keyCode >= 37 && event.keyCode <= 40 /*Arrows*/)
            || ((event.keyCode === 35 /*End*/ || event.keyCode === 36 /*Home*/) && !event.ctrlKey)) {
            this.navigateByKey(event.keyCode, targetElement, event.shiftKey);
            event.preventDefault();
        } else if (!modifierKeyPressed && targetElement.classList.contains("hex")) {
            await this.editHandler.editHex(targetElement, event.key);
            // If this cell has been edited
            if (targetElement.innerText.trimRight().length == 2 && targetElement.classList.contains("editing")) {
                targetElement.classList.remove("editing");
                this.navigateByKey(39, targetElement, false);
            }
        } else if (!modifierKeyPressed && event.key.length === 1 && targetElement.classList.contains("ascii")) {
            await this.editHandler.editAscii(targetElement, event.key);
            targetElement.classList.remove("editing");
            this.navigateByKey(39, targetElement, false);
        }
        await this.editHandler.completePendingEdits();
    }

    /**
     * @description Handles scrolling using ctrl + home and ctrl + end
     * @param {KeyboardEvent} event The KeyboardEvent passed to the event handler.
     */
    private keyBoardScroller(event: KeyboardEvent): void {
        if (!event || !event.target) return;
        if ((event.keyCode == 36 || event.keyCode == 35) && event.ctrlKey) {
            // If the user pressed CTRL + Home or CTRL + End we scroll the whole document
            event.keyCode == 36 ? this.scrollBarHandler.scrollToTop() : this.scrollBarHandler.scrollToBottom();
        } else if (event.keyCode == 33) {
            // PG Up
            this.scrollBarHandler.page(this.viewPortHeight, "up");
        } else if (event.keyCode == 34) {
            // PG Down
            this.scrollBarHandler.page(this.viewPortHeight, "down");
        }
    }

    /**
     * @description Handles when the user uses the arrow keys, Home or End to navigate the editor
     * @param {number} keyCode The keyCode of the key pressed
     * @param {HTMLElement} targetElement The element
     * @param {boolean} isRangeSelection If we are selecting a range (shift key pressed)
     */
    private navigateByKey(keyCode: number, targetElement: HTMLElement, isRangeSelection: boolean): void {
        let next: HTMLElement | undefined;
        switch (keyCode) {
            case 35:
                // If the user presses End we go to the end of the line
                const parentChildren = targetElement.parentElement!.children;
                next = parentChildren[parentChildren.length - 1] as HTMLElement;
                break;
            case 36:
                // If the user presses Home we go to the front of the line
                next = targetElement.parentElement!.children[0] as HTMLElement;
                break;
            case 37:
                // left
                next = (targetElement.previousElementSibling || targetElement.parentElement?.previousElementSibling?.children[15]) as HTMLElement;
                break;
            case 38:
                // up
                const elements_above = getElementsWithGivenOffset(parseInt(targetElement.getAttribute("data-offset")!) - 16);
                if (elements_above.length === 0) break;
                next = targetElement.classList.contains("hex") ? elements_above[0] : elements_above[1];
                break;
            case 39:
                // right
                next = (targetElement.nextElementSibling || targetElement.parentElement?.nextElementSibling?.children[0]) as HTMLElement;
                break;
            case 40:
                // down
                const elements_below = getElementsWithGivenOffset(Math.min(parseInt(targetElement.getAttribute("data-offset")!) + 16, this.fileSize - 1));
                if (elements_below.length === 0) break;
                next = targetElement.classList.contains("hex") ? elements_below[0] : elements_below[1];
                break;
        }
        if (next && next.tagName === "SPAN") {
            const nextRect = next.getBoundingClientRect();
            if (this.viewPortHeight <= nextRect.bottom) {
                this.scrollBarHandler.scrollDocument(1, "down");
            } else if (nextRect.top <= 0) {
                this.scrollBarHandler.scrollDocument(1, "up");
            }

            const offset = parseInt(next.getAttribute("data-offset")!);
            this.selectHandler.setFocused(offset);
            const startSelection = this.selectHandler.getSelectionStart();
            if (isRangeSelection && startSelection !== undefined) {
                const min = Math.min(startSelection, offset);
                const max = Math.max(startSelection, offset);
                this.selectHandler.setSelected(createOffsetRange(min, max), startSelection);
            } else {
                this.selectHandler.setSelected([offset], offset);
                this.updateInspector();
            }
            next.focus({ preventScroll: true });
        }
    }

    /***
     * @description Populates the inspector data with the currently focused element.
     */
    private updateInspector(): void {
        const offset = this.selectHandler.getFocused();
        if (offset !== undefined) {
            const elements = getElementsWithGivenOffset(offset);
            const byte_obj = retrieveSelectedByteObject(elements)!;
            const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
            populateDataInspector(byte_obj, littleEndian);
        }
    }

    /***
     * @description Given an array of offsets, selects the corresponding elements.
     * @param {number[]} offsets The offsets of the elements you want to select
     */
    public setSelection(offsets: number[]): void {
        this.selectHandler.setSelected(offsets, offsets.length > 0 ? offsets[0] : undefined);
    }

    /***
     * @description Given an offset, selects the elements and focuses the element in the same column as previous focus. Defaults to hex.
     * @param {number} offset The offset of the elements you want to select and focus
     */
    public focusElementWithGivenOffset(offset: number): void {
        const elements = getElementsWithGivenOffset(offset);
        if (elements.length != 2) return;
        this.selectHandler.setSelected([offset], offset);
        // If an ascii element is currently focused then we focus that, else we focus hex
        if (document.activeElement?.parentElement?.parentElement?.parentElement?.classList.contains("right")) {
            elements[1].focus();
        } else {
            elements[0].focus();
        }
    }

    /**
     * @description Undoes the given edits from the document
     * @param {EditMessage[]} edits The edits that will be undone
     * @param {number} fileSize The size of the file, the ext host tracks this and passes it back
     */
    public undo(edits: EditMessage[], fileSize: number): void {
        this.fileSize = fileSize;
        this.editHandler.undo(edits);
    }

    /**
     * @description Redoes the given edits from the document
     * @param {EditMessage[]} edits The edits that will be redone
     * @param {number} fileSize The size of the file, the ext host tracks this and passes it backedone
     */
    public redo(edits: EditMessage[], fileSize: number): void {
        this.editHandler.redo(edits);
        this.fileSize = fileSize;
    }

    /**
     * @description Called when the user executes revert
     */
    public revert(fileSize: number): void {
        this.fileSize = fileSize;
        this.editHandler.revert();
    }

    /**
     * @description Creates an add cell (the little plus placeholder) and places it at the end of the document
     */
    public createAddCell(): void {
        // Don't make more more add cells until there are none left on the DOM
        if (document.getElementsByClassName("add-cell").length !== 0) return;
        // This will start a new row
        const packet: VirtualizedPacket = {
            offset: this.fileSize,
            data: new ByteData(0)
        };
        if (this.fileSize % 16 === 0) {
            this.render([packet]);
            // If it's a new chunk we want the chunkhandler to track it
            if (this.fileSize % chunkHandler.chunkSize === 0) {
                chunkHandler.addChunk(this.fileSize);
            }
            this.scrollBarHandler.updateScrollBar(this.fileSize / 16);
        } else {
            const hex_element = this.createHexElement(packet);
            const ascii_element = this.createAsciiElement(packet);
            const elements = getElementsWithGivenOffset(this.fileSize - 1);
            elements[0].parentElement?.appendChild(hex_element);
            elements[1].parentElement?.appendChild(ascii_element);
        }
    }

    /**
     * @description Removes the last cell from the virtual document
     */
    public removeLastCell(): void {
        // We can use the add cell as the last cell offset since a plus cell should always be the last cell
        const plusCellOffset = document.getElementsByClassName("add-cell")[0].getAttribute("data-offset");
        if (!plusCellOffset) return;
        const lastCellOffset = parseInt(plusCellOffset);
        const lastCells = getElementsWithGivenOffset(lastCellOffset);
        const secondToLastCells = getElementsWithGivenOffset(lastCellOffset - 1);
        // If the last cell was on its own row we remove the new row
        if (lastCellOffset % 16 === 0) {
            this.rows[0].get(lastCellOffset.toString())?.remove();
            this.rows[0].delete(lastCellOffset.toString());
            this.rows[1].get(lastCellOffset.toString())?.remove();
            this.rows[1].delete(lastCellOffset.toString());
            this.rows[2].get(lastCellOffset.toString())?.remove();
            this.rows[2].delete(lastCellOffset.toString());
            this.scrollBarHandler.updateScrollBar((lastCellOffset - 1) / 16);
        } else {
            lastCells[0].remove();
            lastCells[1].remove();
        }
        secondToLastCells[0].innerText = "+";
        secondToLastCells[0].classList.add("add-cell");
        secondToLastCells[0].classList.remove("nongraphic");
        secondToLastCells[0].classList.remove("edited");
        secondToLastCells[1].innerText = "+";
        secondToLastCells[1].classList.remove("nongraphic");
        secondToLastCells[1].classList.add("add-cell");
        secondToLastCells[1].classList.remove("edited");
    }

    /**
     * @description Simple getter for the fileSize
     * @returns {number} The fileSize
     */
    public get documentSize(): number { return this.fileSize; }

    /**
     * @description Updates the file size so its in sync with ext host
     * @param {number} newSize The new filesize
     */
    public updateDocumentSize(newSize: number): void {
        this.fileSize = newSize;
    }
    /**
     * @description Re-requests all the chunks on the DOM for rendering. This is needed for revert
     */
    public async reRequestChunks(): Promise<void> {
        // If we don't do Array.from it will still reference the original set causing it to infinitely request and delete the chunks
        const allChunks = Array.from(chunkHandler.allChunks);
        for (const chunk of allChunks) {
            // Remove all the chunks from the DOM
            for (let i = chunk; i < chunk + chunkHandler.chunkSize; i += 16) {
                this.rows[0].get(i.toString())?.remove();
                this.rows[0].delete(i.toString());
                this.rows[1].get(i.toString())?.remove();
                this.rows[1].delete(i.toString());
                this.rows[2].get(i.toString())?.remove();
                this.rows[2].delete(i.toString());
            }
            chunkHandler.removeChunk(chunk);
            await chunkHandler.requestMoreChunks(chunk);
        }
    }

    public async scrollDocumentToOffset(offset: number): Promise<void[]> {
        return this.scrollBarHandler.scrollToOffset(offset);
    }
}
