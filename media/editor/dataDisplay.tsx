// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { css } from "@linaria/core";
import { styled } from "@linaria/react";
import React, { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { ByteData } from "./byteData";
import { DataDisplayContext, DisplayContext, FocusedElement, useDisplayContext, useIsFocused, useIsHovered, useIsSelected } from "./dataDisplayContext";
import * as select from "./state";
import { clsx, getAsciiCharacter, Range, RangeDirection } from "./util";

export interface VirtualizedPacket {
	offset: number;
	data: ByteData;
}

const Header = styled.div`
	font-weight: bold;
	color: var(--vscode-editorLineNumber-activeForeground);
`;

const Address = styled.div`
	font-family: var(--vscode-editor-font-family);
	color: var(--vscode-editorLineNumber-foreground);
	text-transform: uppercase;
	line-height: var(--cell-size);
`;

const dataCellCls = css`
	font-family: var(--vscode-editor-font-family);
	width: var(--cell-size);
	height: var(--cell-size);
	line-height: var(--cell-size);
	text-align: center;
	display: inline-block;
	text-transform: uppercase;
`;

const DataCellGroup = styled.div`
	padding: 0 calc(var(--cell-size) / 4);
	display: inline-flex;
	cursor: default;
	user-select: none;
`;

const nonGraphicCharCls = css`
	color: var(--vscode-tab-unfocusedInactiveForeground);
`;

const dataCellHoveredCls = css`
	background: var(--vscode-editor-hoverHighlightBackground);
`;

const dataCellSelectedCls = css`
	background: var(--vscode-editor-selectionBackground);
	color: var(--vscode-editor-selectionForeground);
`;

const dataCellFocusedCls = css`
	outline-offset: 1px;
	outline: var(--vscode-focusBorder) 2px solid;
`;

const EmptyDataCell = () => (
	<span
		className={dataCellCls}
		aria-hidden
		style={{ visibility: "hidden" }}
	>00</span>
);

const Byte: React.FC<{ value: number }> = ({ value }) => (
	<span className={dataCellCls}>{value.toString(16).padStart(2, "0")}</span>
);

// why 'sticky' here? Well ultimately we want the rows to be fixed inside the
// div but allow scrolling. "fixed" blocks scrolling when the mouse is over
// the element, but sticky doesn't.
const dataDisplayCls = css`
	position: sticky;
	inset: 0;
	height: 0px;
`;

export const DataHeader: React.FC<{ width: number }> = ({ width }) => (
<Header>
	<DataCellGroup style={{ visibility: "hidden" }}  aria-hidden="true">
		<Address>00000000</Address>
	</DataCellGroup>
	<DataCellGroup>
		{new Array(width).fill(0).map((_v, i) =>
			<Byte key={i} value={i & 0xFF} />
		)}
	</DataCellGroup>
	<DataCellGroup>Decoded Text</DataCellGroup>
</Header>
);

export const DataDisplay: React.FC = () => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [offset, setOffset] = useRecoilState(select.offset);
	const [scrollBounds, setScrollBounds] = useRecoilState(select.scrollBounds);
	const dimensions = useRecoilValue(select.dimensions);
	const fileSize = useRecoilValue(select.fileSize);
	const ctx = useMemo(() => new DisplayContext(), []);

	useEffect(() => {
		const l = () => { ctx.isSelecting = false; };
		window.addEventListener("mouseup", l, { passive: true });
		return () => window.removeEventListener("mouseup", l);
	}, []);

	const onKeyDown = (e: React.KeyboardEvent) => {
		const current = ctx.focusedElement || FocusedElement.zero;
		const displayedBytes = select.getDisplayedBytes(dimensions);

		let delta = 0;
		switch (e.key) {
			case "ArrowLeft":
			case "j":
				delta = -1;
				break;
			case "ArrowRight":
			case "k":
				delta = 1;
				break;
			case "ArrowDown":
			case "h":
				delta = dimensions.rowByteWidth;
				break;
			case "ArrowUp":
			case "g":
				delta = -dimensions.rowByteWidth;
				break;
			case "Home":
				delta = -current.byte;
				break;
			case "End":
				delta = fileSize === undefined ?  displayedBytes : - current.byte - 1;
				break;
			case "PageUp":
				delta = -displayedBytes;
				break;
			case "PageDown":
				delta = displayedBytes;
				break;
		}

		if (e.ctrlKey || e.metaKey) {
			delta *= 10;
		}

		const next = new FocusedElement(current.char, Math.min(Math.max(0, current.byte + delta), fileSize ?? Infinity));
		if (next.key === current.key) {
			return;
		}

		e.preventDefault();
		ctx.focusedElement = next;

		if (e.shiftKey) {
			const srange = ctx.selection[0];
			if (!srange) {
				return [Range.inclusive(current.byte, next.byte)];
			}

			if (!srange.includes(next.byte)) {
				return ctx.replaceLastSelectionRange(srange.expandToContain(next.byte));
			}

			const closerToEnd = Math.abs(srange.end - current.byte) < Math.abs(srange.start - current.byte);
			const nextRange = closerToEnd ? new Range(srange.start, next.byte + 1) : new Range(next.byte, srange.end);
			return ctx.addSelectionRange(nextRange);
		}

		const byteRowStart = Math.floor(next.byte / dimensions.rowByteWidth) * dimensions.rowByteWidth;

		let newOffset: number;
		if (next.byte < offset) {
			newOffset = byteRowStart;
		} else if (next.byte - offset >= displayedBytes) {
			newOffset = byteRowStart - displayedBytes;
		} else {
			return;
		}

		setOffset(newOffset);
		if (newOffset < scrollBounds.start) {
			setScrollBounds(scrollBounds.expandToContain(newOffset));
		} else if (newOffset > scrollBounds.end) {
			setScrollBounds(scrollBounds.expandToContain(newOffset + displayedBytes * 2));
		}
	};

	return <DataDisplayContext.Provider value={ctx}>
		<div
			ref={containerRef}
			className={dataDisplayCls}
			onKeyDown={onKeyDown}
		><DataRows /></div>
	</DataDisplayContext.Provider> ;
};

const DataRows: React.FC = () => {
	const offset = useRecoilValue(select.offset);
	const dimensions = useRecoilValue(select.dimensions);
	const fileSize = useRecoilValue(select.fileSize) ?? Infinity;
	const endBytes = offset + select.getDisplayedBytes(dimensions);
	const rows: React.ReactChild[] = [];
	let row = 0;
	for (let i = offset; i < endBytes && i < fileSize; i += dimensions.rowByteWidth) {
		rows.push(
			<DataRow
				key={i}
				offset={i}
				top={row * dimensions.rowPxHeight}
				width={dimensions.rowByteWidth}
			/>,
		);
		row++;
	}

	return <>{rows}</>;
};

const dataRowCls = css`
	position: absolute;
	left: 0;
	top: 0;
	right: 0;
	display: flex;
`;

const DataRow: React.FC<{ top: number; offset: number; width: number }> = ({ top, offset, width }) => (
	<div className={dataRowCls} style={{ transform: `translateY(${top}px)` }}>
		<DataCellGroup>
			<Address>{offset.toString(16).padStart(8, "0")}</Address>
		</DataCellGroup>
		<Suspense fallback="Loading...">
			<DataRowContents offset={offset} width={width} />
		</Suspense>
	</div>
);

const DataCell: React.FC<{
	byte: number;
	isChar: boolean;
	value: string;
	className?: string;
}> = ({ byte, value, className, isChar }) => {
	const elRef = useRef<HTMLSpanElement | null>(null);
	const focusedElement = new FocusedElement(isChar, byte);

	const ctx = useDisplayContext();

	const onMouseEnter = useCallback(() => {
		const last = ctx.selection[0];
		ctx.hoveredByte = focusedElement;
		if (ctx.isSelecting && last) {
			const newRange = last.direction === RangeDirection.Ascending
				? new Range(last.start, byte + 1) : new Range(last.end, byte);
			ctx.replaceLastSelectionRange(newRange);
		}
	}, [byte, focusedElement]);

	const onMouseLeave = useCallback((e: React.MouseEvent) => {
		ctx.hoveredByte = undefined;
		if ((e.buttons & 1) && !ctx.isSelecting) {
			ctx.isSelecting = true;
			if (e.ctrlKey || e.metaKey) {
				ctx.addSelectionRange(Range.single(byte));
			} else {
				ctx.replaceSelectionRanges([Range.single(byte)]);
			}
		}
	}, [byte]);

	const onMouseUp = useCallback((e: React.MouseEvent) => {
		const prevFocused = ctx.focusedElement || FocusedElement.zero;
		ctx.focusedElement = focusedElement;

		if (ctx.isSelecting) {
			ctx.isSelecting = false;
		} else if (e.shiftKey) {
			// on a shift key, the user is expanding the selection (or deselection)
			// of an existing byte. We *don't* include that byte since we don't want
			// to swap the byte.
			const pb = prevFocused.byte;
			const asc = pb < byte;
			if (e.ctrlKey || e.metaKey) {
				ctx.addSelectionRange(Range.inclusive(asc ? pb + 1 : pb, byte));
			} else {
				ctx.replaceSelectionRanges([Range.inclusive(asc ? pb : pb + 1, byte)]);
			}
		} else if (e.ctrlKey || e.metaKey) {
			ctx.addSelectionRange(Range.single(byte));
		} else {
			ctx.replaceSelectionRanges([Range.single(byte)]);
		}
	}, [focusedElement.key, byte]);

	const isFocused = useIsFocused(focusedElement);
	useEffect(() => {
		if (isFocused) {
			elRef.current?.focus();
		}
	}, [isFocused]);

	return (
		<span
			ref={elRef}
			tabIndex={0}
			className={clsx(
				dataCellCls,
				className,
				useIsHovered(focusedElement) && dataCellHoveredCls,
				useIsSelected(byte) && dataCellSelectedCls,
				isFocused && dataCellFocusedCls,
			)}
			onMouseEnter={onMouseEnter}
			onMouseUp={onMouseUp}
			onMouseLeave={onMouseLeave}
		>{value}</span>
	);
};

const DataRowContents: React.FC<{ offset: number; width: number }> = ({ offset, width }) => {
	const dataPageSize = useRecoilValue(select.dataPageSize);

	const startPageNo = Math.floor(offset / dataPageSize);
	const startPageStartsAt = startPageNo * dataPageSize;
	const endPageNo = Math.floor((offset + width) / dataPageSize);
	const endPageStartsAt = endPageNo * dataPageSize;

	const startPage = useRecoilValue(select.dataPages(startPageNo));
	const endPage = useRecoilValue(select.dataPages(endPageNo));
	let memoValue = "";
	const rawBytes = new Uint8Array(width);
	for (let i = 0; i < width; i++) {
		const boffset = offset + i;
		const value = boffset >= endPageStartsAt
			? endPage[boffset - endPageStartsAt]
			: startPage[boffset - startPageStartsAt];
		memoValue += "," + value;
		rawBytes[i] = value;
	}

	const { bytes, chars } = useMemo(() => {
		const bytes: React.ReactChild[] = [];
		const chars: React.ReactChild[] = [];
		for (let i = 0; i < width; i++) {
			const boffset = offset + i;
			const value = rawBytes[i];

			if (value === undefined) {
				bytes.push(<EmptyDataCell key={i} />);
				chars.push(<EmptyDataCell key={i} />);
				continue;
			}

			bytes.push(<DataCell
				key={i}
				byte={boffset}
				isChar={false}
				value={value.toString(16).padStart(2, "0")}
			/>);

			const char = getAsciiCharacter(value);
			chars.push(<DataCell
				key={i}
				byte={boffset}
				isChar={true}
				className={char === undefined ? nonGraphicCharCls : undefined}
				value={char === undefined ? "." : char}
			/>);
		}
		return { bytes, chars };
	}, [memoValue]);

	return (
		<>
			<DataCellGroup>{bytes}</DataCellGroup>
			<DataCellGroup>{chars}</DataCellGroup>
		</>
	);
};
