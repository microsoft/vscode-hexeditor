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
    private bodyTemplate: string;
    constructor(fileSize: number, body: string) {
        this.fileSize = fileSize;
        this.data = [];
        this.bodyTemplate = body;
        // We create a span and place it on the DOM before removing it to get the height of a row
        const oldhtml = document.getElementById("hexbody")!.innerHTML;
        for (let i = 0; i < 17; i++) {
            const hex_element = document.createElement("span");
            hex_element.innerText = "FF";
            
            document.getElementById("hexbody")?.appendChild(hex_element);
        }
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
        document.getElementsByTagName("body")[0].innerHTML = this.bodyTemplate;
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
        return Math.floor(offset / 16) * this.rowHeight;
    }

    // Takes the document data and populates the hex address column
    private populateHexAdresses(): void {
        const num_columns = Math.ceil(this.data.length / 16);
        const hex_addr = document.getElementById("hexaddr");
        for (let i = this.data[0].offset; i < this.data[0].offset + num_columns; i++) {
            const addr = document.createElement("div");
            addr.setAttribute("data-offset", (i * 16).toString());
            addr.innerText = pad((i * 16).toString(16), 8).toUpperCase();
            hex_addr!.appendChild(addr);
        }
    }

    private populateAsciiTable(): void {
        const ascii_table = document.getElementById("ascii");
        for (const packet of this.data) {
            const ascii_element = document.createElement("span");
            ascii_element.setAttribute("data-offset", packet.offset.toString());
            if (withinAnyRange(packet.data.to8bitUInt(), generateCharacterRanges())) {
                ascii_element.classList.add("nongraphic");
                ascii_element.innerText = ".";
            } else {
                const ascii_char = String.fromCharCode(packet.data.to8bitUInt());
                ascii_element.innerText = ascii_char;
            }
            ascii_element.tabIndex = -1;
            ascii_element.addEventListener("keydown", arrowKeyNavigate);
            ascii_element.addEventListener("mouseover", hover);
            ascii_element.addEventListener("mouseleave", removeHover);
            ascii_element.addEventListener("click", select);
            ascii_table!.appendChild(ascii_element);
        }
    }

    // Takes the byte stream and populates the webview with the hex information
    private populateHexBody(): void {
        const hex_body = document.getElementById("hexbody");
        for (const packet of this.data) {
            const hex_element = document.createElement("span");
            hex_element.setAttribute("data-offset", packet.offset.toString());
            hex_element.innerText = pad(packet.data.toHex(), 2);
            hex_element.tabIndex = -1;
            hex_element.addEventListener("mouseover", hover);
            hex_element.addEventListener("mouseleave", removeHover);
            hex_element.addEventListener("click", select);
            hex_element.addEventListener("keydown", arrowKeyNavigate);
            hex_body!.appendChild(hex_element);
        }
    }
}