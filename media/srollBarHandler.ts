// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { virtualHexDocument } from "./hexEdit";
import { WebViewStateManager } from "./webviewStateManager";

export class ScrollBarHandler {
    private scrollBar: HTMLDivElement;
    private scrollBarHeight!: number;
    private scrollThumb: HTMLDivElement;
    private scrollThumbHeight!: number;
    private scrollJump!: number;
    private rowHeight: number;
    private scrollTop: number;
    private isDragging: boolean;
    /**
     * Given a scrollbar element instantiates a handler which handles the scrolling behavior in the editor
     * @param {string} scrollBarId the id of the scrollbar element on the DOM 
     * @param {number} rowHeight the height of a row in px
     */
    constructor(scrollBarId: string, numRows: number, rowHeight: number) {
        this.scrollTop = 0;
        this.isDragging = false;
        // If the scrollbar isn't on the DOM for some reason there's nothing we can do besides create an empty handler and throw an error
        if (document.getElementById(scrollBarId)) {
            this.scrollBar = document.getElementById(scrollBarId)! as HTMLDivElement;
            this.scrollThumb = this.scrollBar.children[0] as HTMLDivElement;
        } else {
            this.scrollBar = document.createElement("div");
            this.scrollThumb = document.createElement("div");
            throw "Invalid scrollbar id!";
        }
        window.addEventListener("wheel", this.onMouseWheel.bind(this));
        this.scrollBar.addEventListener("mousedown", () => {
            this.scrollThumb.classList.add("scrolling");
            this.isDragging = true;
        });
        this.scrollBar.addEventListener("mouseup", () => {
            this.scrollThumb.classList.remove("scrolling");
            this.isDragging = false;
        });
        window.addEventListener("mousemove", this.scrollThumbDrag.bind(this));
        this.rowHeight = rowHeight;
        this.updateScrollBar(numRows);
    }

    /**
     * @description Handles ensuring the scrollbar is valid after window resize 
     * @param {number} numRows The number of rows in the file, needed to map scroll bar to row locations
     */
    public updateScrollBar(numRows: number): void {
        // Some calculations so that the thumb / scrubber is representative of how much content there is
        // Credit to https://stackoverflow.com/questions/16366795/how-to-calculate-the-size-of-scroll-bar-thumb for these calculations
        const contentHeight = (numRows + 1) * this.rowHeight;
        this.scrollBarHeight = this.scrollBar.clientHeight;
        // We don't want the scroll thumb larger than the scrollbar
        this.scrollThumbHeight = Math.min(this.scrollBarHeight, Math.max(this.scrollBarHeight * (this.scrollBarHeight / contentHeight), 30));
        this.scrollThumb.style.height = `${this.scrollThumbHeight}px`;
        // If you move the scrollbar 1px how much should the document move
        this.scrollJump = Math.max(0, (contentHeight - this.scrollBarHeight) / (this.scrollBarHeight - this.scrollThumbHeight));
        this.updateScrolledPosition();
    }

    /**
     * @description Handles when the user drags the thumb on the scrollbar around
     * @param {MouseEvent} event The mouse event passed to the event handler
     */
    private scrollThumbDrag(event: MouseEvent): void {
        // if these are equal it means the document is too short to scroll anyways
        if (this.scrollBarHeight === this.scrollThumbHeight) return;
        // This helps the case where we lose track as the user releases the button outside the webview
        if (!this.isDragging || event.buttons == 0){
            this.isDragging = false;
            this.scrollThumb.classList.remove("scrolling");
            return;
        }
        event.preventDefault();
        this.updateVirtualScrollTop(event.clientY * this.scrollJump);
        this.updateScrolledPosition();
    }

    /**
     * @description Updaes the position of the document and the scrollbar thumb based on the scrollTop
     */
    private async updateScrolledPosition(): Promise<void[]> {
        // The virtual document upon first load is undefined so we want to prevent any errors and just not do anything in that case
        if (!virtualHexDocument || !virtualHexDocument.documentHeight) return [];
        this.scrollThumb.style.transform = `translateY(${this.scrollTop / this.scrollJump}px)`;
        // This makes sure it doesn't scroll past the bottom of the viewport
        (document.getElementsByClassName("rowwrapper")[0] as HTMLElement)!.style.transform = `translateY(-${this.scrollTop % virtualHexDocument.documentHeight}px)`;
        (document.getElementsByClassName("rowwrapper")[1] as HTMLElement)!.style.transform = `translateY(-${this.scrollTop % virtualHexDocument.documentHeight}px)`;
        (document.getElementsByClassName("rowwrapper")[2] as HTMLElement)!.style.transform = `translateY(-${this.scrollTop % virtualHexDocument.documentHeight}px)`;
        return virtualHexDocument.scrollHandler();
    }

    /**
     * @description Handles the user scrolling with their mouse wheel
     * @param {MouseWheelEvent} event The event containing information about the scroll passed to the event handler
     */
    private onMouseWheel(event: MouseWheelEvent): void {
        // if these are equal it means the document is too short to scroll anyways
        if (this.scrollBarHeight === this.scrollThumbHeight) return;
        if (Math.abs(event.deltaX) !== 0 || event.shiftKey) return;
        if (event.deltaY > 0) {
            this.updateVirtualScrollTop(this.scrollTop + this.rowHeight);
        } else {
            this.updateVirtualScrollTop(this.scrollTop - this.rowHeight);
        }
        
        this.updateScrolledPosition();
    }
    /**
     * @description Can be called to scroll the document similar to window.scrollBy
     * @param {number} numRows The number of rows you want to scroll
     * @param {"up" | "down"} direction The direction, up or down
     */
    public async scrollDocument(numRows: number, direction: "up" | "down"): Promise<void[]> {
        if (direction === "up") {
            this.updateVirtualScrollTop(this.scrollTop - (this.rowHeight * numRows));
        } else {
            this.updateVirtualScrollTop(this.scrollTop + (this.rowHeight * numRows));
        }
        return this.updateScrolledPosition();
    }

    /**
     * @description Scrolls to the top of the document
     */
    public scrollToTop(): void {
        this.updateVirtualScrollTop(0);
        this.updateScrolledPosition();
    }

    /**
     * @description Scrolls to the bottom of the document
     */
    public scrollToBottom(): void {
        this.updateVirtualScrollTop(((this.scrollBarHeight - this.scrollThumbHeight) * this.scrollJump) + this.rowHeight);
        this.updateScrolledPosition();
    }

    /**
     * @description Controls scrolling up and down one viewport. Which occurs when the user presses page up or page down
     * @param {number} viewportHeight The height of the viewport in pixels
     * @param {string} direction Whether you want to page up or down
     */
    public page(viewportHeight: number, direction: "up" | "down"): void {
        if (direction == "up") {
            this.updateVirtualScrollTop(this.scrollTop - viewportHeight);
        } else {
            this.updateVirtualScrollTop(this.scrollTop + viewportHeight);
        }
        this.updateScrolledPosition();
    }

    /***
     * @description Sets the virtualScrollTop ensuring it never exceeds the document bounds
     * @param {number} newScrollTop The number you're trying to set the virtual scroll top to
     */
    private updateVirtualScrollTop(newScrollTop: number): void {
        this.scrollTop = Math.max(0, newScrollTop);
        newScrollTop = this.scrollTop;
        this.scrollTop = Math.min(newScrollTop, ((this.scrollBarHeight - this.scrollThumbHeight) * this.scrollJump) + this.rowHeight);
        WebViewStateManager.setProperty("scroll_top", this.scrollTop);
    }

    /**
     * @description Retrieves the pixel value at the top of the viewport
     * @returns {number} The pixel value of the virtual viewport top
     */
    public get virtualScrollTop(): number {
        return this.scrollTop;
    }

    /**
     * @description Updates the scroll position to be whatever was saved in the webview state. Should only be called if the user has reloaded the webview
     */
    public resyncScrollPosition(): void {
        // If we had a previously saved state when creating the scrollbar we should restore the scroll position
        if (WebViewStateManager.getState() && WebViewStateManager.getState().scroll_top) {
            this.updateVirtualScrollTop(WebViewStateManager.getState().scroll_top);
            this.updateScrolledPosition();
        }
    }

    public async scrollToOffset(offset: number): Promise<void[]> {
        // if these are equal it means the document is too short to scroll anyways
        if (this.scrollBarHeight === this.scrollThumbHeight) return [];
        const topOffset = virtualHexDocument.topOffset();
        const rowDifference = Math.floor(Math.abs(offset - topOffset) / 16);
        // The +3/-3 is because there is because we want the result to not be pressed against the top
        if (offset > topOffset) {
            return this.scrollDocument(rowDifference - 3, "down");
        } else {
            return this.scrollDocument(rowDifference + 3, "up");
        }
    }
}