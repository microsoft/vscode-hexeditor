// @ts-check

function decimalToHex(num) {
	return num.toString(16);
}

// Pads a number with 0s up to a given width
function pad(number, width) {
	number = number + '';
	return number.length >= width ? number : new Array(width - number.length + 1).join('0') + number;
}

// Takes the document data and populates the hex address column
function populateHexAddresses(data) {
	const num_columns = Math.ceil(data.length / 16);
	const hex_addr = document.getElementById('hexaddr');
	for (let i = 0; i < num_columns; i++) {
		const addr = document.createElement('div');
		addr.setAttribute('data-offset', (i * 16).toString());
		addr.innerText = pad((i * 16).toString(16), 8);
		hex_addr.appendChild(addr);
	}
}
// Self executing anonymous function
(()=> {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
        // Handle messages from the extension
        
	window.addEventListener('message', async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case 'init':
				{
					let hex_string = '';
					// Load the initial image into the canvas.
					const data = new Uint8Array(body.value.data);
					populateHexAddresses(data);
					const hex_body = document.getElementById('hexbody');
					for (let i = 0; i < data.length; i++) {
						const hex_element = document.createElement('span');
						hex_element.setAttribute('data-offset',i.toString());
						hex_element.innerText = pad(decimalToHex(data[i]), 2);
						hex_body.appendChild(hex_element);
					}
					return;
				}
			case 'getFileData':
				{
					vscode.postMessage({ type: 'response', requestId, body: 'foo' });
					return;
				}
		}
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: 'ready' });
})();