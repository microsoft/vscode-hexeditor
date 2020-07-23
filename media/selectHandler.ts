// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getElementsWithGivenOffset, relativeComplement, binarySearch, disjunction } from "./util";
import { WebViewStateManager } from "./webviewStateManager";

export class SelectHandler {
    private _focus: number | undefined;
    private _selection: number[] = [];

    /**
     * @description Removes the selected class from all elements, this is helpful when ensuring only one byte and its associated decoded text is selected
     */
    public static clearSelected(): void {
        document.querySelectorAll(".selected").forEach(element => element.classList.remove("selected"));
        // Clear the webview's selection state
        WebViewStateManager.setProperty("selected_offsets", []);
    }

    /**
     * @description Given an offset selects the elements. This does not clear the previously selected elements.
     * @param {number} offset Offset to select
     * @param {boolean} force If force is not given, toggles selection. If force is true selects the element.
     * If force is false deselects the element.
     */
    private static toggleSelectOffset(offset: number, force?: boolean): void {
        const elements = getElementsWithGivenOffset(offset);
        if (elements.length === 0) {
            // Element may not be part of the DOM
            return;
        }
        elements[0].classList.toggle("selected", force);
        elements[1].classList.toggle("selected", force);
    }

    public getFocused(): number | undefined {
        return this._focus;
    }

    public setFocused(offset: number | undefined): void {
        this._focus = offset;
    }

    public getSelected(): number[] {
        return this._selection;
    }

    public setSelected(offsets: number[], forceRender = false): void {
        const oldSelection = this._selection;

        this._selection = [...offsets].sort((a: number, b: number) => a - b);
        WebViewStateManager.setProperty("selected_offsets", this._selection);

        const toRender = forceRender ? disjunction(oldSelection, this._selection) : relativeComplement(oldSelection, this._selection);
        this.renderSelection(toRender);
    }

    private renderSelection(offsets: number[]): void {
        const contains = (offset: number): boolean => binarySearch(this._selection, offset, (a: number, b: number) => a - b) >= 0;

        for (const offset of offsets) {
            SelectHandler.toggleSelectOffset(offset, contains(offset));
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
