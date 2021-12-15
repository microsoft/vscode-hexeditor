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

	const expandBoundsToContain = useCallback((newOffset: number) => {
		const windowSize = select.getDisplayedBytes(dimension);

		// Expand the scroll bounds if the new position is too close to the
		// start or end of the selection, based on the loadThreshold.
		setBounds(old => {
			if (newOffset - old.start < windowSize * loadThreshold && old.start > 0) {
				return new Range(Math.max(0, old.start - windowSize), old.end);
			} else if (old.end - newOffset < windowSize * (1 + loadThreshold)) {
				return new Range(old.start, Math.min(fileSize ?? Infinity, old.end + windowSize));
			} else {
				return old;
			}
		});
	}, [dimension, fileSize]);

	useEffect(() => {
		if (previousOffset.current === offset) {
			return;
		}

		expandBoundsToContain(offset);
		setScrollTop(dimension.rowPxHeight * (offset / dimension.rowByteWidth));
	}, [offset]);

	const onScroll = useCallback((scrollTop: number) => {
		// On scroll, figure out the offset displayed at the new position.
		const rowNumber = Math.floor(scrollTop / dimension.rowPxHeight);
		const newOffset = rowNumber * dimension.rowByteWidth;
		const newScrollTop = rowNumber * dimension.rowPxHeight;
		previousOffset.current = newOffset;
		setOffset(newOffset);
		expandBoundsToContain(newOffset);
		setScrollTop(newScrollTop);
	}, [dimension, expandBoundsToContain]);

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
