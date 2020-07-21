// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getElementsGivenMouseEvent, retrieveSelectedByteObject, getElementsWithGivenOffset, createOffsetRange } from "./util";
import { WebViewStateManager } from "./webviewStateManager";
import { clearDataInspector, populateDataInspector } from "./dataInspector";

export class SelectHandler {

    public isDragging: boolean;

    constructor() {
        this.isDragging = false;
    }
    
    /**
     * @description Removes the selected class from all elements, this is helpful when ensuring only one byte and its associated decoded text is selected
     */
    public static clearSelected(): void {
        document.querySelectorAll(".selected").forEach(element => element.classList.remove("selected"));
        // Clear the webview's selection state
        WebViewStateManager.setProperty("selected_offsets", []);
    }

    /**
     * @description Selects the clicked element and its associated hex/ascii
     * @param {MouseEvent} event MouseEvent handed to a click listener
     * @param {boolean} multiSelect whether or not the user is clicking ctrl to add to the selection
     * @param {boolean} rangeSelect whether or not the user is click shift to select a range of values
     */
    public static selectMouseHandler(event: MouseEvent, multiSelect: boolean, rangeSelect: boolean): void  {
        if (!event || !event.target) return;
        const elements = getElementsGivenMouseEvent(event);
        if (!elements) return;
        // We toggle the select off if they clicked the same element
        if (elements[0].classList.contains("selected")) {
            if (document.activeElement) {
                (document.activeElement as HTMLElement).blur();
            }
            const currentSelectedOffsets = WebViewStateManager.getProperty("selected_offsets") as number[];
            const offset = parseInt(elements[0].getAttribute("data-offset")!);
            // We stop tracking that selection in the webview
            WebViewStateManager.setProperty("selected_offsets", currentSelectedOffsets.splice(currentSelectedOffsets.indexOf(offset), 1));
            clearDataInspector();
            elements[0].classList.remove("selected");
            elements[1].classList.remove("selected");
        } else {
            if (rangeSelect) {
                const selected = document.getElementsByClassName("selected");
                const endOffset = parseInt((event.target as HTMLSpanElement).getAttribute("data-offset")!);
                let startOffset = endOffset;
                if (selected.length !== 0) startOffset = parseInt((selected[selected.length - 1 ]as HTMLSpanElement).getAttribute("data-offset")!);
                this.multiSelect(createOffsetRange(startOffset, endOffset), true);
            } else if (multiSelect) {
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
        // We add the offset to the selection
        const selectedOffsets = WebViewStateManager.getProperty("selected_offsets");
        selectedOffsets.push(offset);
        WebViewStateManager.setProperty("selected_offsets", selectedOffsets);
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

    /**
     * @description Focuses the first element in the current selection based on the section passed in
     * @param section {"hex" | "ascii"} The section to place the focus
     */
    public static focusSelection(section: "hex" | "ascii"): void {
        const selection = document.getElementsByClassName(`selected ${section}`);
        if (selection.length !== 0) (selection[0] as HTMLSpanElement).focus();
    }

    /**
     * @description Retrieves the selection as a string, defaults to hex if there is no focus on either side
     * @returns {string} The selection represented as a string
     */
    public static getSelectedValue(): string {
        let selectedValue = "";
        let section = "hex";
        let selectedElements: HTMLCollectionOf<HTMLSpanElement>;
        if (document.activeElement?.classList.contains("ascii")) {
            section = "ascii";
            selectedElements = document.getElementsByClassName("selected ascii") as HTMLCollectionOf<HTMLSpanElement>;
        } else {
            selectedElements = document.getElementsByClassName("selected hex") as HTMLCollectionOf<HTMLSpanElement>; 
        }
        for (const element of selectedElements) {
            if (element.innerText === "+") continue;
            selectedValue += element.innerText;
            if (section === "hex") selectedValue += " ";
        }
        // If it's hex we want to remove the last space as it doesn't make sense
        // For ascii that space might have meaning
        if (section === "hex") selectedValue = selectedValue.trimRight();
        return selectedValue;
    }
}