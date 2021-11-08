// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { css } from "@linaria/core";
import { styled } from "@linaria/react";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilTransaction_UNSTABLE, useRecoilValue, useSetRecoilState } from "recoil";
import { MessageType } from "../../shared/protocol";
import { ByteData } from "./byteData";
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
	const setIsSelecting = useSetRecoilState(select.isSelecting);
	const setSelection = useSetRecoilState(select.selection);
	const [focusedByte, setFocusedByte] = useRecoilState(select.focusedByte);

	useEffect(() => {
		const l = () => setIsSelecting(false);
		window.addEventListener("mouseup", l, { passive: true });
		return () => window.removeEventListener("mouseup", l);
	}, []);

	const onKeyDown = (e: React.KeyboardEvent) => {
		const current = focusedByte || select.FocusedByte.zero;

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
		}

		if (e.ctrlKey || e.metaKey) {
			delta *= 10;
		}

		const next = new select.FocusedByte(current.char, Math.min(Math.max(0, current.byte + delta), fileSize ?? Infinity));
		if (next.equals(current)) {
			return;
		}

		e.preventDefault();
		setFocusedByte(next);

		if (e.shiftKey) {
			setSelection(selection => {
				const srange = selection[0];
				if (!srange) {
					return [Range.inclusive(current.byte, next.byte)];
				}

				if (!srange.includes(next.byte)) {
					return [srange.expandToContain(next.byte), ...selection.slice(1)];
				}

				const closerToEnd = Math.abs(srange.end - current.byte) < Math.abs(srange.start - current.byte);
				const nextRange = closerToEnd ? new Range(srange.start, next.byte + 1) : new Range(next.byte, srange.end);
				return [nextRange, ...selection.slice(1)];
			});
		}

		const displayedBytes = select.getDisplayedBytes(dimensions);
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

	return <div
		ref={containerRef}
		className={dataDisplayCls}
		onKeyDown={onKeyDown}
	><DataRows /></div>;
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
	isHovered: boolean;
	onMouseEnter(byte: number): void;
	onMouseLeave(byte: number): void;
}> = ({ byte, value, className, isHovered, onMouseEnter, isChar, onMouseLeave }) => {
	const elRef = useRef<HTMLSpanElement | null>(null);
	const focusedByte = useMemo(() => new select.FocusedByte(isChar, byte), [isChar, byte]);

	const onMouseEnterTxn = useRecoilTransaction_UNSTABLE(({ get, set }) => (byte: number) => {
		const selection = get(select.selection);
		const isSelecting = get(select.isSelecting);
		if (isSelecting && selection.length) {
			const newRange = selection[0].direction === RangeDirection.Ascending
				? new Range(selection[0].start, byte + 1)
				: new Range(selection[0].end, byte);
			set(select.selection, selection.length > 1 ? [newRange, ...selection.slice(1)] : [newRange]);
		}
	}, []);

	const onMouseLeaveTxn = useRecoilTransaction_UNSTABLE(({ get, set }) => (byte: number, e: React.MouseEvent) => {
		if ((e.buttons & 1) && !get(select.isSelecting)) {
			set(select.selection, e.ctrlKey || e.metaKey ? [Range.single(byte), ...get(select.selection)] : [Range.single(byte)]);
			set(select.isSelecting, true);
		}
	}, []);

	const onMouseUpTxn = useRecoilTransaction_UNSTABLE(({ get, set }) => (byte: number, e: React.MouseEvent) => {
			const prevFocused = get(select.focusedByte) || select.FocusedByte.zero;
			set(select.focusedByte, focusedByte);

		if (get(select.isSelecting)) {
			set(select.isSelecting, false);
		} else if (e.shiftKey) {
			// on a shift key, the user is expanding the selection (or deselection)
			// of an existing byte. We *don't* include that byte since we don't want
			// to swap the byte.
			const pb = prevFocused.byte;
			const asc = pb < byte;
			set(select.selection, e.ctrlKey || e.metaKey
				? [Range.inclusive(asc ? pb + 1 : pb, byte), ...get(select.selection)]
				: [Range.inclusive(asc ? pb : pb + 1, byte)]);
		} else if (e.ctrlKey || e.metaKey) {
			set(select.selection, [Range.single(byte), ...get(select.selection)]);
		} else {
			set(select.selection, [Range.single(byte)]);
		}
	}, [focusedByte]);

	const isFocused = useRecoilValue(select.isByteFocused(focusedByte));
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
				isHovered && dataCellHoveredCls,
				useRecoilValue(select.isByteSelected(byte)) && dataCellSelectedCls,
				isFocused && dataCellFocusedCls,
			)}
			onMouseEnter={useCallback(() => {
				onMouseEnterTxn(byte);
				onMouseEnter(byte);
			}, [onMouseEnterTxn, onMouseEnter, byte])}
			onMouseUp={useCallback(e => onMouseUpTxn(byte, e), [onMouseUpTxn, byte])}
			onMouseLeave={useCallback(e => {
				onMouseLeaveTxn(byte, e);
				onMouseLeave(byte);
			}, [onMouseLeaveTxn, onMouseLeave, byte])}
		>{value}</span>
	);
};

const DataRowContents: React.FC<{ offset: number; width: number }> = ({ offset, width }) => {
	const dataPageSize = useRecoilValue(select.dataPageSize);
	const [hoveredByte, setHoveredByte] = useState<number>();
	const unsetHoveredByte = useCallback(() => setHoveredByte(undefined), []);

	const startPageNo = Math.floor(offset / dataPageSize);
	const startPageStartsAt = startPageNo * dataPageSize;
	const endPageNo = Math.floor((offset + width) / dataPageSize);
	const endPageStartsAt = endPageNo * dataPageSize;

	const startPage = useRecoilValue(select.dataPages(startPageNo));
	const endPage = useRecoilValue(select.dataPages(endPageNo));

	const { bytes, chars } = useMemo(() => {
		const bytes: React.ReactChild[] = [];
		const chars: React.ReactChild[] = [];
		for (let i = 0; i < width; i++) {
			const boffset = offset + i;
			const value = boffset >= endPageStartsAt
				? endPage[boffset - endPageStartsAt]
				: startPage[boffset - startPageStartsAt];

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
				isHovered={hoveredByte === boffset}
				onMouseEnter={setHoveredByte}
				onMouseLeave={unsetHoveredByte}
			/>);

			const char = getAsciiCharacter(value);
			chars.push(<DataCell
				key={i}
				byte={boffset}
				isChar={true}
				className={char === undefined ? nonGraphicCharCls : undefined}
				value={char === undefined ? "." : char}
				isHovered={hoveredByte === boffset}
				onMouseEnter={setHoveredByte}
				onMouseLeave={unsetHoveredByte}
			/>);
		}
		return { bytes, chars, hoveredByte };
	}, [startPage, endPage]);

	return (
		<>
			<DataCellGroup>{bytes}</DataCellGroup>
			<DataCellGroup>{chars}</DataCellGroup>
		</>
	);
};
