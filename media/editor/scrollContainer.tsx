import { css } from "@linaria/core";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as select from "./state";
import { Range } from "./util";
import { DataDisplay } from "./dataDisplay";
import { VirtualScrollContainer } from "./virtualScrollContainer";

const wrapperCls = css`
	flex-grow: 1;
	flex-basis: 0;
`;

/**
 * "Overscroll" of data that the hex editor will try to load. For example, if
 * this is set to 2, then two additional window heights of data will be loaded
 * before and after the currently displayed data.
 */
const loadThreshold = 0.5;

export const ScrollContainer: React.FC = () => {
	const dimension = useRecoilValue(select.dimensions);
	const fileSize = useRecoilValue(select.fileSize);
	const [bounds, setBounds] = useRecoilState(select.scrollBounds);
	const [offset, setOffset] = useRecoilState(select.offset);
	const previousOffset = useRef<number>();

	const [scrollTop, setScrollTop] = useState(0);

	useEffect(() => {
		if (previousOffset.current !== offset) {
			setScrollTop(dimension.rowPxHeight * (offset - bounds.start) / dimension.rowByteWidth);
		}
	}, [offset]);

	const onScroll = useCallback((scrollTop: number) => {
		// On scroll, figure out the offset displayed at the new position.
		const newOffset = bounds.start + Math.floor(scrollTop / dimension.rowPxHeight) * dimension.rowByteWidth;
		const newScrollTop = Math.floor(scrollTop / dimension.rowPxHeight) * dimension.rowPxHeight;
		previousOffset.current = newOffset;
		setOffset(newOffset);
		setScrollTop(newScrollTop);

		const windowSize = select.getDisplayedBytes(dimension);
		setBounds(bounds => {
			// Expand the scroll bounds if the new position is too close to the
			// start or end of the selection, based on the loadThreshold.
			if (newOffset - bounds.start < windowSize * loadThreshold && bounds.start > 0) {
				return new Range(Math.max(0, bounds.start - windowSize), bounds.end);
			} else if (bounds.end - newOffset < windowSize * (1 + loadThreshold)) {
				return new Range(bounds.start, Math.min(fileSize ?? Infinity, bounds.end + windowSize));
			} else {
				return bounds;
			}
		});
	}, [dimension]);

	return (
		<VirtualScrollContainer
			className={wrapperCls}
			scrollTop={scrollTop}
			scrollStart={dimension.rowPxHeight * (bounds.start / dimension.rowByteWidth)}
			scrollEnd={dimension.rowPxHeight * (bounds.end / dimension.rowByteWidth) + dimension.height / 2}
			onScroll={onScroll}
		>
			<DataDisplay />
		</VirtualScrollContainer>
	);
};
