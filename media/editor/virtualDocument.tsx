// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { styled } from "@linaria/react";
import { ComponentChild, Fragment, FunctionComponent, h } from "preact";
import { Suspense } from "preact/compat";
import { useRecoilValue } from "recoil";
import { ByteData } from "./byteData";
import * as select from "./state";
import { getAsciiCharacter } from "./util";
import { css } from "@linaria/core";

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

const DataCell = styled.div`
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
`;

const DataCellChar = styled(DataCell)``;
const DataCellNonGraphicChar = styled(DataCellChar)`
	opacity: 0.3;
`;

const Byte: FunctionComponent<{ value: number }> = ({ value }) => (
	<DataCell>{value.toString(16).padStart(2, "0")}</DataCell>
);

const dataDisplayCls = css`
	padding: 0 20px;
`;

export const DataHeader: FunctionComponent<{ width: number }> = ({ width }) => (
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

export const DataDisplay: FunctionComponent = () => {
	const startByte = useRecoilValue(select.offset);
	const scrollBounds = useRecoilValue(select.scrollBounds);
	const { rowByteWidth: rowCellWidth, rowPxHeight, height } = useRecoilValue(select.dimensions);
	const endByte = Math.ceil(height / rowPxHeight) * rowCellWidth;

	const children: ComponentChild[] = [];
	for (let i = startByte; i <= endByte; i += rowCellWidth) {
		children.push(<DataRow key={i} offset={i} top={(i - scrollBounds.from) / rowCellWidth * rowPxHeight} width={rowCellWidth} />);
	}

	return <div className={dataDisplayCls}>{children}</div>;
};


const dataRowCls = css`
	position: absolute;
	left: 0;
	top: 0;
	right: 0;
`;

const DataRow: FunctionComponent<{ top: number; offset: number; width: number }> = ({ top, offset, width }) => (
	<div className={dataRowCls} style={{ transform: `translateY(${top}px)` }}>
		<DataCellGroup>
			<Address>{offset.toString(16).padStart(8, "0")}</Address>
		</DataCellGroup>
		<Suspense fallback="Loading...">
			<DataRowContents offset={offset} width={width} />
		</Suspense>
	</div>
);

const DataRowContents: FunctionComponent<{ offset: number; width: number }> = ({ offset, width }) => {
	const dataPageSize = useRecoilValue(select.dataPageSize);

	const startPageNo = Math.floor(offset / dataPageSize);
	const startPageStartsAt = startPageNo * dataPageSize;
	const endPageNo = Math.floor((offset + width) / dataPageSize);
	const endPageStartsAt = endPageNo * dataPageSize;

	const startPage = useRecoilValue(select.dataPages(startPageNo));
	const endPage = useRecoilValue(select.dataPages(endPageNo));

	const bytes: ComponentChild[] = [];
	const chars: ComponentChild[] = [];
	for (let i = 0; i < width; i++) {
		const boffset = offset + i;
		const byte = offset >= endPageStartsAt
			? endPage[boffset - endPageStartsAt]
			: startPage[boffset - startPageStartsAt];

		bytes.push(<Byte key={i} value={byte} />);

		const char = getAsciiCharacter(byte);
		if (char) {
			chars.push(<DataCellChar key={i}>{char}</DataCellChar>);
		} else {
			chars.push(<DataCellNonGraphicChar key={i}>.</DataCellNonGraphicChar>);
		}
	}

	return (
		<>
			<DataCellGroup>{bytes}</DataCellGroup>
			<DataCellGroup>{chars}</DataCellGroup>
		</>
	);
};
