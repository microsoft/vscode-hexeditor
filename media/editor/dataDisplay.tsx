// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import { css } from "@linaria/core";
import { styled } from "@linaria/react";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { EditRangeOp, HexDocumentEditOp } from "../../shared/hexDocumentModel";
import { InspectorLocation, MessageType } from "../../shared/protocol";
import { PastePopup } from "./copyPaste";
import { dataCellCls, FocusedElement, useDisplayContext, useIsFocused, useIsHovered, useIsSelected, useIsUnsaved } from "./dataDisplayContext";
import { DataInspectorAside } from "./dataInspector";
import { useFileBytes, useGlobalHandler } from "./hooks";
import * as select from "./state";
import { clamp, clsx, getAsciiCharacter, getScrollDimensions, Range, RangeDirection } from "./util";

const Header = styled.div`
	font-weight: bold;
	color: var(--vscode-editorLineNumber-activeForeground);
	white-space: nowrap;
	display: flex;
	align-items: center;
`;

const Address = styled.div`
	font-family: var(--vscode-editor-font-family);
	color: var(--vscode-editorLineNumber-foreground);
	text-transform: uppercase;
	line-height: var(--cell-size);
`;

const DataCellGroup = styled.div`
	padding: 0 calc(var(--cell-size) / 4);
	display: inline-flex;
	cursor: default;
	user-select: text;
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

// Byte cells are square, and show two (hex) characters, but text cells show a
// single character so can be narrower--by this constant multiplier.
const textCellWidth = 0.7;

const DataInspectorWrap = styled.div`
	position: absolute;
	top: var(--cell-size);
	font-weight: normal;
	z-index: 2;
	line-height: var(--cell-size);
	left: calc(var(--cell-size) / 4);
	right: var(--scrollbar-width);
	overflow: hidden;

	dl {
		gap: 0 0.4rem !important;
	}
`;

export const DataHeader: React.FC = () => {
	const editorSettings = useRecoilValue(select.editorSettings);
	const inspectorLocation = useRecoilValue(select.dataInspectorLocation);

	return <Header>
		<DataCellGroup style={{ visibility: "hidden" }} aria-hidden="true">
			<Address>00000000</Address>
		</DataCellGroup>
		<DataCellGroup>
			{new Array(editorSettings.columnWidth).fill(0).map((_v, i) =>
				<Byte key={i} value={i & 0xFF} />
			)}
		</DataCellGroup>
		{editorSettings.showDecodedText && (
			// Calculated decoded width so that the Data Inspector is displayed at the right position
			// Flex-shrink prevents the data inspector overlapping on narrow screens
			<DataCellGroup style={{ width: `calc(var(--cell-size) * ${editorSettings.columnWidth * textCellWidth})`, flexShrink: 0 }}>
				Decoded Text
			</DataCellGroup>
		)}
		{inspectorLocation === InspectorLocation.Aside && <DataInspector />}
	</Header>;
};

/** Component that shows a Data Inspector header, and the inspector itself directly below when appropriate. */
const DataInspector: React.FC = () => {
	const [isInspecting, setIsInspecting] = useState(false);
	return <DataCellGroup style={{ position: "relative", flexGrow: 1 }}>
		{isInspecting ? "Data Inspector" : null}
		<DataInspectorWrap style={{ "--scrollbar-width": `${getScrollDimensions().width}px` } as React.CSSProperties}>
			<DataInspectorAside onInspecting={setIsInspecting} />
		</DataInspectorWrap>
	</DataCellGroup>;
};

export const DataDisplay: React.FC = () => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const setOffset = useSetRecoilState(select.offset);
	const setScrollBounds = useSetRecoilState(select.scrollBounds);
	const columnWidth = useRecoilValue(select.columnWidth);
	const dimensions = useRecoilValue(select.dimensions);
	const fileSize = useRecoilValue(select.fileSize);
	const editTimeline = useRecoilValue(select.editTimeline);
	const unsavedEditIndex = useRecoilValue(select.unsavedEditIndex);
	const ctx = useDisplayContext();
	const [pasting, setPasting] = useState<{ target: HTMLElement; offset: number; data: string } | undefined>();

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

			const displayedBytes = select.getDisplayedBytes(dimensions, columnWidth);
			const byteRowStart = select.startOfRowContainingByte(byte, columnWidth);
			let newOffset: number;

			setOffset(offset => {
				// If the focused byte is before the selected byte, adjust upwards.
				// If the focused byte is off the window, adjust the offset so it's displayed
				if (byte < offset) {
					return newOffset = byteRowStart;
				} else if (byte - offset >= displayedBytes) {
					return newOffset = byteRowStart - displayedBytes + columnWidth;
				} else {
					return offset;
				}
			});

			if (newOffset! !== undefined) {
				// Ensure the scroll bounds contain the new offset.
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
	}, [dimensions, columnWidth]);

	// Whenever the edit timeline changes, update unsaved ranges.
	useEffect(() => {
		const unsavedRanges: Range[] = [];
		for (let i = 0; i < editTimeline.ranges.length; i++) {
			const range = editTimeline.ranges[i];
			// todo: eventually support delete decorations?
			if (range.op !== EditRangeOp.Insert || range.editIndex < unsavedEditIndex) {
				continue;
			}

			if (range.value.byteLength > 0) {
				unsavedRanges.push(new Range(range.offset, range.offset + range.value.byteLength));
			}
		}
		ctx.unsavedRanges = unsavedRanges;
	}, [editTimeline, unsavedEditIndex]);

	const onKeyDown = (e: React.KeyboardEvent) => {
		const current = ctx.focusedElement || FocusedElement.zero;
		const displayedBytes = select.getDisplayedBytes(dimensions, columnWidth);

		let delta = 0;
		switch (e.key) {
			case "ArrowLeft":
				delta = -1;
				break;
			case "ArrowRight":
				delta = 1;
				break;
			case "ArrowDown":
				delta = columnWidth;
				break;
			case "ArrowUp":
				delta = -columnWidth;
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

		const next = new FocusedElement(current.char, clamp(0, current.byte + delta, fileSize ?? Infinity));
		if (next.key === current.key) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		ctx.focusedElement = next;

		if (e.shiftKey) {
			const srange = ctx.selection[0];
			// On a shift key, expand the selection to include the byte. If there
			// was no previous selection, create one. If the old selection didn't
			// include the newly focused byte, expand it. Otherwise, adjust the
			// closer of the start or end of the selection to the focused byte
			// (allows shrinking the selection.)
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

	useGlobalHandler<ClipboardEvent>("paste", evt => {
		const target = document.activeElement;
		if (!(target instanceof HTMLElement) || !target.classList.contains(dataCellCls)) {
			return;
		}

		const pasteData = evt.clipboardData?.getData("text");
		if (pasteData && ctx.focusedElement) {
			setPasting({ target, offset: ctx.focusedElement.byte, data: pasteData });
		}
	});

	useGlobalHandler<ClipboardEvent>("copy", () => {
		if (ctx.focusedElement) {
			select.messageHandler.sendEvent({
				type: MessageType.DoCopy,
				selections: ctx.selection.map(r => [r.start, r.end]),
				asText: ctx.focusedElement.char
			});
		}
	});

	const clearPasting = useCallback(() => setPasting(undefined), []);

	return <div
		ref={containerRef}
		className={dataDisplayCls}
		onKeyDown={onKeyDown}
	>
		<DataRows />
		<PastePopup context={pasting} hide={clearPasting} />
	</div>;
};

const DataRows: React.FC = () => {
	const offset = useRecoilValue(select.offset);
	const columnWidth = useRecoilValue(select.columnWidth);
	const showDecodedText = useRecoilValue(select.showDecodedText);
	const dimensions = useRecoilValue(select.dimensions);
	const fileSize = useRecoilValue(select.fileSize) ?? Infinity;
	const endBytes = offset + select.getDisplayedBytes(dimensions, columnWidth);
	const rows: React.ReactChild[] = [];
	let row = 0;
	for (let i = offset; i < endBytes && i < fileSize; i += columnWidth) {
		rows.push(
			<DataRow
				key={i}
				offset={i}
				top={row * dimensions.rowPxHeight}
				width={columnWidth}
				showDecodedText={showDecodedText}
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
	display: flex;
`;

const LoadingDataRow: React.FC<{ width: number; showDecodedText: boolean }> = ({ width, showDecodedText }) => {
	const cells: React.ReactNode[] = [];
	const text = "LOADING";
	for (let i = 0; i < width; i++) {
		const str = (text[i * 2] || ".") + (text[i * 2 + 1] || ".");
		cells.push(<span
			className={dataCellCls}
			aria-hidden
			style={{ opacity: 0.5 }}
			key={i}
		>{str}</span>);
	}

	return <>
		<DataCellGroup>{cells}</DataCellGroup>
		{showDecodedText && <DataCellGroup>{cells}</DataCellGroup>}
	</>;
};

const DataRow: React.FC<{ top: number; offset: number; width: number; showDecodedText: boolean }> = ({ top, offset, width, showDecodedText }) => (
	<div className={dataRowCls} style={{ transform: `translateY(${top}px)` }}>
		<DataCellGroup>
			<Address>{offset.toString(16).padStart(8, "0")}</Address>
		</DataCellGroup>
		<Suspense fallback={<LoadingDataRow width={width} showDecodedText={showDecodedText} />}>
			<DataRowContents offset={offset} width={width} showDecodedText={showDecodedText} />
		</Suspense>
	</div>
);

const keysToOctets = new Map([
	["0", 0x0], ["1", 0x1], ["2", 0x2], ["3", 0x3], ["4", 0x4], ["5", 0x5],
	["6", 0x6], ["7", 0x7], ["8", 0x8], ["9", 0x9], ["a", 0xa], ["b", 0xb],
	["c", 0xc], ["d", 0xd], ["e", 0xe], ["f", 0xf],
]);

for (const [key, value] of keysToOctets) {
	keysToOctets.set(key.toUpperCase(), value);
}

const dataCellCharCls = css`
	width: calc(var(--cell-size) * 0.7) !important;
`;

const DataCell: React.FC<{
	byte: number;
	value: number;
	isChar: boolean;
	className?: string;
}> = ({ byte, value, className, children, isChar }) => {
	const elRef = useRef<HTMLSpanElement | null>(null);
	const focusedElement = new FocusedElement(isChar, byte);
	const ctx = useDisplayContext();
	const setReadonlyWarning = useSetRecoilState(select.showReadonlyWarningForEl);

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

	const onMouseDown = useCallback((e: React.MouseEvent) => {
		if (!(e.buttons & 1)) {
			return;
		}

		const prevFocused = ctx.focusedElement;
		ctx.focusedElement = focusedElement;

		if (ctx.isSelecting) {
			ctx.isSelecting = false;
		} else if (e.shiftKey && prevFocused) {
			// on a shift key, the user is expanding the selection (or deselection)
			// of an existing byte. We *don't* include that byte since we don't want
			// to swap the byte.
			if (e.ctrlKey || e.metaKey) {
				ctx.addSelectionRange(Range.inclusive(prevFocused.byte, byte));
			} else {
				ctx.setSelectionRanges([Range.inclusive(prevFocused.byte, byte)]);
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
			if (document.hasFocus()) {
				elRef.current?.focus();
			}
		} else {
			setFirstOctetOfEdit(undefined);
		}
	}, [isFocused]);

	// Filling in a byte cell requires two octets to be entered. This stores
	// the first octet, and is reset if the user stops editing.
	const [firstOctetOfEdit, setFirstOctetOfEdit] = useState<number>();
	const onKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.metaKey || e.ctrlKey || e.altKey) {
			return;
		}

		let newValue: number;
		if (isChar && e.key.length === 1) {
			newValue = e.key.charCodeAt(0);
		} else if (keysToOctets.has(e.key)) {
			newValue = keysToOctets.get(e.key)!;
		} else {
			return;
		}

		e.stopPropagation();

		if (ctx.isReadonly) {
			setReadonlyWarning(elRef.current);
			return;
		}

		if (isChar) {
			// b is final
		} else if (firstOctetOfEdit !== undefined) {
			newValue = firstOctetOfEdit << 4 | newValue;
		} else {
			return setFirstOctetOfEdit(newValue);
		}

		ctx.focusedElement = ctx.focusedElement?.shift(1);
		setFirstOctetOfEdit(undefined);
		ctx.edit({
			op: HexDocumentEditOp.Replace,
			previous: new Uint8Array([value]),
			value: new Uint8Array([newValue]),
			offset: byte,
		});
	}, [byte, isChar, firstOctetOfEdit]);

	const onFocus = useCallback(() => {
		ctx.focusedElement = focusedElement;
	}, [focusedElement]);

	const onBlur = useCallback(() => {
		queueMicrotask(() => {
			if (ctx.focusedElement?.key === focusedElement.key) {
				ctx.focusedElement = undefined;
			}
		});
	}, [focusedElement]);

	return (
		<span
			ref={elRef}
			tabIndex={0}
			onFocus={onFocus}
			onBlur={onBlur}
			className={clsx(
				isChar && dataCellCharCls,
				dataCellCls,
				className,
				useIsHovered(focusedElement) && dataCellHoveredCls,
				useIsSelected(byte) && dataCellSelectedCls,
				useIsUnsaved(byte) && dataCellUnsavedCls,
			)}
			onMouseEnter={onMouseEnter}
			onMouseDown={onMouseDown}
			onMouseLeave={onMouseLeave}
			onKeyDown={onKeyDown}
			data-key={focusedElement.key}
		>{firstOctetOfEdit !== undefined
			? firstOctetOfEdit.toString(16).toUpperCase()
			: children}</span>
	);
};


const DataRowContents: React.FC<{
	offset: number;
	width: number;
	showDecodedText: boolean;
}> = ({ offset, width, showDecodedText }) => {
	const rawBytes = useFileBytes(offset, width, true);
	let memoValue = "";
	for (const byte of rawBytes) {
		memoValue += "," + byte;
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
				value={value}
			>{value.toString(16).padStart(2, "0").toUpperCase()}</DataCell>);

			if (showDecodedText) {
				const char = getAsciiCharacter(value);
				chars.push(<DataCell
					key={i}
					byte={boffset}
					isChar={true}
					className={char === undefined ? nonGraphicCharCls : undefined}
					value={value}
				>{char === undefined ? "." : char}</DataCell>);
			}
		}
		return { bytes, chars };
	}, [memoValue, showDecodedText]);

	return (
		<>
			<DataCellGroup>{bytes}</DataCellGroup>
			<DataCellGroup>{chars}</DataCellGroup>
		</>
	);
};
