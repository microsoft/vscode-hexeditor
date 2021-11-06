// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { css } from "@linaria/core";
import { styled } from "@linaria/react";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRecoilTransaction_UNSTABLE, useRecoilValue, useSetRecoilState } from "recoil";
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
`;

const DataCellSimple = styled.div`
	font-family: var(--vscode-editor-font-family);
	width: var(--cell-size);
	height: var(--cell-size);
	line-height: var(--cell-size);
	text-align: center;
	display: inline-block;
`;

const DataCellGroup = styled.div`
	padding: 0 calc(var(--cell-size) / 4);
	display: inline-block;
	cursor: default;
	user-select: none;
`;

const nonGraphicCharCls = css`
	opacity: 0.3;
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

const Byte: React.FC<{ value: number }> = ({ value }) => (
	<DataCellSimple>{value.toString(16).padStart(2, "0")}</DataCellSimple>
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
	const offset = useRecoilValue(select.offset);
	const dimensions = useRecoilValue(select.dimensions);
	const setIsSelecting = useSetRecoilState(select.isSelecting);
	const endBytes = offset + select.getDisplayedBytes(dimensions);
	const rows: React.ReactChild[] = [];
	let row = 0;
	for (let i = offset; i < endBytes; i += dimensions.rowByteWidth) {
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

	useEffect(() => {
		const l = () => setIsSelecting(false);
		window.addEventListener("mouseup", l, { passive: true });
		return () => window.removeEventListener("mouseup", l);
	}, []);

	return <div className={dataDisplayCls}>{rows}</div>;
};

const dataRowCls = css`
	position: absolute;
	left: 0;
	top: 0;
	right: 0;
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
	value: string;
	className?: string;
	isHovered: boolean;
	onMouseEnter(byte: number): void;
	onMouseLeave(byte: number): void;
}> = ({ byte, value, className, isHovered, onMouseEnter, onMouseLeave }) => {
	const onMouseEnterTxn = useRecoilTransaction_UNSTABLE(({ get, set }) => (byte: number) => {
		const selection = get(select.selection);
		const isSelecting = get(select.isSelecting);
		if (isSelecting && selection.length) {
			set(select.focusedByte, byte);
			const newRange = selection[0].direction === RangeDirection.Ascending
				? new Range(selection[0].start, byte + 1)
				: new Range(selection[0].end, byte);
			set(select.selection, selection.length > 1 ? [newRange, ...selection.slice(1)] : [newRange]);
		}
	});

	const onMouseLeaveTxn = useRecoilTransaction_UNSTABLE(({ get, set }) => (byte: number, e: React.MouseEvent) => {
		if ((e.buttons & 1) && !get(select.isSelecting)) {
			set(select.selection, [new Range(byte, byte + 1)]);
			set(select.isSelecting, true);
		}
	});

	const onMouseUpTxn = useRecoilTransaction_UNSTABLE(({ get, set }) => (byte: number, e: React.MouseEvent) => {
		const prevFocused = get(select.focusedByte) || 0;
		set(select.focusedByte, byte);

		if (get(select.isSelecting)) {
			set(select.isSelecting, false);
		} else if (e.shiftKey) {
			// on a shift key, the user is expanding the selection (or deselection)
			// of an existing byte. We *don't* include that byte since we don't want
			// to swap the byte.
			const asc = prevFocused < byte;
			const end = asc ? byte + 1 : byte;
			set(select.selection, e.ctrlKey
				? [new Range(asc ? prevFocused + 1 : prevFocused, end), ...get(select.selection)]
				: [new Range(asc ? prevFocused : prevFocused + 1, end)]);
		} else if (e.ctrlKey) {
			set(select.selection, [new Range(byte, byte + 1), ...get(select.selection)]);
		} else {
			set(select.selection, [new Range(byte, byte + 1)]);
		}
	});

	return (
		<DataCellSimple
			className={clsx(
				className,
				isHovered && dataCellHoveredCls,
				useRecoilValue(select.isByteFocused(byte)) && dataCellFocusedCls,
				useRecoilValue(select.isByteSelected(byte)) && dataCellSelectedCls,
			)}
			onMouseEnter={() => {
				onMouseEnterTxn(byte);
				onMouseEnter(byte);
			}}
			onMouseUp={e => onMouseUpTxn(byte, e)}
			onMouseLeave={e => {
				onMouseLeaveTxn(byte, e);
				onMouseLeave(byte);
			}}
		>{value}</DataCellSimple>
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

	const bytes: React.ReactChild[] = [];
	const chars: React.ReactChild[] = [];
	for (let i = 0; i < width; i++) {
		const boffset = offset + i;
		const value = offset >= endPageStartsAt
			? endPage[boffset - endPageStartsAt]
			: startPage[boffset - startPageStartsAt];

		bytes.push(<DataCell
			key={i}
			byte={boffset}
			value={value.toString(16).padStart(2, "0")}
			isHovered={hoveredByte === boffset}
			onMouseEnter={setHoveredByte}
			onMouseLeave={unsetHoveredByte}
		/>);

		const char = getAsciiCharacter(value);
		chars.push(<DataCell
			key={i}
			byte={boffset}
			className={char === undefined ? nonGraphicCharCls : undefined}
			value={char === undefined ? "." : char}
			isHovered={hoveredByte === boffset}
			onMouseEnter={setHoveredByte}
			onMouseLeave={unsetHoveredByte}
		/>);
	}

	return (
		<>
			<DataCellGroup>{bytes}</DataCellGroup>
			<DataCellGroup>{chars}</DataCellGroup>
		</>
	);
};
