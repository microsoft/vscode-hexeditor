import { ByteData } from "./byteData";
import { debounce } from "ts-debounce";
import { VirtualDocument, VirtualizedPacket } from "./virtualDocument";
import { scrollHandler } from "./eventHandlers";

declare const acquireVsCodeApi: any;
export const vscode = acquireVsCodeApi();
export let virtualHexDocument: VirtualDocument;

function openAnyway(): void {
	vscode.postMessage({ type: "open-anyways" });
}


// Self executing anonymous function
// This is the main entry point
((): void=> {
    // Handle messages from the extension
	window.addEventListener("message", async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case "init":
				{
					// Loads the html body sent over
					if (body.html !== undefined) {
						document.getElementsByTagName("body")[0].innerHTML = body.html;
						virtualHexDocument = new VirtualDocument(body.fileSize, body.html);
						vscode.postMessage({ type: "packet", body: {
							initialOffset: 0,
							numElements: Math.ceil(virtualHexDocument.numRowsInViewport * 16)
						} });
						// We debounce the scroll so it isn't called excessively
						window.addEventListener("scroll", debounce(scrollHandler, 125));
					}
					if (body.fileSize != 0 && body.html === undefined) {
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
					return;
				}
			case "getFileData":
				{
					vscode.postMessage({ type: "response", requestId, body: "foo" });
					return;
				}
			case "packet":
				{
					console.log(body);
					const offset = body.offset;
					const packets: VirtualizedPacket[] = [];
					for (let i = 0; i < body.data.data.length; i++) {
						packets.push({
							offset: i + offset,
							data: new ByteData(body.data.data[i])
						});
					}
					virtualHexDocument.addPackets(packets);
					document.getElementsByTagName("body")[0]!.style.transform	= `translateY(${window.scrollY}px)`;
				}
		}
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: "ready" });
})();