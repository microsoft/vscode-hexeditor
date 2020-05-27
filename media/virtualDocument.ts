import { ByteData } from "./byteData";
import { withinAnyRange, generateCharacterRanges } from "./util";
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
    private data: VirtualizedPacket[];
    private rowHeight: number;
    private distanceBetweenRows: number;
    private documentHeight: number;
    private rows: HTMLDivElement[][];
    constructor(fileSize: number) {
        this.fileSize = fileSize;
        this.data = [];
        // This holds the 3 main columns rows (hexaddr, hexbody, ascii)
        this.rows = [[], [], []];
        // We create a span and place it on the DOM before removing it to get the height of a row
        const oldhtml = document.getElementById("hexbody")!.innerHTML;
        // We don't put the row class on this initial quick layout to do calculations as it will mess up our calculations due to the fact we use absolute positioning
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
        document.getElementsByTagName("html")[0].style.height = `${this.documentHeight}px`;

        // Sets the height of the data inspector so it will scroll
        document.getElementById("data-inspector")!.style.height = `${this.documentHeight}px`;
        document.getElementById("endianness")?.addEventListener("change", changeEndianness);

    }

    render(): void {
        this.populateHexAdresses();
        this.populateHexBody();
        this.populateAsciiTable();
        if (vscode.getState() && vscode.getState().selected_offset) {
            selectByOffset(vscode.getState().selected_offset);
        }
    }

    addPackets(newPackets: VirtualizedPacket[]): void {
        this.data = newPackets;
        this.render();
    }

    // Gets the number of rows that can fit in the viewport
    public get numRowsInViewport(): number {
        // The 60 here is used as padding for the scroll
        // This means we have 60 more rows than needed on the DOM to make it not seem super stuttery
        return Math.ceil(window.screen.height / this.rowHeight) + 60;
    }

    // Gets the offset of the item displayed at the top of the viewport
    public topOffset(): number {
        return (Math.ceil(window.scrollY / this.distanceBetweenRows) * 16);
    }

    public offsetYPos(offset: number): number {
        // The last addition piece is to account for the header and its 1px border
        // return (Math.floor(offset / 16) * this.distanceBetweenRows) + (this.distanceBetweenRows + 1);
        return (Math.floor(offset / 16) * this.distanceBetweenRows);
    }

    // Takes the document data and populates the hex address column
    private populateHexAdresses(): void {
        const num_columns = Math.ceil(this.data.length / 16);
        const hex_addr = document.getElementById("hexaddr");
        for (let i = this.data[0].offset; i < this.data[0].offset + num_columns; i++) {
            const addr = document.createElement("div");
            addr.className = "row";
            addr.setAttribute("data-offset", (i * 16).toString());
            addr.innerText = pad((i * 16).toString(16), 8).toUpperCase();
            addr.style.top = `${this.offsetYPos(i*16)}px`;
            hex_addr!.appendChild(addr);
            //addr.style.transform = `translateY(${this.offsetYPos(i*16)}px)`;
            this.rows[0].push(addr);
        }
    }

    private populateAsciiTable(): void {
        const ascii_table = document.getElementById("ascii");
        let row = document.createElement("div");
        row.className = "row";
        for (let i = 0; i < this.data.length; i++) {
            if (i % 16 === 0 && i !== 0) {
                // i-1 is needed because that's the last offset on that row, i in this case belongs to the next row
                row.style.top = `${this.offsetYPos(this.data[i-1].offset)}px`;
                ascii_table?.appendChild(row);
                this.rows[2].push(row);
                row = document.createElement("div");
                row.className = "row";
            }
            const ascii_element = document.createElement("span");
            ascii_element.setAttribute("data-offset", this.data[i].offset.toString());
            if (withinAnyRange(this.data[i].data.to8bitUInt(), generateCharacterRanges())) {
                ascii_element.classList.add("nongraphic");
                ascii_element.innerText = ".";
            } else {
                const ascii_char = String.fromCharCode(this.data[i].data.to8bitUInt());
                ascii_element.innerText = ascii_char;
            }
            ascii_element.tabIndex = -1;
            ascii_element.addEventListener("keydown", arrowKeyNavigate);
            ascii_element.addEventListener("mouseover", hover);
            ascii_element.addEventListener("mouseleave", removeHover);
            ascii_element.addEventListener("click", select);
            row.appendChild(ascii_element);
        }
        // There will always be one unappended row left so we must do that after the loop
        row.style.top = `${this.offsetYPos(this.data[this.data.length-1].offset)}px`;
        ascii_table?.appendChild(row);
        this.rows[2].push(row);
    }

    // Takes the byte stream and populates the webview with the hex information
    private populateHexBody(): void {
        const hex_body = document.getElementById("hexbody");
        let row = document.createElement("div");
        row.className = "row";
        for (let i = 0; i < this.data.length; i++) {
            if (i % 16 === 0 && i !== 0) {
                // i-1 is needed because that's the last offset on that row, i in this case belongs to the next row
                row.style.top = `${this.offsetYPos(this.data[i-1].offset)}px`;
                hex_body?.appendChild(row);
                this.rows[1].push(row);
                row = document.createElement("div");
                row.className = "row";
            }
            const hex_element = document.createElement("span");
            hex_element.setAttribute("data-offset", this.data[i].offset.toString());
            hex_element.innerText = pad(this.data[i].data.toHex(), 2);
            hex_element.tabIndex = -1;
            hex_element.addEventListener("mouseover", hover);
            hex_element.addEventListener("mouseleave", removeHover);
            hex_element.addEventListener("click", select);
            hex_element.addEventListener("keydown", arrowKeyNavigate);
            row.appendChild(hex_element);
        }
        row.style.top = `${this.offsetYPos(this.data[this.data.length-1].offset)}px`;
        hex_body?.appendChild(row);
        this.rows[1].push(row);
    }
}