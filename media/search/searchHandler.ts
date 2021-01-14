// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { MessageHandler } from "../common/messageHandler";
import { clearEditorSelection, editorFindNext, editorFindPrev } from "./editorActions";

/**
 * @description Converts a hex query to a string array ignoring spaces, if not evenly divisible we append a leading 0 
 * i.e A -> 0A
 * @param {string} query The query to convert to an array
 * @returns The hex query as an array
 */
function hexQueryToArray(query: string): string[] {
    let currentCharacterSequence = "";
    const queryArray: string[] = [];
    for (let i = 0; i < query.length; i++) {
        if (query[i] === " ") continue;
        currentCharacterSequence += query[i];
        if (currentCharacterSequence.length === 2) {
            queryArray.push(currentCharacterSequence);
            currentCharacterSequence = "";
        }
    }
    if (currentCharacterSequence.length > 0)  {
        queryArray.push("0" + currentCharacterSequence);
    }
    return queryArray;
}

// The possible message types the search widget will send
enum SearchMessageTypes {
    CANCEL = "cancel",
    SEARCH = "search",
    REPLACE = "replace",
    REPLACE_ALL = "replaceAll"
}

interface SearchOptions {
    regex: boolean;
    caseSensitive: boolean;
}

/**
 * These are what the widget knows about the returned search results.
 * The actual search results are stored in the exthost and streamed to the editor
*/ 
interface LiteSearchResults {
    numResults: number;
    partial: boolean;
}

export class SearchHandler {
    private searchResults: LiteSearchResults;
    private searchType: "hex" | "ascii" = "hex";
    private searchOptions: SearchOptions;
    private findTextBox: HTMLInputElement;
    private replaceTextBox: HTMLInputElement;
    private replaceButton: HTMLSpanElement;
    private replaceAllButton: HTMLSpanElement;
    private preserveCase = false;
    private findPreviousButton: HTMLSpanElement;
    private findNextButton: HTMLSpanElement;
    private stopSearchButton: HTMLSpanElement;

    constructor(private _messageHandler: MessageHandler) {
        this.searchResults = {
            numResults: 0,
            partial: false
        };
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
        this.findNextButton.addEventListener("click", () => this.findNext(true));
        this.findPreviousButton.addEventListener("click", () => this.findPrevious(true));
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
        this.findTextBox.addEventListener("keyup", (event: KeyboardEvent) => {
            // Some VS Code keybinding defualts for find next, find previous, and focus restore
            if ((event.key === "Enter" || event.key === "F3") && event.shiftKey) {
                this.findPrevious(false);
            } else if (event.key === "Enter" || event.key === "F3") {
                this.findNext(false);
            } else if (event.key === "Escape") {
                // Pressing escape returns focus to the editor
                const selected = document.getElementsByClassName(`selected ${this.searchType}`)[0] as HTMLSpanElement | undefined;
                if (selected !== undefined) {
                    selected.focus();
                } else {
                    // virtualHexDocument.focusElementWithGivenOffset(virtualHexDocument.topOffset());
                }
            } else if (event.ctrlKey || new RegExp("(^Arrow|^End|^Home)", "i").test(event.key)) {
                // If it's any sort of navigation key we don't want to trigger another search as nothing has changed
                return;
            } else {
                this.search();
            }
        });
        window.addEventListener("keyup", (event: KeyboardEvent) => {
            // Fin previous + find next when widget isn't focused
            if (event.key === "F3" && event.shiftKey && document.activeElement !== this.findTextBox) {
                this.findPrevious(true);
                event.preventDefault();
            } else if (event.key === "F3" && document.activeElement !== this.findTextBox) {
                this.findNext(true);
                event.preventDefault();
            }
        });

        this.replaceTextBox.addEventListener("keyup", this.updateReplaceButtons.bind(this));
        this.replaceButton.addEventListener("click", () => this.replace(false));
        this.replaceAllButton.addEventListener("click", () => this.replace(true));
        this.stopSearchButton.addEventListener("click", this.cancelSearch.bind(this));
        // Hide the message boxes for now as at first we have no messages to display
        document.getElementById("find-message-box")!.hidden = true;
        document.getElementById("replace-message-box")!.hidden = true;

    }

    /**
     * @description Sends a search request to the exthost
     */
    private async search(): Promise<void> {
        // If the box is empty no need to display any warnings
        if (this.findTextBox.value === "") this.removeInputMessage("find");
        // This gets called to cancel any searches that might be going on now
        this.cancelSearch();
        // We are starting a new search so we should clear the current selection on the editor
        clearEditorSelection(this._messageHandler);
        this.updateReplaceButtons();
        this.findNextButton.classList.add("disabled");
        this.findPreviousButton.classList.add("disabled");
        let query: string | string[] = this.findTextBox.value;
        const hexSearchRegex = new RegExp("^[a-fA-F0-9? ]+$");
        // We check to see if the hex is a valid query else we don't allow a search
        if (this.searchType === "hex" && !hexSearchRegex.test(query)) {
            if (query.length > 0) this.addInputMessage("find", "Invalid query", "error");
            return;
        }
        // Test if it's a valid regex
        if (this.searchOptions.regex) {
            try {
                new RegExp(query);
            } catch (err) {
                // Split up the error message to fit in the box. In the future we might want the box to do word wrapping
                // So that it's not a manual endeavor
                const message = (err.message as string).substr(0, 27) + "\n" + (err.message as string).substr(27);
                this.addInputMessage("find", message, "error");
                return;
            }
        }
        query = this.searchType === "hex" ? hexQueryToArray(query) : query;
        if (query.length === 0) {
            // If the user didn't type anything and its just a blank query we don't want to error on them
            if (this.findTextBox.value.length > 0) this.addInputMessage("find", "Invalid query", "error");
            return;
        }
        this.stopSearchButton.classList.remove("disabled");
        this.removeInputMessage("find");
        // This is wrapped in a try catch because if the message handler gets backed up this will reject
        try {
            this.searchResults = (await this._messageHandler.postMessageWithResponse(SearchMessageTypes.SEARCH, {
                query: query,
                type: this.searchType,
                options: this.searchOptions
            }) as { results: LiteSearchResults}).results;
        } catch(err) {
            this.stopSearchButton.classList.add("disabled");
            this.addInputMessage("find", "Search returned an error!", "error");
            return;
        }
        if (this.searchResults.partial) {
            this.addInputMessage("find", "Partial results returned, try\n narrowing your query.", "warning");
        }
        this.stopSearchButton.classList.add("disabled");
    }

    /**
     * @description Handles when the user clicks the find next icon
     * @param {boolean} focus Whether or not to focus the selection
     */
    private async findNext(focus: boolean): Promise<void> {
        // If the button is disabled then this function shouldn't work
        if (this.findNextButton.classList.contains("disabled")) return;
        const currentResultIndex = await editorFindNext(this._messageHandler, focus);
        // If there's more than one search result we unlock the find next button
        if (currentResultIndex < this.searchResults.numResults - 1) {
            this.findNextButton.classList.remove("disabled");
        } else {
            this.findNextButton.classList.add("disabled");
        }
        // We also unlock the find previous button if there is a previous
        if (currentResultIndex != 0) {
            this.findPreviousButton.classList.remove("disabled");
        }
    }

    /**
     * @description Handles when the user clicks the find previous icon
     * @param {boolean} focus Whether or not to focus the selection
     */
    private async findPrevious(focus: boolean): Promise<void> {
        // If the button is disabled then this function shouldn't work
        if (this.findPreviousButton.classList.contains("disabled")) return;
        const currentResultIndex = await editorFindPrev(this._messageHandler, focus);
        // If they pressed previous, they can always go next therefore we always unlock the next button
        this.findNextButton.classList.remove("disabled");
        // We lock the find previous if there isn't a previous anymore
        if (currentResultIndex == 0) {
            this.findPreviousButton.classList.add("disabled");
        }
    }

    /**
     * @description Handles when the user toggles between text and hex showing the input glyphs and ensureing correct padding
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
            if (regexIcon.classList.contains("toggled")) {
                this.searchOptions.regex = false;
                regexIcon.classList.remove("toggled");
            } else {
                this.searchOptions.regex = true;
                regexIcon.classList.add("toggled");
            }
            // The user is changing an option so we should trigger another search
            this.search();
        });
        // Toggle case sensitive
        document.getElementById("case-sensitive")?.addEventListener("click", (event: MouseEvent) => {
            const caseSensitive = event.target as HTMLSpanElement;
            if (caseSensitive.classList.contains("toggled")) {
                this.searchOptions.caseSensitive = false;
                caseSensitive.classList.remove("toggled");
            } else {
                this.searchOptions.caseSensitive = true;
                caseSensitive.classList.add("toggled");
            }
            // The user is changing an option so we should trigger another search
            this.search();
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
        // We don't want the user to keep executing this, so we disable the button after the first time they click cancel
        this.stopSearchButton.classList.add("disabled");
        // We send a cancellation message to the exthost, to stop processing the current search results
        this._messageHandler.postMessage(SearchMessageTypes.CANCEL);

    }

    /**
     * @description Helper function which handles locking / unlocking the replace buttons
     */
    private updateReplaceButtons(): void {
        this.removeInputMessage("replace");
        const hexReplaceRegex = new RegExp("^[a-fA-F0-9]+$");
        // If it's not a valid hex query we lock the buttons, we remove whitespace from the string to simplify the regex
        const queryNoSpaces = this.replaceTextBox.value.replace(/\s/g, "");
        if (this.searchType === "hex" && !hexReplaceRegex.test(queryNoSpaces)) {
            this.replaceAllButton.classList.add("disabled");
            this.replaceButton.classList.add("disabled");
            if (this.replaceTextBox.value.length > 0) this.addInputMessage("replace", "Invalid replacement", "error");
            return;
        }
        const replaceQuery = this.replaceTextBox.value;
        const replaceArray = this.searchType === "hex" ? hexQueryToArray(replaceQuery) : Array.from(replaceQuery);
        if (this.searchResults.numResults !== 0 && replaceArray.length !== 0) {
            this.replaceAllButton.classList.remove("disabled");
            this.replaceButton.classList.remove("disabled");
        } else {
            if (this.replaceTextBox.value.length > 0 && replaceArray.length === 0) this.addInputMessage("replace", "Invalid replacement", "error");
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

        const searchRequestMethod = all ? SearchMessageTypes.REPLACE_ALL : SearchMessageTypes.REPLACE;
        this._messageHandler.postMessage(searchRequestMethod, {
            query: replaceBits,
            preserveCase: this.preserveCase
        });

        this.findNext(true);
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

    /**
     * @description Adds an warning / error message to the input box passed in
     * @param {"find" | "replace"} inputBoxName Whether it's the find input box or the replace input box
     * @param {string} message The message to display
     * @param {"error" | "warning"} type Whether it's an error message or a warning message
     */
    private addInputMessage(inputBoxName: "find" | "replace", message: string, type: "error" | "warning"): void {
        const inputBox: HTMLInputElement = inputBoxName === "find" ? this.findTextBox : this.replaceTextBox;
        const messageBox = document.getElementById(`${inputBoxName}-message-box`) as HTMLDivElement;
        // We try to do the least amount of DOM changing as to reduce the flashing the user sees
        if (messageBox.innerText === message && messageBox.classList.contains(`input-${type}`)) {
            return;
        } else if (messageBox.classList.contains(`input-${type}`)) {
            messageBox.innerText = message;
            return;
        } else {
            this.removeInputMessage("find", true);
            messageBox.innerText = message;
            // Add the classes for proper styling of the message
            inputBox.classList.add(`${type}-border`);
            messageBox.classList.add(`${type}-border`, `input-${type}`);
            messageBox.hidden = false;
        }
    }

    /**
     * @description Removes the warning / error message
     * @param {"find" | "replace"} inputBoxName Which input box to remove the message from
     * @param {boolean | undefined} skipHiding Whether we want to skip hiding the empty message box, this is useful for clearing the box to add new text
     */
    private removeInputMessage(inputBoxName: "find" | "replace", skipHiding?: boolean): void {
        const inputBox: HTMLInputElement = inputBoxName === "find" ? this.findTextBox : this.replaceTextBox;
        const errorMessageBox = document.getElementById(`${inputBoxName}-message-box`) as HTMLDivElement;
        // Add the classes for proper styling of the message
        inputBox.classList.remove("error-border", "warning-border");
        errorMessageBox.classList.remove("error-border", "warning-border", "input-warning", "input-error");
        if (skipHiding !== true) errorMessageBox.hidden = true;
    }
}