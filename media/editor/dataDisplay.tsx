// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { css } from "@linaria/core";
import { styled } from "@linaria/react";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { EditRangeOp, HexDocumentEditOp } from "../../shared/hexDocumentModel";
import { DataDisplayContext, DisplayContext, FocusedElement, useDisplayContext, useIsFocused, useIsHovered, useIsSelected, useIsUnsaved } from "./dataDisplayContext";
import * as select from "./state";
import { clsx, getAsciiCharacter, Range, RangeDirection } from "./util";

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

	&:focus {
		outline-offset: 1px;
		outline: var(--vscode-focusBorder) 2px solid;
	}
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

const dataCellUnsavedCls = css`
	background: var(--vscode-minimapGutter-modifiedBackground);
`;

const EmptyDataCell = () => (
	<span
		className={dataCellCls}
		aria-hidden
		style={{ visibility: "hidden" }}
	>00</span>
);

const Byte: React.FC<{ value: number }> = ({ value }) => (
	<span className={dataCellCls}>{value.toString(16).padStart(2, "0").toUpperCase()}</span>
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
	const setOffset = useSetRecoilState(select.offset);
	const setScrollBounds = useSetRecoilState(select.scrollBounds);
	const dimensions = useRecoilValue(select.dimensions);
	const fileSize = useRecoilValue(select.fileSize);
	const editTimeline = useRecoilValue(select.editTimeline);
	const lastSavedEdit = useRecoilValue(select.lastSavedEdit);

	const setEdit = useSetRecoilState(select.edits);
	const ctx = useMemo(() => new DisplayContext(setEdit), []);

	useEffect(() => {
		const l = () => { ctx.isSelecting = false; };
		window.addEventListener("mouseup", l, { passive: true });
		return () => window.removeEventListener("mouseup", l);
	}, []);

	// When the focused byte changes, make sure it's in view
	useEffect(() => {
		const disposable = ctx.onDidChangeAnyFocus(byte => {
			if (!byte) {
				return;
			}

			const displayedBytes = select.getDisplayedBytes(dimensions);
			const byteRowStart = Math.floor(byte / dimensions.rowByteWidth) * dimensions.rowByteWidth;
			let newOffset: number;

			setOffset(offset => {
				if (byte < offset) {
					return newOffset = byteRowStart;
				} else if (byte - offset >= displayedBytes) {
					return newOffset = byteRowStart - displayedBytes + dimensions.rowByteWidth;
				} else {
					return offset;
				}
			});

			if (newOffset! !== undefined) {
				setScrollBounds(scrollBounds => {
					if (newOffset < scrollBounds.start) {
						return scrollBounds.expandToContain(newOffset);
					} else if (newOffset > scrollBounds.end) {
						return scrollBounds.expandToContain(newOffset + displayedBytes * 2);
					} else {
						return scrollBounds;
					}
				});
			}
		});
		return () => disposable.dispose();
	}, [dimensions]);

	useEffect(() => {
		const unsavedRanges: Range[] = [];
		for (let i = 0; i < editTimeline.ranges.length; i++) {
			const range = editTimeline.ranges[i];
			// todo: eventually support delete decorations?
			if (range.op !== EditRangeOp.Insert || range.opId <= lastSavedEdit) {
				continue;
			}

			if (range.value.byteLength > 0) {
				unsavedRanges.push(new Range(range.offset, range.offset + range.value.byteLength));
			}
		}
		ctx.unsavedRanges = unsavedRanges;
	}, [editTimeline, lastSavedEdit]);

	const onKeyDown = (e: React.KeyboardEvent) => {
		const current = ctx.focusedElement || FocusedElement.zero;
		const displayedBytes = select.getDisplayedBytes(dimensions);

		let delta = 0;
		switch (e.key) {
			case "ArrowLeft":
				delta = -1;
				break;
			case "ArrowRight":
				delta = 1;
				break;
			case "ArrowDown":
				delta = dimensions.rowByteWidth;
				break;
			case "ArrowUp":
				delta = -dimensions.rowByteWidth;
				break;
			case "Home":
				delta = -current.byte;
				break;
			case "End":
				delta = fileSize === undefined ? displayedBytes : fileSize - current.byte - 1;
				break;
			case "PageUp":
				delta = -displayedBytes;
				break;
			case "PageDown":
			case "Space":
				delta = displayedBytes;
				break;
		}

		if (e.altKey) {
			delta *= 8;
		}

		const next = new FocusedElement(current.char, Math.min(Math.max(0, current.byte + delta), fileSize ?? Infinity));
		if (next.key === current.key) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		ctx.focusedElement = next;

		if (e.shiftKey) {
			const srange = ctx.selection[0];
			if (!srange) {
				ctx.setSelectionRanges([Range.inclusive(current.byte, next.byte)]);
			} else if (!srange.includes(next.byte)) {
				ctx.replaceLastSelectionRange(srange.expandToContain(next.byte));
			} else {
				const closerToEnd = Math.abs(srange.end - current.byte) < Math.abs(srange.start - current.byte);
				const nextRange = closerToEnd ? new Range(srange.start, next.byte + 1) : new Range(next.byte, srange.end);
				ctx.addSelectionRange(nextRange);
			}
		} else {
			ctx.setSelectionRanges([Range.single(next.byte)]);
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

let opIdCounter = 0;

const keysToOctets = new Map([
	["0", 0x0], ["1", 0x1], ["2", 0x2], ["3", 0x3], ["4", 0x4], ["5", 0x5],
	["6", 0x6], ["7", 0x7], ["8", 0x8], ["9", 0x9], ["a", 0xa], ["b", 0xb],
	["c", 0xc], ["d", 0xd], ["e", 0xe], ["f", 0xf],
]);

for (const [key, value] of keysToOctets) {
	keysToOctets.set(key.toUpperCase(), value);
}

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
				ctx.setSelectionRanges([Range.single(byte)]);
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
				ctx.setSelectionRanges([Range.inclusive(asc ? pb : pb + 1, byte)]);
			}
		} else if (e.ctrlKey || e.metaKey) {
			ctx.addSelectionRange(Range.single(byte));
		} else {
			ctx.setSelectionRanges([Range.single(byte)]);
		}
	}, [focusedElement.key, byte]);

	const isFocused = useIsFocused(focusedElement);
	useEffect(() => {
		if (isFocused) {
			elRef.current?.focus();
		}
	}, [isFocused]);

	// Filling in a byte cell requires two octets to be entered. This stores
	// the first octet, and is reset if the user stops editing.
	const [firstOctetOfEdit, setFirstOctetOfEdit] = useState<number>();
	const onKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.metaKey || e.ctrlKey || e.altKey) {
			return;
		}

		let val: number;
		if (isChar && e.key.length === 1) {
			val = e.key.charCodeAt(0);
		} else if (keysToOctets.has(e.key)) {
			val = keysToOctets.get(e.key)!;
		} else {
			return;
		}

		e.stopPropagation();

		if (isChar) {
			// b is final
		} else if (firstOctetOfEdit !== undefined) {
			val = firstOctetOfEdit << 4 | val;
		} else {
			return setFirstOctetOfEdit(val);
		}

		ctx.focusedElement = ctx.focusedElement?.shift(1);
		setFirstOctetOfEdit(undefined);
		ctx.edit({
			op: HexDocumentEditOp.Replace,
			opId: opIdCounter++,
			previous: new Uint8Array([byte]),
			value: new Uint8Array([val]),
			offset: byte,
		});
	}, [byte, isChar, firstOctetOfEdit]);

	return (
		<span
			ref={elRef}
			tabIndex={0}
			className={clsx(
				dataCellCls,
				className,
				useIsHovered(focusedElement) && dataCellHoveredCls,
				useIsSelected(byte) && dataCellSelectedCls,
				useIsUnsaved(byte) && dataCellUnsavedCls,
			)}
			onMouseEnter={onMouseEnter}
			onMouseUp={onMouseUp}
			onMouseLeave={onMouseLeave}
			onKeyDown={onKeyDown}
		>{value}</span>
	);
};

const DataRowContents: React.FC<{ offset: number; width: number }> = ({ offset, width }) => {
	const dataPageSize = useRecoilValue(select.dataPageSize);

	const startPageNo = Math.floor(offset / dataPageSize);
	const startPageStartsAt = startPageNo * dataPageSize;
	const endPageNo = Math.floor((offset + width) / dataPageSize);
	const endPageStartsAt = endPageNo * dataPageSize;

	const startPage = useRecoilValue(select.editedDataPages(startPageNo));
	const endPage = useRecoilValue(select.editedDataPages(endPageNo));

	let memoValue = "";
	let rawBytes = new Uint8Array(width);
	for (let i = 0; i < width; i++) {
		const boffset = offset + i;
		const value = boffset >= endPageStartsAt
			? endPage[boffset - endPageStartsAt]
			: startPage[boffset - startPageStartsAt];
		if (value === undefined) {
			rawBytes = rawBytes.subarray(0, i);
			break;
		}

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
				value={value.toString(16).padStart(2, "0").toUpperCase()}
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
