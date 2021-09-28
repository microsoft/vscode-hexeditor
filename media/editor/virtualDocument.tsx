// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { ComponentChild, Fragment, FunctionComponent, h } from "preact";
import { useRecoilValue } from "recoil";
import { ByteData } from "./byteData";
import * as select from "./state";
import { getAsciiCharacter } from "./util";

export interface VirtualizedPacket {
	offset: number;
	data: ByteData;
}

export const DataDisplay: FunctionComponent = () => {
	const startByte = useRecoilValue(select.offset);
	const dataPageSize = useRecoilValue(select.dataPageSize);
	const dimensions = useRecoilValue(select.dimensions);
	const endByte = Math.ceil(dimensions.height / dimensions.rowHeight) * 16;

	const startPage = Math.floor(startByte / dataPageSize);
	const endPage = Math.ceil(endByte / dataPageSize);
	const children: ComponentChild[] = [];
	for (let i = startPage; i <= endPage; i++) {
		children.push(<DataPage key={i} pageSize={dataPageSize} rowHeight={dimensions.rowHeight} pageNumber={i} />);
	}

	return <>
		<div className="data-header">
			<div className="address" aria-hidden>{"0".repeat(0)}</div>
			<div className="bytes">{new Array(16).fill(0).map((_v, i) =>
				<span key={i} className="data-row-byte">{i.toString(16).padStart(2, "0")}</span>
			)}</div>
			<div className="text">Decoded Text</div>
		</div>
		<>{children}</>
	</>;
};

const DataPage: FunctionComponent<{ pageSize: number; pageNumber: number; rowHeight: number }> = ({ rowHeight, pageSize, pageNumber }) => {
	const data = useRecoilValue(select.dataPages(pageNumber));
	const rows: ComponentChild[] = [];
	for (let i = 0; i < pageSize && i < data.length; i += 16) {
		rows.push(<DataRow key={i} offset={pageSize * pageNumber + i} y={rowHeight * (i / 16)} data={data.subarray(i, i + 16)} />);
	}

	return <>{rows}</>;
};

const DataRow: FunctionComponent<{ offset: number; y: number; data: Uint8Array }> = ({ offset, y, data }) => {
	const bytes: ComponentChild[] = [];
	for (let i = 0; i < 16; i++) {
		bytes.push(<div className="data-row-byte" key={i}>{data[i].toString(16).padStart(8, "0")}</div>);
	}

	const chars: ComponentChild[] = [];
	for (let i = 0; i < 16; i++) {
		const char = getAsciiCharacter(data[i]);
		if (char) {
			chars.push(<div className="data-row-cell char" key={i}>{char}</div>);
		} else {
			chars.push(<div className="data-row-cell char nongraphic" key={i}>{char}</div>);
		}
	}

	return (
		<div className="data-row" style={{ top: y }}>
			<div className="address">{offset.toString(16).padStart(8, "0")}</div>
			<div className="bytes">{bytes}</div>
			<div className="text">{chars}</div>
		</div>
	);
};
