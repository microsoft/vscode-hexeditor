// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { retrieveSelectedByteObject, getElementsWithGivenOffset, IRange } from "./util";
import { WebViewStateManager } from "./webviewStateManager";
import { clearDataInspector, populateDataInspector } from "./dataInspector";

export class SelectHandler {

    public isDragging = false;
    public clearSelectionClick: boolean = false;
    public clearSelectionDrag: boolean = false;
    public rangeStartOffset: number | undefined;
    public oldRangeEndOffset: number | undefined;

    constructor() { }

    /**
     * @description Removes the selected class from all elements, this is helpful when ensuring only one byte and its associated decoded text is selected
     */
    public static clearSelected(): void {
        document.querySelectorAll(".selected").forEach(element => element.classList.remove("selected"));
    }

    /**
     * @description Given an offset selects the elements. This does not clear the previously selected elements.
     * @param {number} offset Offset to select
     */
    private static toggleSelectOffset(offset: number, force?: boolean): boolean {
        const elements = getElementsWithGivenOffset(offset);
        const isSelected = elements[0].classList.toggle("selected", force);
        elements[1].classList.toggle("selected", force);
        return isSelected;
    }

    /**
     * @description Given an offset, selects the hex and ascii element
     * @param {number} offset  The offset of the element you want to select
     */
    public static singleSelect(offset: number): boolean {
        // SelectHandler.clearSelected();
        const isSelected = SelectHandler.toggleSelectOffset(offset);
        if (isSelected) {
            WebViewStateManager.setProperty("selected_offset", offset);
            const elements = getElementsWithGivenOffset(offset);
            const byte_obj = retrieveSelectedByteObject(elements)!;
            const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
            populateDataInspector(byte_obj, littleEndian);
        } else {
            WebViewStateManager.setProperty("selected_offset", undefined);
            clearDataInspector();
            // (document.activeElement as HTMLElement)?.blur();
        }
        return isSelected;
    }

    /**
     * @description Given a range offset, selects the hex and ascii elements
     * @param {IRange} newRange  The new range to select
     * @param {IRange} oldRange  The previous selected range, used for optimization
     * of selection and deselection of elements
     */
    public static rangeSelect(newRange: IRange, oldRange?: IRange): void {
        if (newRange.start !== oldRange?.start && newRange.start !== oldRange?.end && newRange.end !== oldRange?.start && newRange.end !== oldRange?.end) {
            oldRange = undefined;
        }

        let selectStart: number | undefined = newRange.start;
        let selectEnd: number | undefined = newRange.end;
        if (oldRange) {
            let deselectStart: number | undefined;
            let deselectEnd: number | undefined;

            if (newRange.start === oldRange.start) {
                /**
                 * N: new cell | S: pivot cell | O: old cell
                 * New range : S->N | Old range : S->O
                 *
                 * *S*****
                 * ***O**N
                 */
                if (newRange.end < oldRange.end) {
                    deselectStart = newRange.end + 1;
                    deselectEnd = oldRange.end;

                    selectStart = undefined;
                    selectEnd = undefined;
                } else if (newRange.end > oldRange.end) {
                    selectStart = oldRange.end + 1;
                    selectEnd = newRange.end;
                } else {
                    selectStart = undefined;
                    selectEnd = undefined;
                }
            } else if (newRange.end === oldRange.start) {
                /**
                 * N: new cell | S: pivot cell | O: old cell
                 * New range : N->S | Old range : S->O
                 *
                 * ***N*S*
                 * ***O***
                 */
                deselectStart = newRange.end + 1;
                deselectEnd = oldRange.end;

                selectStart = newRange.start;
                selectEnd = newRange.end - 1;
            } else if (newRange.start === oldRange.end) {
                /**
                 * N: new cell | S: pivot cell | O: old cell
                 * New range : S->N | Old range : O->S
                 *
                 * ***O***
                 * *S*N***
                 */
                deselectStart = oldRange.start;
                deselectEnd = oldRange.end - 1;

                selectStart = newRange.start + 1;
                selectEnd = newRange.end;
            } else if (newRange.end === oldRange.end) {
                /**
                 * N: new cell | S: pivot cell | O: old cell
                 * New range : N->S | Old range : O->S
                 *
                 * N**O***
                 * *****S*
                 */
                if (newRange.start > oldRange.start) {
                    deselectStart = oldRange.start;
                    deselectEnd = newRange.start - 1;

                    selectStart = undefined;
                    selectEnd = undefined;
                } else if (newRange.start < oldRange.start) {
                    selectStart = newRange.start;
                    selectEnd = oldRange.start - 1;
                } else {
                    selectStart = undefined;
                    selectEnd = undefined;
                }
            }

            if (deselectStart !== undefined && deselectEnd !== undefined) {
                while (deselectStart <= deselectEnd) {
                    SelectHandler.toggleSelectOffset(deselectStart, false);
                    deselectStart++;
                }
            }
        }

        if (selectStart !== undefined && selectEnd !== undefined) {
            while (selectStart <= selectEnd) {
                SelectHandler.toggleSelectOffset(selectStart, true);
                selectStart++;
            }
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
