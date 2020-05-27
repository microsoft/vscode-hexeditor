import { ByteData } from "./byteData";
import { withinAnyRange, generateCharacterRanges, elementInViewport } from "./util";
import { arrowKeyNavigate, hover, removeHover, select, selectByOffset, changeEndianness } from "./eventHandlers";
import { vscode } from "./hexEdit";


// Pads a number with 0s up to a given width
function pad(number: string, width: number): string {
	number = number + "";
	return number.length >= width ? number : new Array(width - number.length + 1).join("0") + number;
}



export interface VirtualizedPacket {
    offset: number;
    data: ByteData;
}

// Class which handles the virtualization of the hex document
export class VirtualDocument {
    private fileSize: number;
    private rowHeight: number;
    private distanceBetweenRows: number;
    private documentHeight: number;
    private rows: Map<string, HTMLDivElement>[];
    private previousScrollY = 0;
    private _scrollDirection: "down" | "up" = "down";
    constructor(fileSize: number) {
        this.fileSize = fileSize;
        // This holds the 3 main columns rows (hexaddr, hexbody, ascii)
        this.rows = [];
        for (let i = 0; i < 3; i++) {
            this.rows.push(new Map<string, HTMLDivElement>());
        }
        // We create a span and place it on the DOM before removing it to get the height of a row
        const oldhtml = document.getElementById("hexbody")!.innerHTML;
        let row = document.createElement("div");
        for (let i = 0; i < 17; i++) {
            if (i % 16 == 0) {
                document.getElementById("hexbody")?.appendChild(row);
                row = document.createElement("div");
            }
            const hex_element = document.createElement("span");
            hex_element.innerText = "FF";
            row.appendChild(hex_element);
        }
        document.getElementById("hexbody")?.appendChild(row);
        const spans = document.getElementsByTagName("span");
        this.rowHeight = spans[16].offsetHeight;
        this.distanceBetweenRows = spans[32].getBoundingClientRect().y - spans[16].getBoundingClientRect().y;
        document.getElementById("hexbody")!.innerHTML = oldhtml;
        
        // Calculate document height
        this.documentHeight = document.getElementById("hexbody")!.offsetHeight + (Math.ceil(this.fileSize / 16) * this.rowHeight);

        // Sets the columns heights for sticky scrolling to work
        const columns = document.getElementsByClassName("column") as HTMLCollectionOf<HTMLElement>;
        for (const column of columns) {
            column.style.height = `${this.documentHeight}px`;
        }

        document.getElementById("endianness")?.addEventListener("change", changeEndianness);

    }

    render(newPackets: VirtualizedPacket[]): void {
        let rowData: VirtualizedPacket[] = [];
        for (let i = 0; i < newPackets.length; i++) {
            if (i === newPackets.length - 1 || (i % 16 === 0 && i !== 0)) {
                if (!this.rows[0].get(rowData[0].offset.toString())) {
                    this.populateHexAdresses(rowData);
                    this.populateHexBody(rowData);
                    this.populateAsciiTable(rowData);
                }
                rowData = [];
            }
            rowData.push(newPackets[i]);
        }

        if (vscode.getState() && vscode.getState().selected_offset) {
            selectByOffset(vscode.getState().selected_offset);
        }
        // After rendering we move the rows around
        // this.rows[0].forEach((value: HTMLDivElement, key: string) => {
        //     const offset = parseInt(key);
        //     this.translateRow(value, offset);
        //     this.translateRow(this.rows[1].get(key)!, offset);
        //     this.translateRow(this.rows[2].get(key)!, offset);
        // });
    }

    updateScrollDirection(newScrollY: number): void {
        if (newScrollY > this.previousScrollY) {
            this._scrollDirection = "down";
        } else {
            this._scrollDirection = "up";
        }
        this.previousScrollY = newScrollY;
    }

    // Gets the number of rows that can fit in the viewport
    public get numRowsInViewport(): number {
        // The 60 here is used as padding for the scroll
        // This means we have 60 more rows than needed on the DOM to make it not seem super stuttery
        return Math.ceil(window.screen.height / this.rowHeight) + 60;
    }

    public get scrollDirection(): "up" | "down" {
        return this._scrollDirection;
    }

    // Gets the offset of the item displayed at the top of the viewport
    public topOffset(): number {
        return (Math.floor(window.scrollY / this.distanceBetweenRows) * 16);
    }

    // Gets the offset of the item displayed at the bottom of the viewport
    public bottomOffset(): number {
        return (Math.floor(window.scrollY + window.screen.height) / this.distanceBetweenRows) * 16;
    }

    public offsetYPos(offset: number): number {
        // The last addition piece is to account for the header and its 1px border
        // return (Math.floor(offset / 16) * this.distanceBetweenRows) + (this.distanceBetweenRows + 1);
        return (Math.floor(offset / 16) * this.distanceBetweenRows);
    }

    // removes elements that are not in the viewport
    // Optimized to stop when it reaches the edge of a viewport
    public removeElementsNotInViewPort(): number {
        let removed = 0;
        const elementsToRemove: string[] = [];
        let keys = Array.from(this.rows[0].keys());
        if (this.scrollDirection === "up") {
            keys = keys.reverse();
        }
        for(const key of keys) {
            const rowElement = this.rows[0].get(key);
            if (!elementInViewport(rowElement!)) {
                elementsToRemove.push(key);
                removed++;
            } else {
                break;
            }
        }
        // Remove the rows from the virtual document
        for (let i = 0; i  < removed; i++) {
            this.rows[0].get(elementsToRemove[i])?.remove();
            this.rows[0].delete(elementsToRemove[i]);
            this.rows[1].get(elementsToRemove[i])?.remove();
            this.rows[1].delete(elementsToRemove[i]);
            this.rows[2].get(elementsToRemove[i])?.remove();
            this.rows[2].delete(elementsToRemove[i]);
        }
        return removed;
    }

    // Takes the document data and populates the hex address column
    private populateHexAdresses(rowData: VirtualizedPacket[]): void {
        const hex_addr = document.getElementById("hexaddr");
        const offset = rowData[0].offset;
        const addr = document.createElement("div");
        addr.className = "row";
        addr.setAttribute("data-offset", offset.toString());
        addr.innerText = pad(offset.toString(16), 8).toUpperCase();
        hex_addr!.appendChild(addr);
        this.rows[0].set(offset.toString(), addr);
        this.translateRow(addr, offset);
    }

    private populateAsciiTable(rowData: VirtualizedPacket[]): void {
        const ascii_table = document.getElementById("ascii");
        const row = document.createElement("div");
        row.className = "row";
        const rowOffset = rowData[0].offset.toString();
        for (let i = 0; i < rowData.length; i++) {
            const ascii_element = document.createElement("span");
            ascii_element.setAttribute("data-offset", rowData[i].offset.toString());
            if (withinAnyRange(rowData[i].data.to8bitUInt(), generateCharacterRanges())) {
                ascii_element.classList.add("nongraphic");
                ascii_element.innerText = ".";
            } else {
                const ascii_char = String.fromCharCode(rowData[i].data.to8bitUInt());
                ascii_element.innerText = ascii_char;
            }
            ascii_element.tabIndex = -1;
            ascii_element.addEventListener("keydown", arrowKeyNavigate);
            ascii_element.addEventListener("mouseover", hover);
            ascii_element.addEventListener("mouseleave", removeHover);
            ascii_element.addEventListener("click", select);
            row.appendChild(ascii_element);
        }
        ascii_table?.appendChild(row);
        this.rows[2].set(rowOffset, row);
        this.translateRow(row, parseInt(rowOffset));
    }

    // Takes the byte stream and populates the webview with the hex information
    private populateHexBody(rowData: VirtualizedPacket[]): void {
        const hex_body = document.getElementById("hexbody");
        const row = document.createElement("div");
        row.className = "row";
        const rowOffset = rowData[0].offset.toString();
        for (let i = 0; i < rowData.length; i++) {
            const hex_element = document.createElement("span");
            hex_element.setAttribute("data-offset", rowData[i].offset.toString());
            hex_element.innerText = pad(rowData[i].data.toHex(), 2);
            hex_element.tabIndex = -1;
            hex_element.addEventListener("mouseover", hover);
            hex_element.addEventListener("mouseleave", removeHover);
            hex_element.addEventListener("click", select);
            hex_element.addEventListener("keydown", arrowKeyNavigate);
            row.appendChild(hex_element);
        }
        hex_body?.appendChild(row);
        this.rows[1].set(rowOffset, row);
        this.translateRow(row, parseInt(rowOffset));
    }

    // Translates the row to its expected position
    private translateRow(row: HTMLDivElement, offset: number): void {
        const rowY = row.getBoundingClientRect().y;
        // Add rowheight to account for the headers
        const expectedY = this.offsetYPos(offset) + (document.getElementsByClassName("header")[2] as HTMLElement).offsetHeight;
        row.style.transform = `translateY(${expectedY - rowY}px)`;
    }
}