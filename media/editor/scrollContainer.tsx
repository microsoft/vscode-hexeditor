import { css } from "@linaria/core";
import { Fragment, FunctionComponent, h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useRecoilState, useRecoilValue } from "recoil";
import * as select from "./state";
import { DataDisplay } from "./virtualDocument";

const wrapperCls = css`
	overflow: scroll;
	flex-grow: 1;
	position: relative;
	will-change: transform;
`;

const heightCls = css``;


export const ScrollContainer: FunctionComponent = () => {
	const dimension = useRecoilValue(select.dimensions);
	const bounds = useRecoilValue(select.scrollBounds);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [offset, setOffset] = useRecoilState(select.offset);

	// update the scrollable height when bounds changes
	useEffect(() => {
		if (container) {
			const heightEl = container.querySelector(`.${heightCls}`) as HTMLDivElement;
			const boundRows = Math.ceil((bounds.to - bounds.from) / dimension.rowByteWidth);
			heightEl.style.height = `${boundRows * dimension.rowPxHeight}px`;
		}
	}, [container, bounds, dimension]);

	// initially, or on byte width change, adjust the scroll position.
	useEffect(() => {
		if (container) {
			container.scrollTop = (offset - bounds.from) / dimension.rowByteWidth * dimension.rowPxHeight;
		}
	}, [container, dimension]);

	// when scrolling, update the offset
	useEffect(() => {
		if (!container) {
			return;
		}

		const l = () => setOffset(bounds.from + Math.floor(container.scrollTop / dimension.rowPxHeight) * dimension.rowByteWidth);
		container.addEventListener("scroll", l, { passive: true });
		return () => container.removeEventListener("scroll", l);
	}, [container]);

	return <div className={wrapperCls} ref={setContainer}>
		<div className={heightCls} />
		<DataDisplay />
	</div>;
};
