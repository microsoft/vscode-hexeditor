import { styled } from "@linaria/react";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { Endianness } from "../../shared/protocol";
import { FocusedElement, getDataCellElement, useDisplayContext } from "./dataDisplayContext";
import { usePersistedState } from "./hooks";
import * as select from "./state";
import { reverseInPlace } from "./util";
import { VsTooltipPopover } from "./vscodeUi";

export const DataInspector: React.FC = () => {
	const ctx = useDisplayContext();
	const defaultEndianness = useRecoilValue(select.editorSettings).defaultEndianness;
	const [endianness, setEndianness] = usePersistedState("endianness", defaultEndianness);
	const [inspected, setInspected] = useState<FocusedElement>();
	const anchor = useMemo(() => inspected && getDataCellElement(inspected), [inspected]);

	useEffect(() => {
		let hoverTimeout: NodeJS.Timeout | undefined;

		const disposable = ctx.onDidHover(target => {
			if (hoverTimeout) {
				clearTimeout(hoverTimeout);
				hoverTimeout = undefined;
			}
			if (target && !ctx.isSelecting) {
				setInspected(undefined);
				hoverTimeout = setTimeout(() => setInspected(target), 500);
			}
		});

		return () => disposable.dispose();
	}, []);


	if (!inspected || !anchor) {
		return null;
	}

	return <VsTooltipPopover
		anchor={anchor}
		hide={() => setInspected(undefined)} visible={true}>
		<Suspense fallback="Loading...">
			<InspectorContents offset={inspected.byte} endianness={endianness} setEndianness={setEndianness} />
		</Suspense>
	</VsTooltipPopover>;
};

const lookahead = 8;

const TypesList = styled.dl`
	display: grid;
	grid-template-columns: max-content max-content max-content max-content;
	gap: 0.3rem 1rem;
	align-items: center;
	margin: 0;

	dd, dl {
		margin: 0;
	}

	dd {
		font-family: var(--vscode-editor-font-family);
	}
`;

const InspectorContents: React.FC<{
	offset: number;
	endianness: Endianness;
	setEndianness: (e: Endianness) => void;
}> = ({ offset, endianness, setEndianness }) => {
	const dataPageSize = useRecoilValue(select.dataPageSize);
	const startPageNo = Math.floor(offset / dataPageSize);
	const startPageStartsAt = startPageNo * dataPageSize;
	const endPageNo = Math.floor((offset + lookahead) / dataPageSize);
	const endPageStartsAt = endPageNo * dataPageSize;

	const startPage = useRecoilValue(select.editedDataPages(startPageNo));
	const endPage = useRecoilValue(select.editedDataPages(endPageNo));

	const target = new Uint8Array(lookahead);
	for (let i = 0; i < lookahead; i++) {
		if (offset + i >= endPageStartsAt) {
			target[i] = endPage[offset + i - endPageStartsAt];
		} else {
			target[i] = startPage[offset + i - startPageStartsAt];
		}
	}

	const utf8 = getUtf8(target);
	const utf16 = getUTF16(target);
	if (endianness === Endianness.Little) {
		reverseInPlace(target);
	}

	const dv = new DataView(target.buffer);

	return <>
		<TypesList>
			<dt>uint8</dt>
			<dd>{dv.getUint8(0)}</dd>
			<dt>int8</dt>
			<dd>{dv.getInt8(0)}</dd>

			<dt>uint16</dt>
			<dd>{dv.getUint16(0)}</dd>
			<dt>int16</dt>
			<dd>{dv.getInt16(0)}</dd>

			<dt>uint32</dt>
			<dd>{dv.getUint32(0)}</dd>
			<dt>int32</dt>
			<dd>{dv.getInt32(0)}</dd>

			<dt>int64</dt>
			<dd>{dv.getBigInt64(0).toString()}</dd>
			<dt>uint64</dt>
			<dd>{dv.getBigUint64(0).toString()}</dd>

			<dt>float32</dt>
			<dd>{dv.getFloat32(0)}</dd>
			<dt>float64</dt>
			<dd>{dv.getFloat64(0)}</dd>

			<dt>UTF-8</dt>
			<dd>{utf8}</dd>
			<dt>UTF-16</dt>
			<dd>{utf16}</dd>
		</TypesList>
		<EndiannessToggle endianness={endianness} setEndianness={setEndianness} />
	</>;
};

const EndiannessToggleContainer = styled.div`
	display: flex;
	justify-content: flex-end;
`;

const EndiannessToggle: React.FC<{
	endianness: Endianness;
	setEndianness: (e: Endianness) => void;
}> = ({ endianness, setEndianness }) => (
	<EndiannessToggleContainer>
		<label htmlFor="endian-checkbox">Little Endian</label>
		<input
			type="checkbox"
			id="endian-checkbox"
			checked={endianness === Endianness.Little}
			onChange={evt => setEndianness(evt.target.checked ? Endianness.Little : Endianness.Big)}
		/>
	</EndiannessToggleContainer>
);

/**
 * @description Converts the byte data to a utf-8 character
 * @param {boolean} littleEndian Whether or not it's represented in little endian
 * @returns {string} The utf-8 character
 */
const getUtf8 = (buf: Uint8Array): string => {
	const utf8 = new TextDecoder("utf-8").decode(buf);
	// We iterate through the string and immediately reutrn the first character
	for (const char of utf8) return char;
	return utf8;
};

/**
 * @description Converts the byte data to a utf-16 character
 * @param {boolean} littleEndian Whether or not it's represented in little endian
 * @returns {string} The utf-16 character
 */
const getUTF16 = (buf: Uint8Array): string => {
	const utf16 = new TextDecoder("utf-16").decode(buf);
	// We iterate through the string and immediately reutrn the first character
	for (const char of utf16) return char;
	return utf16;
};
