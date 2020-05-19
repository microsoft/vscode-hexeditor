import { ByteData } from "./byteData";
import { hover, removeHover, select, arrowKeyNavigate, selectByOffset } from "./eventHandlers";

declare const acquireVsCodeApi: any;
export const vscode = acquireVsCodeApi();

// Pads a number with 0s up to a given width
function pad(number: string, width: number): string {
	number = number + "";
	return number.length >= width ? number : new Array(width - number.length + 1).join("0") + number;
}

// Takes the document data and populates the hex address column
function populateHexAddresses(data: ByteData[]): void {
	const num_columns = Math.ceil(data.length / 16);
	const hex_addr = document.getElementById("hexaddr");
	for (let i = 0; i < num_columns; i++) {
		const addr = document.createElement("div");
		addr.setAttribute("data-offset", (i * 16).toString());
		addr.innerText = pad((i * 16).toString(16), 8);
		hex_addr!.appendChild(addr);
	}
}

function populateAsciiTable(data: ByteData[]): void {
	const ascii_table = document.getElementById("ascii");
	for (let i = 0; i < data.length; i++) {
		const ascii_element = document.createElement("span");
		ascii_element.setAttribute("data-offset", i.toString());
		if (data[i].to8bitUInt() < 32 || data[i].to8bitUInt() >= 255) {
			ascii_element.classList.add("nongraphic");
			ascii_element.innerText = ".";
		} else {
			const ascii_char = String.fromCharCode(data[i].to8bitUInt());
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
function populateHexBody(data: ByteData[]): void {
	const hex_body = document.getElementById("hexbody");
	for (let i = 0; i < data.length; i++) {
		const hex_element = document.createElement("span");
		hex_element.setAttribute("data-offset",i.toString());
		hex_element.innerText = pad(data[i].toHex(), 2);
		hex_element.tabIndex = -1;
		hex_element.addEventListener("mouseover", hover);
		hex_element.addEventListener("mouseleave", removeHover);
		hex_element.addEventListener("click", select);
		hex_element.addEventListener("keydown", arrowKeyNavigate);
		hex_body!.appendChild(hex_element);
	}
}

function openAnyway(): void {
	vscode.postMessage({ type: "open-anyways" });
}


// Self executing anonymous function
// This is the main entry point
((): void=> {
    // Handle messages from the extension
    const data: ByteData[] = [];
	window.addEventListener("message", async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case "init":
				{
					// Loads the html body sent over
					if (body.html !== undefined) {
						document.getElementsByTagName("body")[0].innerHTML = body.html;
					}
					if (body.fileSize != 0 && body.value.data === undefined) {
						document.getElementsByTagName("body")[0].innerHTML = 
						`
							<div>
							<p>Opening this large file may cause instability. <a id="open-anyway" href="#">Open anyways</a></p>
							</div>
                        `;
                        // We construct the element right above this so it is definitely never null
						document.getElementById("open-anyway")!.addEventListener("click", openAnyway);
						return;
					}
					const numbers = new Uint8Array(body.value.data);
					for (const num of numbers) {
						data.push(new ByteData(num));
					}
					populateHexAddresses(data);
					populateAsciiTable(data);
					populateHexBody(data);
					if (vscode.getState() && vscode.getState().selected_offset) {
						selectByOffset(vscode.getState().selected_offset);
					}
					// Sets the height of the data inspector so it will scroll
					const hexEditorHeight = document.getElementById("hexaddr")!.clientHeight;
					document.getElementById("data-inspector")!.style.height = `${hexEditorHeight}px`;
					return;
				}
			case "getFileData":
				{
					vscode.postMessage({ type: "response", requestId, body: "foo" });
					return;
				}
		}
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: "ready" });
})();