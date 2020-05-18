// @ts-check


// @ts-ignore
const vscode = acquireVsCodeApi();

// This will be our class data
class ByteData {

	constructor(uint8num) {
		this.decimal = uint8num;
		this.adjacentBytes = [];
	}
	// adds a ByteData object to the adjacent bytes array
	addAdjacentByte(byte_obj) {
		this.adjacentBytes.push(byte_obj);
	}

	toHex() {
		return this.decimal.toString(16);
	}

	// COnvert the uint8num into 8bit binary
	toBinary() {
		return ("00000000"+ this.decimal.toString(2)).slice(-8);
	}

	to8bitUInt() {
		return this.decimal;
	}

	to8bitInt() {
		let uint = this.decimal;
		const nbit = 8
		uint <<= 32 - nbit;
		uint >>= 32 - nbit;
		return uint;
	}

	to16bitUInt() {
		if (this.adjacentBytes.length == 0) return NaN;
		// Combines two 8 bit numbers to 16 bit
		return (((this.adjacentBytes[0].to8bitUInt() & 0xff) << 8) | (this.to8bitUInt() & 0xff));
	}

	to16bitInt() {
		if (this.adjacentBytes.length == 0) return NaN;
		// Combines two 8 bit numbers to 16 bit
		return ((this.adjacentBytes[0].to8bitInt() << 8) | (this.to8bitInt() & 0xff));
	}
}

// Given an offset returns all the elements with that data offset value
function getElementsWithGivenOffset(offset) {
	return document.querySelectorAll(`span[data-offset='${offset}'`)
}

// Handles hovering over an element
function hover(event) {
	const elements = getElementsWithGivenOffset(event.target.getAttribute('data-offset'));
	elements[0].classList.add('hover');
	elements[1].classList.add('hover');
}

function removeHover(event) {
	const elements = getElementsWithGivenOffset(event.target.getAttribute('data-offset'));
	elements[0].classList.remove('hover');
	elements[1].classList.remove('hover');
}

// Given two elements returns (the hex and ascii) returns a ByteData object representing that element
function retrieveSelectedByteObject(elements) {
	for (const element of elements) {
		if (element.parentElement.id == 'hexbody') {
			const byte_object = new ByteData(parseInt(element.innerHTML, 16));
			let current_element = element.nextElementSibling;
			for (let i = 0; i < 7; i++) {
				if (!current_element) break;
				byte_object.addAdjacentByte(new ByteData(parseInt(current_element.innerHTML, 16)));
				current_element = current_element.nextElementSibling;
			}
			return byte_object;
		}
	}
}

function clearSelected() {
	document.querySelectorAll('.selected').forEach(element => element.classList.remove('selected'));
}

function select(event) {
	const elements = getElementsWithGivenOffset(event.target.getAttribute('data-offset'));
	if (elements[0].classList.contains('selected')) {
		// @ts-ignore
		document.activeElement.blur();
		vscode.setState({selected_offset: undefined})
		clearDataInspector();
		elements[0].classList.remove('selected');
		elements[1].classList.remove('selected');
	} else {
		clearSelected();
		event.target.focus();
		//@ts-ignore
		vscode.setState({selected_offset: event.target.getAttribute('data-offset')});
		const byte_obj = retrieveSelectedByteObject(elements);
		populateDataInspector(byte_obj);
		elements[0].classList.add('selected');
		elements[1].classList.add('selected');
	}
}

// Same select call but selects based on not a mouse event, but a data offset value
function selectByOffset(offset) {
	clearSelected();
	const elements = getElementsWithGivenOffset(offset);
	// This removal of previously selected items should be fast as there should only be two
	const selected_items = document.getElementsByClassName('selected');
	const byte_obj = retrieveSelectedByteObject(elements);
	populateDataInspector(byte_obj);
	elements[0].classList.add('selected');
	elements[1].classList.add('selected');
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

function populateAsciiTable(data) {
	const ascii_table = document.getElementById('ascii');
	for (let i = 0; i < data.length; i++) {
		const ascii_element = document.createElement('span');
		ascii_element.setAttribute('data-offset', i.toString());
		if (data[i].decimal < 32 || data[i].decimal >= 255) {
			ascii_element.classList.add('nongraphic');
			ascii_element.innerText = '.';
		} else {
			const ascii_char = String.fromCharCode(data[i].decimal);
			ascii_element.innerText = ascii_char;
		}
		ascii_element.tabIndex = -1;
		ascii_element.addEventListener('keydown', arrowKeyNavigate);
		ascii_element.addEventListener('mouseover', hover);
		ascii_element.addEventListener('mouseleave', removeHover);
		ascii_element.addEventListener('click', select);
		ascii_table.appendChild(ascii_element);
	}
}

// Takes the byte stream and populates the webview with the hex information
function populateHexBody(data) {
	const hex_body = document.getElementById('hexbody');
	for (let i = 0; i < data.length; i++) {
		const hex_element = document.createElement('span');
		hex_element.setAttribute('data-offset',i.toString());
		hex_element.innerText = pad(data[i].toHex(), 2);
		hex_element.tabIndex = -1;
		hex_element.addEventListener('mouseover', hover);
		hex_element.addEventListener('mouseleave', removeHover);
		hex_element.addEventListener('click', select);
		hex_element.addEventListener('keydown', arrowKeyNavigate);
		hex_body.appendChild(hex_element);
	}
}

// Clears the data inspector of populated data
function clearDataInspector() {
	// @ts-ignore
	document.getElementById('binary8').value = 'Invalid';
	// @ts-ignore
	document.getElementById('int8').value = 'Invalid';
	// @ts-ignore
	document.getElementById('uint8').value = 'Invalid';
	// @ts-ignore
	document.getElementById('int16').value = 'Invalid';
	// @ts-ignore
	document.getElementById('uint16').value = 'Invalid';
}

// Given the byte_object representing the byte in the file populates the data inspector
function populateDataInspector(byte_obj) {
	// @ts-ignore
	document.getElementById('binary8').value = byte_obj.toBinary();
	// @ts-ignore
	document.getElementById('int8').value = byte_obj.to8bitInt();
	// @ts-ignore
	document.getElementById('uint8').value = byte_obj.to8bitUInt();
	// If it's not a number it just means we're close to the end of file and don't have enough bits left
	const uint16 = byte_obj.to16bitUInt();
	const int16 = byte_obj.to16bitInt();
	// @ts-ignore
	document.getElementById('int16').value = isNaN(int16) ? 'End of File' : int16;
	// @ts-ignore
	document.getElementById('uint16').value = isNaN(uint16) ? 'End of File' : uint16;

}

function openAnyway() {
	vscode.postMessage({ type: 'open-anyways' });
}

function arrowKeyNavigate(event) {
	let next;
	switch(event.keyCode) {
		// left
		case 37:
			next = event.target.previousElementSibling;
			break;
		// up
		case  38:
			const elements_above = getElementsWithGivenOffset(parseInt(event.target.getAttribute('data-offset')) - 16);
			if (elements_above.length === 0) break;
			if (elements_above[0].parentElement === event.target.parentElement) {
				next = elements_above[0];
			} else {
				next = elements_above[1];
			}
			break;
		// right
		case 39:
			next = event.target.nextElementSibling;
			break;
		// down
		case 40:
			const elements_below = getElementsWithGivenOffset(parseInt(event.target.getAttribute('data-offset')) + 16);
			if (elements_below.length === 0) break;
			if (elements_below[0].parentElement === event.target.parentElement) {
				next = elements_below[0];
			} else {
				next = elements_below[1];
			}
			break;
	}
	if (next && next.tagName === 'SPAN') {
		next.focus();
		selectByOffset(next.getAttribute('data-offset'))
	}
}

// Fires when a user tries to edit the document
function edit(event) {
	vscode.postMessage({ type: 'edit' });
	event.preventDefault();
}

// Self executing anonymous function
(()=> {
    // Handle messages from the extension
    let data = []
	window.addEventListener('message', async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case 'init':
				{
					// Loads the html body sent over
					if (body.html !== undefined) {
						document.getElementsByTagName('body')[0].innerHTML = body.html;
					}
					if (body.fileSize != 0 && body.value.data === undefined) {
						document.getElementsByTagName('body')[0].innerHTML = 
						`
							<div>
							<p>Opening this large file may cause instability. <a id="open-anyway" href="#">Open anyways</a></p>
							</div>
						`;
						document.getElementById('open-anyway').addEventListener('click', openAnyway);
						return;
					}
					document.getElementsByTagName('body')[0].addEventListener('keypress', edit);
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
					const hexEditorHeight = document.getElementById('hexaddr').clientHeight;
					document.getElementById('data-inspector').style.height = `${hexEditorHeight}px`;
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