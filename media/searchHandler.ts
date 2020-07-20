// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { messageHandler, virtualHexDocument } from "./hexEdit";
import { SelectHandler } from "./selectHandler";
import { hexQueryToArray } from "./util";

interface SearchOptions {
    regex: boolean;
    caseSensitive: boolean;
}

interface SearchResults {
    result: number[][];
    partial: boolean;
}

export class SearchHandler {
    private searchResults: number[][];
    private searchType: "hex" | "ascii" = "hex";
    private searchOptions: SearchOptions;
    private resultIndex = 0;
    private findTextBox: HTMLInputElement;
    private replaceTextBox: HTMLInputElement;
    private replaceButton: HTMLSpanElement;
    private replaceAllButton: HTMLSpanElement;
    private preserveCase = false;
    private findPreviousButton: HTMLSpanElement;
    private findNextButton: HTMLSpanElement;
    private stopSearchButton: HTMLSpanElement;

    constructor() {
        this.searchResults = [];
        this.searchOptions = {
            regex: false,
            caseSensitive: false
        };
        this.findTextBox = document.getElementById("find") as HTMLInputElement;
        this.replaceTextBox = document.getElementById("replace") as HTMLInputElement;
        this.replaceButton = document.getElementById("replace-btn") as HTMLSpanElement;
        this.replaceAllButton = document.getElementById("replace-all") as HTMLSpanElement;
        this.findPreviousButton = document.getElementById("find-previous") as HTMLSpanElement;
        this.findNextButton = document.getElementById("find-next") as HTMLSpanElement;
        this.stopSearchButton = document.getElementById("search-stop") as HTMLSpanElement;
        this.findNextButton.addEventListener("click", this.findNext.bind(this));
        this.findPreviousButton.addEventListener("click", this.findPrevious.bind(this));
        this.updateInputGlyphs();
        // Whenever the user changes the data type we update the type we're searching for and the glyphs on the input box
        document.getElementById("data-type")?.addEventListener("change", (event: Event) => {
            const selectedValue = (event.target as HTMLSelectElement).value as "hex" | "ascii";
            this.searchType = selectedValue;
            this.updateInputGlyphs();
            this.search();
        });
        
        this.searchOptionsHandler();
        this.replaceOptionsHandler();

        // When the user presses a key trigger a search
        this.findTextBox.addEventListener("keyup", this.search.bind(this));
        this.replaceTextBox.addEventListener("keyup", this.updateReplaceButtons.bind(this));
        this.replaceButton.addEventListener("click", () => this.replace(false));
        this.replaceAllButton.addEventListener("click", () => this.replace(true));
        this.stopSearchButton.addEventListener("click", this.cancelSearch.bind(this));
    }

    /**
     * @description Sends a search request to the exthost
     */
    private async search(): Promise<void> {
        // This gets called to cancel any searches that might be going on now
        this.cancelSearch();
        SelectHandler.clearSelected();
        this.searchResults = [];
        this.updateReplaceButtons();
        this.findNextButton.classList.add("disabled");
        this.findPreviousButton.classList.add("disabled");
        let query: string | string[] = this.findTextBox.value;
        query = this.searchType === "hex" ? hexQueryToArray(query) : query;
        if (query.length === 0) return;
        this.stopSearchButton.classList.remove("disabled");
        let results: number[][] = [];
        // This is wrapped in a try catch because if the message handler gets backed up this will reject
        try {
            results = (await messageHandler.postMessageWithResponse("search", {
                query: query,
                type: this.searchType,
                options: this.searchOptions
            }) as { results: SearchResults}).results.result;
        } catch {
            this.stopSearchButton.classList.add("disabled");
            return;
        }
        this.stopSearchButton.classList.add("disabled");
        this.resultIndex = 0;
        this.searchResults = results;
        // If we got results then we select the first result and unlock the buttons
        if (results.length !== 0) {
            await virtualHexDocument.scrollDocumentToOffset(this.searchResults[this.resultIndex][0]);
            SelectHandler.multiSelect(this.searchResults[this.resultIndex], false);
            // If there's more than one search result we unlock the find next button
            if (this.resultIndex + 1 < this.searchResults.length) {
                this.findNextButton.classList.remove("disabled");
            }
            this.updateReplaceButtons();
        }
    }
    
    /**
     * @description Handles when the user clicks the find next icon
     */
    private async findNext(): Promise<void> {
        // If the button is disabled then this function shouldn't work
        if (this.findNextButton.classList.contains("disabled")) return;
        await virtualHexDocument.scrollDocumentToOffset(this.searchResults[++this.resultIndex][0]);
        SelectHandler.multiSelect(this.searchResults[this.resultIndex], false);
        SelectHandler.focusSelection(this.searchType);
        // If there's more than one search result we unlock the find next button
        if (this.resultIndex < this.searchResults.length - 1) {
            this.findNextButton.classList.remove("disabled");
        } else {
            this.findNextButton.classList.add("disabled");
        }
        // We also unlock the find previous button if there is a previous
        if (this.resultIndex != 0) {
            this.findPreviousButton.classList.remove("disabled");
        }
    }

    /**
     * @description Handles when the user clicks the find previous icon
     */
    private async findPrevious(): Promise<void> {
        // If the button is disabled then this function shouldn't work
        if (this.findPreviousButton.classList.contains("disabled")) return;
        await virtualHexDocument.scrollDocumentToOffset(this.searchResults[--this.resultIndex][0]);
        SelectHandler.multiSelect(this.searchResults[this.resultIndex], false);
        SelectHandler.focusSelection(this.searchType);
        // If they pressed previous, they can always go next therefore we always unlock the next button
        this.findNextButton.classList.remove("disabled");
        // We lock the find previous if there isn't a previous anymore
        if (this.resultIndex == 0) {
            this.findPreviousButton.classList.add("disabled");
        }
    }

    /**
     * @description Handles when the user toggels between text and hex showing the input glyphs and ensureing correct padding
     */
    private updateInputGlyphs(): void {
        // The glyph icons that sit in the find and replace bar
        const inputGlyphs = document.getElementsByClassName("bar-glyphs") as HTMLCollectionOf<HTMLSpanElement>;
        const inputFields = document.querySelectorAll(".bar > .input-glyph-group > input") as NodeListOf<HTMLInputElement>;
        if (this.searchType == "hex") {
            inputGlyphs[0].hidden = true;
            inputGlyphs[1].hidden = true;
            document.documentElement.style.setProperty("--input-glyph-padding", "0px");
        } else {
            for (let i = 0; i < inputGlyphs.length; i++) {
                inputGlyphs[i].hidden = false;
            }
            const glyphRect = inputGlyphs[0].getBoundingClientRect();
            const inputRect = inputFields[0].getBoundingClientRect();
            // Calculates how much padding we should have so that the text doesn't run into the glyphs
            const inputPadding = (inputRect.x + inputRect.width + 1) - glyphRect.x;
            document.documentElement.style.setProperty("--input-glyph-padding", `${inputPadding}px`);
        }
    }

    /**
     * @description Handles listening to the search options and updating them
     */
    private searchOptionsHandler(): void {
        // Toggle Regex
        document.getElementById("regex-icon")?.addEventListener("click", (event: MouseEvent) => {
            const regexIcon = event.target as HTMLSpanElement;
            // The user is changing an option so we should trigger another search
            this.search();
            if (regexIcon.classList.contains("toggled")) {
                this.searchOptions.regex = false;
                regexIcon.classList.remove("toggled");
            } else {
                this.searchOptions.regex = true;
                regexIcon.classList.add("toggled");
            }
        });
        // Toggle case sensitive
        document.getElementById("case-sensitive")?.addEventListener("click", (event: MouseEvent) => {
            const caseSensitive = event.target as HTMLSpanElement;
            // The user is changing an option so we should trigger another search
            this.search();
            if (caseSensitive.classList.contains("toggled")) {
                this.searchOptions.caseSensitive = false;
                caseSensitive.classList.remove("toggled");
            } else {
                this.searchOptions.caseSensitive = true;
                caseSensitive.classList.add("toggled");
            }
        });
    }

    private replaceOptionsHandler(): void {
        // Toggle preserve case
        document.getElementById("preserve-case")?.addEventListener("click", (event: MouseEvent) => {
            const preserveCase = event.target as HTMLSpanElement;
            if (preserveCase.classList.contains("toggled")) {
                this.preserveCase = false;
                preserveCase.classList.remove("toggled");
            } else {
                this.preserveCase = true;
                preserveCase.classList.add("toggled");
            }
        });
    }

    /**
     * @description Handles when the user hits the stop search button
     */
    private cancelSearch(): void {
        if (this.stopSearchButton.classList.contains("disabled")) return;
        // We don't want the user to keep executing this, so we disable the button after the first search
        this.stopSearchButton.classList.add("disabled");
        // We send a cancellation message to the exthost, there's no need to  wait for a response
        // As we're not expecting anything back just to stop processing the search
        messageHandler.postMessageWithResponse("search", { cancel: true });
    }

    /**
     * @description Helper function which handles locking / unlocking the replace buttons
     */
    private updateReplaceButtons(): void {
        if (this.searchResults.length !== 0 && this.replaceTextBox.value.trim().length !== 0) {
            this.replaceAllButton.classList.remove("disabled");
            this.replaceButton.classList.remove("disabled");
        } else {
            this.replaceAllButton.classList.add("disabled");
            this.replaceButton.classList.add("disabled");
        }
    }

    /**
     * @description Handles when the user clicks replace or replace all
     * @param {boolean} all whether this is a normal replace or a replace all 
     */
    private async replace(all: boolean): Promise<void> {
        const replaceQuery = this.replaceTextBox.value;
        const replaceArray = this.searchType === "hex" ? hexQueryToArray(replaceQuery) : Array.from(replaceQuery);
        let replaceBits: number[] = [];
        // Since the exthost only holds data in 8 bit unsigned ints we must convert it back
        if (this.searchType === "hex") {
            replaceBits = replaceArray.map(val => parseInt(val, 16));
        } else {
            replaceBits = replaceArray.map(val => val.charCodeAt(0));
        }

        let offsets: number[][] = [];
        if (all) {
            offsets = this.searchResults;
        } else {
            offsets = [this.searchResults[this.resultIndex]];
        }

        const edits = (await messageHandler.postMessageWithResponse("replace", {
            query: replaceBits,
            offsets: offsets,
            preserveCase: false
        })).edits;
        // We can pass the size of the document back in because with the current implementation
        // The size of the document will never change as we only replace preexisting cells
        virtualHexDocument.redo(edits, virtualHexDocument.documentSize);
        this.findNext();
    }

    /**
     * @description Function responsible for handling when the user presses cmd / ctrl + f updating the widget and focusing it
     */
    public searchKeybindingHandler(): void {
        this.searchType = document.activeElement?.classList.contains("ascii") ? "ascii" : "hex";
        const dataTypeSelect = (document.getElementById("data-type") as HTMLSelectElement);
        dataTypeSelect.value = this.searchType;
        dataTypeSelect.dispatchEvent(new Event("change"));
        this.findTextBox.focus();
    }
}