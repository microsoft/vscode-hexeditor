import { clearDataInspector, populateDataInspector } from "./dataInspector";
import { vscode, virtualHexDocument } from "./hexEdit";
import { ByteData } from "./byteData";

// Given an offset returns all the elements with that data offset value
function getElementsWithGivenOffset(offset: number): NodeListOf<Element> {
	return document.querySelectorAll(`span[data-offset='${offset}'`);
}

// Given a mouse event returns the elements associated with it
function getElementsGivenMouseEvent(event: Event): NodeListOf<Element> | undefined {
    if (!event || !event.target) return;
    const hovered = event.target as Element;
    const data_offset = hovered.getAttribute("data-offset");
    if (!data_offset) return;
    return getElementsWithGivenOffset(parseInt(data_offset));
}


// Handles hovering over an element
export function hover(event: MouseEvent): void {
    const elements = getElementsGivenMouseEvent(event);
    if (!elements) return;
	elements[0].classList.add("hover");
	elements[1].classList.add("hover");
}

export function removeHover(event: MouseEvent): void {
    const elements = getElementsGivenMouseEvent(event);
    if (!elements) return;
	elements[0].classList.remove("hover");
	elements[1].classList.remove("hover");
}


function clearSelected(): void {
	document.querySelectorAll(".selected").forEach(element => element.classList.remove("selected"));
}

// Given two elements (the hex and ascii) returns a ByteData object representing the combined elements
function retrieveSelectedByteObject(elements: NodeListOf<Element>): ByteData | undefined {
	for (const element of Array.from(elements)) {
		if (element.parentElement?.parentElement && element.parentElement.parentElement.id == "hexbody") {
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
    return;
}

// Same select call but selects based on not a mouse event, but a data offset value
export function selectByOffset(offset: number): void {
	clearSelected();
	const elements = getElementsWithGivenOffset(offset);
	const byte_obj = retrieveSelectedByteObject(elements);
	if (!byte_obj) return;
	const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
	populateDataInspector(byte_obj, littleEndian);
	vscode.setState({ selected_offset: offset });
	elements[0].classList.add("selected");
	elements[1].classList.add("selected");
}

export function select(event: MouseEvent): void  {
    if (!event || !event.target) return;
    const elements = getElementsGivenMouseEvent(event);
    if (!elements) return;
    // We toggle the select off if they clicked the same element
	if (elements[0].classList.contains("selected")) {
        if (document.activeElement) {
            (document.activeElement as HTMLElement).blur();
        }
        
		vscode.setState({ selected_offset: undefined });
		clearDataInspector();
		elements[0].classList.remove("selected");
		elements[1].classList.remove("selected");
	} else {
		clearSelected();
		(event.target as HTMLElement).focus();
		vscode.setState({ selected_offset: (event.target as HTMLElement).getAttribute("data-offset") });
        const byte_obj = retrieveSelectedByteObject(elements);
        // This will only be undefined if we pass in bad elements which in theory shouldn't happen
		if (!byte_obj) return;
		const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
		populateDataInspector(byte_obj, littleEndian);
		console.log(`Calculated: ${virtualHexDocument.offsetYPos(vscode.getState().selected_offset)}, Actual: ${elements[0].getBoundingClientRect().y}`);
		elements[0].classList.add("selected");
		elements[1].classList.add("selected");
	}
}

export function arrowKeyNavigate(event: KeyboardEvent): void {
	if (!event || !event.target) return;
	const targetElement = event.target as HTMLElement;
	let next;
	if (event.keyCode >= 37 && event.keyCode <= 40) {
		event.preventDefault();
	}
	switch(event.keyCode) {
		// left
		case 37:
			next = targetElement.previousElementSibling;
			break;
		// up
		case  38:
			const elements_above = getElementsWithGivenOffset(parseInt(targetElement.getAttribute("data-offset")!) - 16);
			if (elements_above.length === 0) break;
			if (elements_above[0].parentElement === targetElement.parentElement) {
				next = elements_above[0];
			} else {
				next = elements_above[1];
			}
			break;
		// right
		case 39:
			next = targetElement.nextElementSibling;
			break;
		// down
		case 40:
			const elements_below = getElementsWithGivenOffset(parseInt(targetElement.getAttribute("data-offset")!) + 16);
			if (elements_below.length === 0) break;
			if (elements_below[0].parentElement === targetElement.parentElement) {
				next = elements_below[0];
			} else {
				next = elements_below[1];
			}
			break;
	}
	if (next && next.tagName === "SPAN") {
		(next as HTMLInputElement).focus();
		selectByOffset(parseInt(next.getAttribute("data-offset")!));
	}
}

// This is bound to the on change event for the select which decides to render big or little endian
export function changeEndianness(): void {
	if (document.activeElement && vscode.getState() && vscode.getState().selected_offset) {
		// Since the inspector has no sense of state, it doesn't know what byte it is currently rendering
		// We must retrieve it based on the dom
		const elements = getElementsWithGivenOffset(vscode.getState().selected_offset);
		const byte_obj = retrieveSelectedByteObject(elements);
		if (!byte_obj) return;
		const littleEndian = (document.getElementById("endianness") as HTMLInputElement).value === "little";
		populateDataInspector(byte_obj, littleEndian);
	}
}

// Handles scrolling in the editor
export function scrollHandler(): void {
	console.log(virtualHexDocument.topOffset());
	vscode.postMessage({ type: "packet", body: {
		initialOffset: Math.max(virtualHexDocument.topOffset() - (16 * 30), 0),
		numElements: Math.ceil(virtualHexDocument.numRowsInViewport * 16)
	} });
}