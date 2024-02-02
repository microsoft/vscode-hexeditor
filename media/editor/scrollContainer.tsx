import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Range } from "../../shared/util/range";
import { DataDisplay } from "./dataDisplay";
import _style from "./scrollContainer.css";
import * as select from "./state";
import { throwOnUndefinedAccessInDev } from "./util";
import { VirtualScrollContainer } from "./virtualScrollContainer";

const style = throwOnUndefinedAccessInDev(_style);

/**
 * "Overscroll" of data that the hex editor will try to load. For example, if
 * this is set to 2, then two additional window heights of data will be loaded
 * before and after the currently displayed data.
 */
const loadThreshold = 0.5;

export const ScrollContainer: React.FC = () => {
	const dimension = useRecoilValue(select.dimensions);
	const columnWidth = useRecoilValue(select.columnWidth);
	const fileSize = useRecoilValue(select.fileSize);
	const { scrollBeyondLastLine } = useRecoilValue(select.codeSettings);
	const [bounds, setBounds] = useRecoilState(select.scrollBounds);
	const [offset, setOffset] = useRecoilState(select.offset);
	const previousOffset = useRef<number>();

	const [scrollTop, setScrollTop] = useState(0);

	const expandBoundsToContain = useCallback(
		(newOffset: number) => {
			const windowSize = select.getDisplayedBytes(dimension, columnWidth);

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
		},
		[dimension, columnWidth, fileSize],
	);

	useEffect(() => {
		if (previousOffset.current === offset) {
			return;
		}

		expandBoundsToContain(offset);
		setScrollTop(dimension.rowPxHeight * (offset / columnWidth));
	}, [offset]);

	// If scrolling slowly, an individual scroll event might not be able to move
	// to a new offset. This stores the "unused" scroll amount.
	const accumulatedScroll = useRef(0);

	const onScroll = useCallback(
		(scrollTop: number) => {
			// On scroll, figure out the offset displayed at the new position.
			scrollTop += accumulatedScroll.current;
			const rowNumber = Math.floor(scrollTop / dimension.rowPxHeight);
			accumulatedScroll.current = scrollTop - rowNumber * dimension.rowPxHeight;
			const newOffset = rowNumber * columnWidth;
			const newScrollTop = rowNumber * dimension.rowPxHeight;
			previousOffset.current = newOffset;
			setOffset(newOffset);
			expandBoundsToContain(newOffset);
			setScrollTop(newScrollTop);
		},
		[dimension, columnWidth, expandBoundsToContain],
	);

	const extraScroll = scrollBeyondLastLine ? dimension.height / 2 : 0;

	return (
		<VirtualScrollContainer
			className={style.wrapper}
			scrollTop={scrollTop}
			scrollStart={dimension.rowPxHeight * (bounds.start / columnWidth)}
			scrollEnd={dimension.rowPxHeight * (Math.ceil(bounds.end / columnWidth) + 1) + extraScroll}
			onScroll={onScroll}
		>
			<DataDisplay />
		</VirtualScrollContainer>
	);
};
