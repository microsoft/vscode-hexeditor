import { virtualHexDocument } from "./hexEdit";

export class ScrollBarHandler {
    private scrollBar: HTMLDivElement;
    private scrollBarHeight: number;
    private scrollThumb: HTMLDivElement;
    private scrollThumbHeight: number;
    private scrollTop: number;
    /**
     * Given a scrollbar element instantiates a handler which handles the scrolling behavior in the editor
     * @param {string} scrollBarId the id of the scrollbar element on the DOM 
     */
    constructor(scrollBarId: string) {
        this.scrollTop = 0;
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
        this.scrollBarHeight = this.scrollBar.clientHeight;
        this.scrollThumbHeight = this.scrollThumb.clientHeight;
        console.log(this.scrollThumb);
    }
    onMouseWheel(event: MouseWheelEvent) {
        if (event.deltaY > 0) {
            this.scrollTop += 18;
        } else {
            this.scrollTop -= 18;
            this.scrollTop = Math.max(0, this.scrollTop);
            
        }
        this.scrollThumb.style.transform = `translateY(${Math.min(this.scrollBarHeight - this.scrollThumbHeight, this.scrollTop)}px)`;
        console.log(this.scrollTop);
        (document.getElementsByClassName("rowwrapper")[1] as HTMLElement)!.style.transform = `translateY(-${Math.min(this.scrollBarHeight - this.scrollThumbHeight, this.scrollTop)}px)`;
        virtualHexDocument.scrollHandler();
    }

    get virtualScrollTop(): number {
        return this.scrollTop;
    }
}