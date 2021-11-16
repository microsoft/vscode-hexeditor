import { styled } from "@linaria/react";
import { css } from "@linaria/core";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSize } from "./hooks";
import { clamp, clsx } from "./util";

const Handle = styled.div`
	background: var(--vscode-scrollbarSlider-background);
	flex-grow: 1;
	transform-origin: 0 0;
`;

const draggingCls = css`
	${Handle} {
		background: var(--vscode-scrollbarSlider-activeBackground);
	}
`;

const ScrollbarContainer = styled.div`
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	display: flex;
	flex-direction: column;

	:hover ${Handle} {
		background: var(--vscode-scrollbarSlider-hoverBackground);
	}
`;


const scrollInterationBlockerCls = css`
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 1;
`;

const scrollbarCls = css`
	position: absolute;
	visibility: hidden;
	overflow: scroll;
	width: 100px;
	height: 100px;
`;

const containerCls = css`
	position: relative;
`;

const calcScrollbarDimensions = () => {
	const el = document.createElement("div");
	el.classList.add(scrollbarCls);
	document.body.appendChild(el);
	const width = (el.offsetWidth - el.clientWidth);
	const height = (el.offsetHeight - el.clientHeight);
	document.body.removeChild(el);
	return { width, height };
};

/**
 * Generic virtual scroll container. We use this instead
 * of native scrolling because native browser scrolling has a limited scroll
 * height, which we run into easily for larger files.
 *
 * Note that, unlike traditional scroll elements, this doesn't have a
 * scrollHeight but rather a scrollStart and scrollEnd (given in px). This is
 * used for dynamically expanding scroll bounds while keeping the position.
 */
export const VirtualScrollContainer: React.FC<{
	className?: string;
	scrollStart: number;
	scrollEnd: number;
	scrollTop: number;
	minHandleHeight?: number;
	onScroll(top: number): void;
}> = ({ className, children, scrollStart, scrollEnd, minHandleHeight = 20, scrollTop, onScroll }) => {
	const scrollDimension = useMemo(calcScrollbarDimensions, []);
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	// Set when the scroll handle is being dragged. startY is the original pageY
	// positon of the cursor. offset how far down the scroll handle the cursor was.
	const [drag, setDrag] = useState<{ startY: number; offset: number; }>();
	const size = useSize(wrapperRef);

	const scrollHeight = scrollEnd - scrollStart;
	const visible = scrollHeight > size.height;

	let style: React.CSSProperties | undefined;
	let handleTop: number;
	let handleHeight: number;
	if (visible) {
		// We use transform rather than top/height here since it's cheaper to
		// rerender. The height is the greatest of either the min handle height or
		// the proportion of the total data that the current window is displaying.
		handleHeight = Math.max(minHandleHeight, size.height * size.height / scrollHeight);
		// Likewise, the distance from the top is how far through the scrollHeight
		// the current scrollTop is--adjusting for the handle height to keep it on screen.
		handleTop = (scrollTop - scrollStart) / (scrollHeight - size.height) * (size.height - handleHeight);
		style = {
			opacity: 1,
			pointerEvents: "auto",
			transform: `translateY(${handleTop}px) scaleY(${handleHeight / size.height})`
		};
	}

	/** Clamps the `newScrollTop` witihn the valid scrollable region. */
	const clampScroll = (newScrollTop: number) => clamp(scrollStart, newScrollTop, scrollEnd - size.height);

	/** Handler for a mouse move to position "pageY" with the given scrubber offset. */
	const onScrollWithOffset = (pageY: number, offset: number) => {
		// This is just the `handleTop` assignment from above solved for the
		// scrollTop where handleTop = `pageY - offset - size.top`.
		const newScrollTop = (pageY - offset - size.top) / (size.height - handleHeight) * (scrollHeight - size.height) - scrollStart;
		onScroll(clampScroll(newScrollTop));
	};

	const onWheel = (evt: React.WheelEvent) => {
		if (!evt.defaultPrevented) {
			onScroll(clampScroll(scrollTop + evt.deltaY));
		}
	};

	const onHandleMouseDown = (evt: React.MouseEvent) => {
		if (evt.defaultPrevented) {
			return;
		}

		setDrag({
			startY: evt.pageY,
			// offset is how far down the scroll handle the cursor is
			offset: clamp(0, evt.pageY - handleTop - size.top, handleHeight)
		});
		evt.preventDefault();
	};

	const onBarMouseDown = (evt: React.MouseEvent) => {
		if (evt.defaultPrevented) {
			return;
		}

		// Start scrolling and set the offset to by the middle of the scrollbar.
		// Start dragging if we aren't already.
		onScrollWithOffset(evt.pageY, handleHeight / 2);
		setDrag(d => d || { startY: evt.pageY, offset: handleHeight / 2 });
		evt.preventDefault();
	};

	// Effect that adds a drag overlay and global mouse listeners while scrubbing on the scrollbar.
	useEffect(() => {
		if (!drag) {
			return;
		}

		const blocker = document.createElement("div");
		blocker.classList.add(scrollInterationBlockerCls);
		document.body.appendChild(blocker);

		const onMove = (evt: MouseEvent) => {
			if (!evt.buttons) {
				setDrag(undefined);
			} else {
				onScrollWithOffset(evt.pageY, drag.offset);
			}
		};

		const onUp = () => setDrag(undefined);
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);

		return () => {
			document.body.removeChild(blocker);
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, [drag, scrollHeight, size.height]);

	return <div className={clsx(containerCls, className)} onWheel={onWheel}>
		{children}
		<ScrollbarContainer style={{
			opacity: visible ? 1 : 0,
			pointerEvents: visible ? "auto" : "none",
			width: scrollDimension.width,
		}} className={clsx(drag && draggingCls)} ref={wrapperRef} onMouseDown={onBarMouseDown}>
			<Handle role="scrollbar" style={style} onMouseDown={onHandleMouseDown} />
		</ScrollbarContainer>
	</div>;
};
