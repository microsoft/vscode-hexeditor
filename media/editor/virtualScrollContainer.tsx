import React, { useEffect, useRef, useState } from "react";
import { useSize } from "./hooks";
import { clamp, clsx, getScrollDimensions, throwOnUndefinedAccessInDev } from "./util";
import _style from "./virtualScrollContainer.css";

const style = throwOnUndefinedAccessInDev(_style);

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
}> = ({
	className,
	children,
	scrollStart,
	scrollEnd,
	minHandleHeight = 20,
	scrollTop,
	onScroll,
}) => {
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	// Set when the scroll handle is being dragged. startY is the original pageY
	// positon of the cursor. offset how far down the scroll handle the cursor was.
	const [drag, setDrag] = useState<{ startY: number; offset: number }>();
	const size = useSize(wrapperRef);

	const scrollHeight = scrollEnd - scrollStart;
	const visible = scrollHeight > size.height;

	let scrollStyle: React.CSSProperties | undefined;
	let handleTop: number;
	let handleHeight: number;
	if (visible) {
		// We use transform rather than top/height here since it's cheaper to
		// rerender. The height is the greatest of either the min handle height or
		// the proportion of the total data that the current window is displaying.
		handleHeight = Math.max(minHandleHeight, (size.height * size.height) / scrollHeight);
		// Likewise, the distance from the top is how far through the scrollHeight
		// the current scrollTop is--adjusting for the handle height to keep it on screen.
		handleTop =
			Math.min(1, (scrollTop - scrollStart) / (scrollHeight - size.height)) *
			(size.height - handleHeight);
		scrollStyle = {
			opacity: 1,
			pointerEvents: "auto",
			transform: `translateY(${handleTop}px) scaleY(${handleHeight / size.height})`,
		};
	}

	/** Clamps the `newScrollTop` witihn the valid scrollable region. */
	const clampScroll = (newScrollTop: number) =>
		clamp(scrollStart, newScrollTop, scrollEnd - size.height);

	/** Handler for a mouse move to position "pageY" with the given scrubber offset. */
	const onScrollWithOffset = (pageY: number, offset: number) => {
		// This is just the `handleTop` assignment from above solved for the
		// scrollTop where handleTop = `pageY - offset - size.top`.
		const newScrollTop =
			scrollStart +
			((pageY - offset - size.top) / (size.height - handleHeight)) * (scrollHeight - size.height);
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
			offset: clamp(0, evt.pageY - handleTop - size.top, handleHeight),
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
		blocker.classList.add(style.interactionBlocker);
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

	return (
		<div className={clsx(style.container, className)} onWheel={onWheel}>
			{children}
			<div
				style={{
					opacity: visible ? 1 : 0,
					pointerEvents: visible ? "auto" : "none",
					width: getScrollDimensions().width,
				}}
				className={clsx(style.scrollbarContainer, drag && style.dragging)}
				ref={wrapperRef}
				onMouseDown={onBarMouseDown}
			>
				<div
					className={style.handle}
					role="scrollbar"
					style={scrollStyle}
					onMouseDown={onHandleMouseDown}
				/>
			</div>
		</div>
	);
};
