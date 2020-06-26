// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getElementsWithGivenOffset, updateAsciiValue } from "./util";
import { ByteData } from "./byteData";
import { messageHandler, virtualHexDocument } from "./hexEdit";

interface DocumentEdit {
    offset: number;
    previousValue: string | undefined;
    newValue: string | undefined;
    element: HTMLSpanElement | undefined;
}

// This is what an edit to/from the extension host looks like
export interface EditMessage {
    readonly oldValue: number | undefined;
	readonly newValue: number | undefined;
    readonly offset: number;
    readonly sameOnDisk: boolean;
}

export class EditHandler {
    private pendingEdit: DocumentEdit | undefined;

    constructor() {
        this.pendingEdit = undefined;
    }

    public async editHex(element: HTMLSpanElement, keyPressed: string, keyCode: number): Promise<void> {
        // If it's not a valid hex input we ignore it
        if (!((keyCode >= 65 && keyCode <= 70) || (keyCode >= 48 && keyCode <= 57))) return;

        const offset: number = parseInt(element.getAttribute("data-offset")!);
        if (!this.pendingEdit || this.pendingEdit.offset != offset) {
            this.pendingEdit = {
                offset: offset,
                previousValue: element.innerText === "+" ? undefined : element.innerText,
                newValue: "",
                element: element
            };
        }
        element.classList.add("editing");
        element.innerText = element.innerText.trimRight();
        // This handles when the user presses the first character erasing the old value vs adding to the currently edited value
        element.innerText = element.innerText.length == 2 || element.innerText === "+" ?`${keyPressed.toUpperCase()} ` : element.innerText + keyPressed.toUpperCase();
        this.pendingEdit.newValue = element.innerText;
        if(element.innerText.trimRight().length == 2) {
            element.classList.remove("add-cell");
            // Not really an edit if nothing changed
            if (this.pendingEdit.newValue == this.pendingEdit.previousValue) {
                this.pendingEdit = undefined;
                return;
            }
            await this.sendEditToExtHost(this.pendingEdit);
            this.updateAscii(element.innerText, offset);
            element.classList.add("edited");
            // Means the last cell of the document was filled in so we add another placeholder afterwards
            if (!this.pendingEdit.previousValue) {
                virtualHexDocument.createAddCell();
            }
            this.pendingEdit = undefined;
        }
    }

    public async editAscii(element: HTMLSpanElement, keyPressed: string): Promise<void> {
        // We don't want to do anything if the user presses a key such as home etc which will register as greater than 1 char
        if (keyPressed.length != 1) return;
        // No need to call it edited if it's the same value
        if (element.innerText === keyPressed) return;
        const offset: number = parseInt(element.getAttribute("data-offset")!);
        const hexElement = getElementsWithGivenOffset(offset)[0];
        // We store all pending edits as hex as ascii isn't always representative due to control characters
        this.pendingEdit = {
            offset: offset,
            previousValue: hexElement.innerText === "+" ? undefined : hexElement.innerText,
            newValue: keyPressed.charCodeAt(0).toString(16).toUpperCase(),
            element: element
        };
        element.classList.remove("add-cell");
        element.classList.add("editing");
        element.classList.add("edited");
        this.updateAscii(this.pendingEdit.newValue, offset);
        this.updateHex(keyPressed, offset);
        await this.sendEditToExtHost(this.pendingEdit);
        // Means the last cell of the document was filled in so we add another placeholder afterwards
        if (!this.pendingEdit.previousValue) {
            virtualHexDocument.createAddCell();
        }
        this.pendingEdit = undefined;
    }

    private updateAscii(hexValue: string | undefined, offset: number): void {
        // For now if it's undefined we will just ignore it, but this would be the delete case
        if (!hexValue) return;
        // The way the DOM is constructed the ascii element will always be the second one
        const ascii = getElementsWithGivenOffset(offset)[1];
        ascii.classList.remove("add-cell");
        updateAsciiValue(new ByteData(parseInt(hexValue, 16)), ascii);
        ascii.classList.add("edited");
    }

    private updateHex(asciiValue: string, offset: number): void {
        // The way the DOM is constructed the hex element will always be the first one
        const hex = getElementsWithGivenOffset(offset)[0];
        hex.innerText = asciiValue.charCodeAt(0).toString(16).toUpperCase();
        hex.classList.remove("add-cell");
        hex.classList.add("edited");
    }

    public async completePendingEdits(): Promise<void> {
        if (this.pendingEdit && this.pendingEdit.element && this.pendingEdit.newValue) {
            // We don't want to stop the edit if it is selected as that can mean the user will be making further edits
            if (this.pendingEdit.element.classList.contains("selected")) return;
            // Ensure the hex value has 2 characters, if not we add a 0 in front
            this.pendingEdit.newValue = this.pendingEdit.newValue.trimRight().length == 1 ? "0" + this.pendingEdit.newValue.trimRight() : this.pendingEdit.newValue;
            this.pendingEdit.element.classList.remove("editing");
            this.pendingEdit.element.classList.add("edited");
            this.pendingEdit.element.classList.remove("add-cell");
            this.pendingEdit.element.innerText = this.pendingEdit.newValue;
            this.updateAscii(this.pendingEdit.newValue, this.pendingEdit.offset);
            await this.sendEditToExtHost(this.pendingEdit);
            if (!this.pendingEdit.previousValue) {
                virtualHexDocument.createAddCell();
            }
            this.pendingEdit = undefined;
        }
    }

    private async sendEditToExtHost(edit: DocumentEdit): Promise<void> {
        // The ext host only accepts 8bit unsigned ints, so we must convert the edits back into that representation
        const oldValue = edit.previousValue ? parseInt(edit.previousValue, 16) : undefined;
        const newValue = edit.newValue ? parseInt(edit.newValue, 16) : undefined;
        const extHostMessage: EditMessage = {
            offset: edit.offset,
            oldValue,
            newValue,
            sameOnDisk: false,
        };
        try {
            const syncedFileSize = (await messageHandler.postMessageWithResponse("edit", extHostMessage)).fileSize;
            virtualHexDocument.updateDocumentSize(syncedFileSize);
        // Empty catch because we just don't do anything if for some reason the exthost doesn't respond with the new fileSize,
        // we just sync at the next available opportunity
        } catch {}

    }

    public undo(edits: EditMessage[]): void {
        for (const edit of edits) {
            // This would be the delete case, but for now we will leave it alone
            if (!edit.oldValue) {
                virtualHexDocument.removeLastCell();
                return;
            }
            const elements = getElementsWithGivenOffset(edit.offset);
            // We're executing an undo and the elements aren't on the DOM so there's no point in doing anything
            if (elements.length != 2) return;
            if (edit.sameOnDisk) {
                elements[0].classList.remove("edited");
                elements[1].classList.remove("edited");
            } else {
                elements[0].classList.add("edited");
                elements[1].classList.add("edited");
            }
            elements[0].innerText = edit.oldValue.toString(16).toUpperCase();
            elements[0].innerText = elements[0].innerText.length == 2 ? elements[0].innerText : `0${elements[0].innerText}`;
            updateAsciiValue(new ByteData(edit.oldValue), elements[1]);
        }
    }

    public redo(edits: EditMessage[]): void {
        for (const edit of edits) {
            if (!edit.newValue) return;
            const elements = getElementsWithGivenOffset(edit.offset);
            // We're executing an redo and the elements aren't on the DOM so there's no point in doing anything
            if (elements.length != 2) return;
            elements[0].classList.remove("add-cell");
            elements[1].classList.remove("add-cell");
            if (edit.sameOnDisk) {
                elements[0].classList.remove("edited");
                elements[1].classList.remove("edited");
            } else {
                elements[0].classList.add("edited");
                elements[1].classList.add("edited");
            }
            elements[0].innerText = edit.newValue.toString(16).toUpperCase();
            elements[0].innerText = elements[0].innerText.length == 2 ? elements[0].innerText : `0${elements[0].innerText}`;
            updateAsciiValue(new ByteData(edit.newValue), elements[1]);
            // We want to make sure the last cell is always an add cell, the function takes care of preventing duplicates
            if (edit.offset === virtualHexDocument.documentSize - 1) {
                virtualHexDocument.createAddCell();
            }
        }
    }
}