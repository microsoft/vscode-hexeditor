import { virtualHexDocument } from "./hexEdit";

export class ScrollBarHandler {
    private scrollBar: HTMLDivElement;
    private scrollBarHeight: number;
    private scrollThumb: HTMLDivElement;
    private scrollThumbHeight: number;
    private scrollTop: number;
    private isDragging: boolean;
    /**
     * Given a scrollbar element instantiates a handler which handles the scrolling behavior in the editor
     * @param {string} scrollBarId the id of the scrollbar element on the DOM 
     */
    constructor(scrollBarId: string) {
        this.scrollTop = 0;
        this.isDragging = false;
        // If the scrollbar isn't on the DOM for some reason there's nothing we can do besides create an empty handler and throw an error
        if (document.getElementById(scrollBarId)) {
            this.scrollBar = document.getElementById(scrollBarId)! as HTMLDivElement;
            this.scrollThumb = this.scrollBar.children[0] as HTMLDivElement;
        } else {
            this.scrollBar = document.createElement("div");
            this.scrollThumb = document.createElement("div");
            throw "Invalid scrollbar id!";
        }
        document.getElementsByTagName("body")[0].addEventListener("wheel", this.onMouseWheel.bind(this));
        this.scrollBar.addEventListener("mousedown", () => {
            this.isDragging = true;
        });
        this.scrollBar.addEventListener("mouseup", () => {
            this.isDragging = false;
        });
        this.scrollBar.addEventListener("mousemove", this.scrollThumbDrag.bind(this));
        this.scrollBarHeight = this.scrollBar.clientHeight;
        this.scrollThumbHeight = this.scrollThumb.clientHeight;
    }

    private scrollThumbDrag(event: MouseEvent): void {
        if (!this.isDragging) return;
        this.scrollThumb.style.transform = `translateY(${Math.min(this.scrollBarHeight - this.scrollThumbHeight, event.clientY)}px)`;

    }

    onMouseWheel(event: MouseWheelEvent): void {
        console.log(event.deltaY);
        if (event.deltaY > 0) {
            this.scrollTop += 18;
        } else {
            this.scrollTop -= 18;
            this.scrollTop = Math.max(0, this.scrollTop);
            
        }
        this.scrollThumb.style.transform = `translateY(${Math.min(this.scrollBarHeight - this.scrollThumbHeight, this.scrollTop)}px)`;
        // This makes sure it doesn't scroll past the bottom of the viewport
        (document.getElementsByClassName("rowwrapper")[0] as HTMLElement)!.style.transform = `translateY(-${Math.min(this.scrollBarHeight - this.scrollThumbHeight + 1, this.scrollTop)}px)`;
        (document.getElementsByClassName("rowwrapper")[1] as HTMLElement)!.style.transform = `translateY(-${Math.min(this.scrollBarHeight - this.scrollThumbHeight + 1, this.scrollTop)}px)`;
        (document.getElementsByClassName("rowwrapper")[2] as HTMLElement)!.style.transform = `translateY(-${Math.min(this.scrollBarHeight - this.scrollThumbHeight + 1, this.scrollTop)}px)`;
        virtualHexDocument.scrollHandler();
    }

    get virtualScrollTop(): number {
        return this.scrollTop;
    }
}