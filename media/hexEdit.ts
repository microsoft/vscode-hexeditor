import { debounce } from "ts-debounce";
import { VirtualDocument } from "./virtualDocument";
import { ChunkHandler } from "./chunkHandler";

declare const acquireVsCodeApi: any;
export const vscode = acquireVsCodeApi();
export let virtualHexDocument: VirtualDocument;
// Construct a chunk handler which holds chunks of 50 rows (50 * 16)
export const chunkHandler: ChunkHandler = new ChunkHandler(800);

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
						virtualHexDocument = new VirtualDocument(body.fileSize);
						(window as any).virtualHexDocument = virtualHexDocument;
						// We initially load 4 chunks below the viewport (normally we buffer 2 above as well, but there is no above at the start)
						chunkHandler.ensureBuffer(0, {
							topBufferSize: 0,
							bottomBufferSize: 4
						});
						// We debounce the scroll so it isn't called excessively
						window.addEventListener("scroll", debounce(virtualHexDocument.scrollHandler.bind(virtualHexDocument), 100));
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
					chunkHandler.processChunks(body.offset, body.data.data);
				}
		}
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: "ready" });
})();