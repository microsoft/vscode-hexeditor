// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getElementsGivenMouseEvent, retrieveSelectedByteObject, getElementsWithGivenOffset } from "./util";
import { WebViewStateManager } from "./webviewStateManager";
import { clearDataInspector, populateDataInspector } from "./dataInspector";

export class SelectHandler {

    /**
     * @description Removes the selected class from all elements, this is helpful when ensuring only one byte and its associated decoded text is selected
     */
    public static clearSelected(): void {
        document.querySelectorAll(".selected").forEach(element => element.classList.remove("selected"));
    }

    /**
     * @description Selects the clicked element and its associated hex/ascii
     * @param {MouseEvent} event MouseEvent handed to a click listener
     * @param {boolean} multiSelect whether or not the user is clicking ctrl to add to the selection
     */
    public static selectMouseHandler(event: MouseEvent, multiSelect: boolean): void  {
        if (!event || !event.target) return;
        const elements = getElementsGivenMouseEvent(event);
        if (!elements) return;
        // We toggle the select off if they clicked the same element
        if (elements[0].classList.contains("selected")) {
            if (document.activeElement) {
                (document.activeElement as HTMLElement).blur();
            }
            WebViewStateManager.setProperty("selected_offset", undefined);
            clearDataInspector();
            elements[0].classList.remove("selected");
            elements[1].classList.remove("selected");
        } else {
            if (multiSelect) {
                this.multiSelect([parseInt((event.target as HTMLElement).getAttribute("data-offset")!)], true);
            } else {
                this.singleSelect(parseInt((event.target as HTMLElement).getAttribute("data-offset")!));
            }
            (event.target as HTMLElement).focus();
        }
    }

    /**
     * @description Given an offset selects the elements. This does not clear the previously selected elements.
     * @param {number} offset Offset to select
     */
    private static selectOffset(offset: number): void {
        const elements = getElementsWithGivenOffset(offset);
        WebViewStateManager.setProperty("selected_offset", offset);
        elements[0].classList.add("selected");
        elements[1].classList.add("selected");
    }

    /**
     * @description Given an offset, selects the hex and ascii element
     * @param {number} offset  The offset of the element you want to select
     */
    public static singleSelect(offset: number): void {
        this.clearSelected();
        this.selectOffset(offset);
        const elements = getElementsWithGivenOffset(offset);
        const byte_obj = retrieveSelectedByteObject(elements);
        if (!byte_obj) return;
        const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
        populateDataInspector(byte_obj, littleEndian);
    }

    /**
     * @description Selects the hex and ascii elements with the given offsets
     * @param {number[]} offsets The list of offsets to select 
     * @param {boolean} append Whether it should 
     */
    public static multiSelect(offsets: number[], append: boolean): void {
        if (!append) this.clearSelected();
        for (const offset of offsets) {
            this.selectOffset(offset);
        }
    }

    /***
     * @description Grabs the hex values of the selected bytes
     * @returns {string[]} The hex values
     */
    public static getSelectedHex(): string[] {
        const hex: string[] = [];
        const selected = document.getElementsByClassName("selected hex") as HTMLCollectionOf<HTMLSpanElement>;
        for (let i = 0; i < selected.length; i++) {
            if (selected[i].innerText === "+") continue;
            hex.push(selected[i].innerText);
        }
        return hex;
    }
}