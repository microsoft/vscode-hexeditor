import { messageHandler } from "./hexEdit";
import { SelectHandler } from "./selectHandler";

export class SearchHandler {
    private searchResults: number[][];
    private resultIndex = 0;
    private findTextBox: HTMLInputElement;
    private findButton: HTMLButtonElement;
    private findPreviousButton: HTMLButtonElement;
    private findNextButton: HTMLButtonElement;
    constructor() {
        this.searchResults = [];
        this.findTextBox = document.getElementById("find") as HTMLInputElement;
        this.findButton = document.getElementById("find-button") as HTMLButtonElement;
        this.findPreviousButton = document.getElementById("find-previous") as HTMLButtonElement;
        this.findNextButton = document.getElementById("find-next") as HTMLButtonElement;
        this.findButton.addEventListener("click", this.search.bind(this));
        this.findNextButton.addEventListener("click", this.findNext.bind(this));
        this.findPreviousButton.addEventListener("click", this.findPrevious.bind(this));
    }

    private async search(): Promise<void> {
        const query = this.findTextBox.value;
        if (query.length === 0) return;
        SelectHandler.clearSelected();
        this.findButton.disabled = true;
        this.findNextButton.disabled = true;
        this.findPreviousButton.disabled = true;
        const results = (await messageHandler.postMessageWithResponse("search", {
            query: query,
            type: (document.getElementById("data-type") as HTMLSelectElement).value
        })).results;
        this.resultIndex = 0;
        this.findButton.disabled = false;
        console.log(results);
        this.searchResults = results;
        // If we got results then we select the first result and unlock the buttons
        if (results.length > 0) {
            SelectHandler.multiSelect(this.searchResults[this.resultIndex], false);
            // If there's more than one search result we unlock the find next button
            if (this.resultIndex < this.searchResults.length) {
                this.findNextButton.disabled = false;
            } 
        }
    }
    
    private findNext(): void {
        // If the button is disabled then this function shouldn't work
        if (this.findNextButton.disabled) return;
        SelectHandler.multiSelect(this.searchResults[++this.resultIndex], false);
        // If there's more than one search result we unlock the find next button
        if (this.resultIndex < this.searchResults.length - 1) {
            this.findNextButton.disabled = false;
        } else {
            this.findNextButton.disabled = true;
        }
        // We also unlock the find previous button if there is a previous
        if (this.resultIndex != 0) {
            this.findPreviousButton.disabled = false;
        }
    }

    private findPrevious(): void {
        // If the button is disabled then this function shouldn't work
        if (this.findPreviousButton.disabled) return;
        SelectHandler.multiSelect(this.searchResults[--this.resultIndex], false);
        // If they pressed previous, they can always go next therefore we always unlock the next button
        this.findNextButton.disabled = false;
        // We lock the find previous if there isn't a previous anymore
        if (this.resultIndex == 0) {
            this.findPreviousButton.disabled = true;
        }
    }
}