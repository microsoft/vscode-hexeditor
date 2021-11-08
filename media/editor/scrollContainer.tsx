import { css } from "@linaria/core";
import React, { useEffect, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as select from "./state";
import { Range } from "./util";
import { DataDisplay } from "./dataDisplay";

const wrapperCls = css`
	overflow-y: scroll;
	overflow-x: hidden;
	flex-grow: 1;
	position: relative;
`;

const heightCls = css``;

const loadThreshold = 0.5;

const getBoundScrollHeight = (bounds: Range, dimension: select.IDimensions) =>
	Math.ceil(bounds.size / dimension.rowByteWidth) * dimension.rowPxHeight + dimension.height / 2;

export const ScrollContainer: React.FC = () => {
	const dimension = useRecoilValue(select.dimensions);
	const fileSize = useRecoilValue(select.fileSize);
	const previousBounds = useRef<Range>();
	const [bounds, setBounds] = useRecoilState(select.scrollBounds);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [offset, setOffset] = useRecoilState(select.offset);

	const recalculateHeight = () => {
		if (!container) {
			return;
		}

		const newHeight = getBoundScrollHeight(bounds, dimension);
		const heightEl = container.querySelector(`.${heightCls}`) as HTMLDivElement;
		heightEl.style.height = `${newHeight}px`;

		// If data was added at the top, adjust scrolling so it stays in the same place
		if (previousBounds.current && previousBounds.current.start !== bounds.start) {
			heightEl.scrollTop += newHeight - getBoundScrollHeight(previousBounds.current!, dimension);
		}

		previousBounds.current = bounds;
	};

	// update the scrollable height when bounds changes
	useEffect(recalculateHeight, [container, bounds, dimension]);

	// initially, or on byte width change, adjust the scroll position.
	useEffect(() => {
		if (container) {
			container.scrollTop = (offset - bounds.start) / dimension.rowByteWidth * dimension.rowPxHeight;
		}
	}, [container, dimension]);

	// when scrolling, update the offset
	useEffect(() => {
		if (!container) {
			return;
		}

		const l = () => {
			const newOffset = bounds.start + Math.floor(container.scrollTop / dimension.rowPxHeight) * dimension.rowByteWidth;
			setOffset(newOffset);
			const windowSize = select.getDisplayedBytes(dimension);

			setBounds(bounds => {
				if (newOffset - bounds.start < windowSize * loadThreshold && bounds.start > 0) {
					return new Range(Math.max(0, bounds.start - windowSize), bounds.end);
				} else if (bounds.end - newOffset < windowSize * (1 + loadThreshold)) {
					return new Range(bounds.start, Math.min(fileSize ?? Infinity, bounds.end + windowSize));
				} else {
					return bounds;
				}
			});
		};

		container.addEventListener("scroll", l, { passive: true });
		return () => container.removeEventListener("scroll", l);
	}, [container, dimension]);

	return (
		<div className={wrapperCls} ref={setContainer}>
			<DataDisplay />
			<div className={heightCls} />
		</div>
	);
};
