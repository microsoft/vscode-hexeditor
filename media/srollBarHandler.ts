// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { virtualHexDocument } from "./hexEdit";

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
            this.isDragging = true;
        });
        this.scrollBar.addEventListener("mouseup", () => {
            this.scrollThumb.style.backgroundColor = "purple";
            this.isDragging = false;
        });
        this.scrollBar.addEventListener("mousemove", this.scrollThumbDrag.bind(this));
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
        this.scrollThumbHeight = Math.max(this.scrollBarHeight * (this.scrollBarHeight / contentHeight), 30);
        this.scrollThumb.style.height = `${this.scrollThumbHeight}px`;
        // If you move the scrollbar 1px how much should the document move
        this.scrollJump = (contentHeight - this.scrollBarHeight) / (this.scrollBarHeight - this.scrollThumbHeight);
        this.updateScrolledPosition();
    }

    /**
     * @description Handles when the user drags the thumb on the scrollbar around
     * @param {MouseEvent} event The mouse event passed to the event handler
     */
    private scrollThumbDrag(event: MouseEvent): void {
        // This helps the case where we lose track as the user releases the button outside the webview
        if (!this.isDragging || event.buttons == 0){
            this.isDragging = false;
            this.scrollThumb.style.backgroundColor = "purple";
            return;
        }
        if (event.clientY > this.scrollBarHeight - this.scrollThumbHeight) {
            this.scrollTop = (this.scrollBarHeight - this.scrollThumbHeight) * this.scrollJump;
        } else {
            this.scrollTop = event.clientY * this.scrollJump;
        }
        this.scrollThumb.style.backgroundColor = "black";
        this.updateScrolledPosition();
    }

    /**
     * @description Updaes the position of the document and the scrollbar thumb based on the scrollTop
     */
    private updateScrolledPosition(): void {
        // The virtual document upon first load is undefined so we want to prevent any errors and just not do anything in that case
        if (!virtualHexDocument || !virtualHexDocument.documentHeight) return;
        this.scrollThumb.style.transform = `translateY(${Math.min(this.scrollTop / this.scrollJump, this.scrollBarHeight - this.scrollThumbHeight )}px)`;
        // This makes sure it doesn't scroll past the bottom of the viewport
        (document.getElementsByClassName("rowwrapper")[0] as HTMLElement)!.style.transform = `translateY(-${this.scrollTop % virtualHexDocument.documentHeight}px)`;
        (document.getElementsByClassName("rowwrapper")[1] as HTMLElement)!.style.transform = `translateY(-${this.scrollTop % virtualHexDocument.documentHeight}px)`;
        (document.getElementsByClassName("rowwrapper")[2] as HTMLElement)!.style.transform = `translateY(-${this.scrollTop % virtualHexDocument.documentHeight}px)`;
        virtualHexDocument.scrollHandler();
    }

    /**
     * @description Handles the user scrolling with their mouse wheel
     * @param {MouseWheelEvent} event The event containing information about the scroll passed to the event handler
     */
    private onMouseWheel(event: MouseWheelEvent): void {
        if (event.deltaY > 0) {
            // If we're at the bottom of the document we don't want the user to be able to keep scrolling down
            if (this.scrollTop / this.scrollJump >= this.scrollBarHeight - this.scrollThumbHeight) return;
            this.scrollTop += this.rowHeight;
        } else {
            this.scrollTop -= this.rowHeight;
            this.scrollTop = Math.max(0, this.scrollTop);
        }
        
        this.updateScrolledPosition();
    }
    /**
     * @description Can be called to scroll the document similar to window.scrollBy
     * @param numRows The number of rows you want to scroll
     * @param direction The direction, up or down
     */
    public scrollDocument(numRows: number, direction: "up" | "down"): void {
        if (direction === "up") {
            this.scrollTop -= this.rowHeight * numRows;
            this.scrollTop = Math.max(0, this.scrollTop);
        } else {
            // If we're at the bottom of the document we don't want to do anything here
            if (this.scrollTop / this.scrollJump >= this.scrollBarHeight - this.scrollThumbHeight) return;
            this.scrollTop += this.rowHeight * numRows;
        }
        this.updateScrolledPosition();
    }

    /**
     * @description Retrieves the pixel value at the top of the viewport
     * @returns {number} The pixel value of the virtual viewport top
     */
    public get virtualScrollTop(): number {
        return this.scrollTop;
    }
}