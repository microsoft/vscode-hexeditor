// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { EditRangeOp, HexDocumentEditOp } from "../../shared/hexDocumentModel";
import { DeleteAcceptedMessage, InspectorLocation, MessageType } from "../../shared/protocol";
import { Range } from "../../shared/util/range";
import { PastePopup } from "./copyPaste";
import _style from "./dataDisplay.css";
import {
	FocusedElement,
	dataCellCls,
	useDisplayContext,
	useIsFocused,
	useIsHovered,
	useIsSelected,
	useIsUnsaved,
} from "./dataDisplayContext";
import { DataInspectorAside } from "./dataInspector";
import { useGlobalHandler, useLastAsyncRecoilValue } from "./hooks";
import * as select from "./state";
import { strings } from "./strings";
import {
	clamp,
	clsx,
	getAsciiCharacter,
	getScrollDimensions,
	parseHexDigit,
	throwOnUndefinedAccessInDev,
} from "./util";

const style = throwOnUndefinedAccessInDev(_style);

const EmptyDataCell = () => (
	<span className={dataCellCls} aria-hidden style={{ visibility: "hidden" }}>
		00
	</span>
);

/**
 * Data Cell used to append bytes at the end of files.
 */
const AppendDataCell: React.FC<{ byte: number }> = ({ byte }) => {
	const elRef = useRef<HTMLSpanElement | null>(null);
	const ctx = useDisplayContext();
	const [firstOctetOfEdit, setFirstOctetOfEdit] = useState<number>();
	const setReadonlyWarning = useSetRecoilState(select.showReadonlyWarningForEl);
	const focusedElement = new FocusedElement(false, byte);
	const isFocused = useIsFocused(focusedElement);
	const isHovered = useIsHovered(focusedElement);
	useEffect(() => {
		if (isFocused) {
			if (document.hasFocus()) {
				elRef.current?.focus();
			}
		} else {
			setFirstOctetOfEdit(undefined);
		}
	}, [isFocused]);

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

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (!(e.buttons & 1)) {
				return;
			}
			ctx.focusedElement = focusedElement;
			ctx.setSelectionRanges([Range.single(byte)]);
		},
		[focusedElement.key],
	);

	const onMouseEnter = useCallback(() => {
		ctx.hoveredByte = focusedElement;
	}, [byte, focusedElement]);

	const onMouseLeave = useCallback(() => {
		ctx.hoveredByte = undefined;
	}, [byte]);

	const onKeyDown = useCallback(
		e => {
			if (e.metaKey || e.ctrlKey || e.altKey) {
				return;
			}

			let newValue = parseHexDigit(e.key);
			if (newValue === undefined) {
				return;
			}

			if (ctx.isReadonly) {
				setReadonlyWarning(elRef.current);
				return;
			}

			e.stopPropagation();

			if (firstOctetOfEdit === undefined) {
				setFirstOctetOfEdit(newValue << 4);
			} else {
				ctx.edit({
					op: HexDocumentEditOp.Insert,
					value: new Uint8Array([firstOctetOfEdit | newValue]),
					offset: byte,
				});
				ctx.focusedElement = ctx.focusedElement?.shift(1);
				return setFirstOctetOfEdit(undefined);
			}
		},
		[byte, firstOctetOfEdit],
	);

	return (
		<span
			ref={elRef}
			tabIndex={0}
			onFocus={onFocus}
			onBlur={onBlur}
			className={clsx(
				dataCellCls,
				isFocused &&
					(firstOctetOfEdit === undefined
						? style.dataCellInsertBefore
						: style.dataCellInsertMiddle),
				isHovered && style.dataCellHovered,
			)}
			onMouseDown={onMouseDown}
			onKeyDown={onKeyDown}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			data-key={focusedElement.key}
		>
			{firstOctetOfEdit !== undefined ? firstOctetOfEdit.toString(16).toUpperCase() : "+"}
		</span>
	);
};

const Byte: React.FC<{ value: number }> = ({ value }) => (
	<span className={dataCellCls}>{value.toString(16).padStart(2, "0").toUpperCase()}</span>
);

// Byte cells are square, and show two (hex) characters, but text cells show a
// single character so can be narrower--by this constant multiplier.
const textCellWidth = 0.7;

const DataCellGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
	<div className={style.dataCellGroup} {...props}>
		{children}
	</div>
);

const Address: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
	<div className={style.address} {...props}>
		{children}
	</div>
);

export const DataHeader: React.FC = () => {
	const editorSettings = useRecoilValue(select.editorSettings);
	const inspectorLocation = useRecoilValue(select.dataInspectorLocation);

	return (
		<div className={style.header}>
			<DataCellGroup style={{ visibility: "hidden" }} aria-hidden="true">
				<Address>00000000</Address>
			</DataCellGroup>
			<DataCellGroup>
				{new Array(editorSettings.columnWidth).fill(0).map((_v, i) => (
					<Byte key={i} value={i & 0xff} />
				))}
			</DataCellGroup>
			{editorSettings.showDecodedText && (
				// Calculated decoded width so that the Data Inspector is displayed at the right position
				// Flex-shrink prevents the data inspector overlapping on narrow screens
				<DataCellGroup
					style={{
						width: `calc(var(--cell-size) * ${editorSettings.columnWidth * textCellWidth})`,
						flexShrink: 0,
					}}
				>
					{strings.decodedText}
				</DataCellGroup>
			)}
			{inspectorLocation === InspectorLocation.Aside && <DataInspector />}
		</div>
	);
};

/** Component that shows a Data Inspector header, and the inspector itself directly below when appropriate. */
const DataInspector: React.FC = () => {
	const [isInspecting, setIsInspecting] = useState(false);
	return (
		<DataCellGroup style={{ position: "relative", flexGrow: 1 }}>
			{isInspecting ? "Data Inspector" : null}
			<div
				className={style.dataInspectorWrap}
				style={{ "--scrollbar-width": `${getScrollDimensions().width}px` } as React.CSSProperties}
			>
				<DataInspectorAside onInspecting={setIsInspecting} />
			</div>
		</DataCellGroup>
	);
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
	const [pasting, setPasting] = useState<
		{ target: HTMLElement; offset: number; data: string } | undefined
	>();

	useEffect(() => {
		const l = () => {
			ctx.isSelecting = undefined;
		};
		window.addEventListener("mouseup", l, { passive: true });
		return () => window.removeEventListener("mouseup", l);
	}, []);

	// When the focused byte changes, make sure it's in view
	useEffect(() => {
		const disposable = ctx.onDidChangeAnyFocus(byte => {
			if (byte === undefined) {
				return;
			}

			const displayedBytes = select.getDisplayedBytes(dimensions, columnWidth);
			const byteRowStart = select.startOfRowContainingByte(byte, columnWidth);
			let newOffset: number;

			setOffset(offset => {
				// If the focused byte is before the selected byte, adjust upwards.
				// If the focused byte is off the window, adjust the offset so it's displayed
				if (byte < offset) {
					return (newOffset = byteRowStart);
				} else if (byte - offset >= displayedBytes) {
					return (newOffset = byteRowStart - displayedBytes + columnWidth);
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

	useGlobalHandler(
		"keydown",
		(e: KeyboardEvent) => {
			// handle keydown events not sent to a more specific element. The user can
			// scroll to a point where the 'focused' element is no longer rendered,
			// but we still want to allow use of arrow keys.
			if (
				document.activeElement !== document.body &&
				!containerRef.current?.contains(document.activeElement)
			) {
				return;
			}

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

			const next = new FocusedElement(
				current.char,
				// Clamp on fileSize due to the added data cell for appending bytes at eof
				clamp(0, current.byte + delta, fileSize !== undefined ? fileSize : Infinity),
			);
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
					const closerToEnd =
						Math.abs(srange.end - current.byte) < Math.abs(srange.start - current.byte);
					const nextRange = closerToEnd
						? new Range(srange.start, next.byte + 1)
						: new Range(next.byte, srange.end);
					ctx.replaceLastSelectionRange(nextRange);
				}
			} else {
				ctx.setSelectionRanges([Range.single(next.byte)]);
			}
		},
		[dimensions, columnWidth, fileSize],
	);

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
				asText: ctx.focusedElement.char,
			});
		}
	});

	const clearPasting = useCallback(() => setPasting(undefined), []);

	return (
		<div ref={containerRef} className={style.dataDisplay}>
			<DataRows />
			<PastePopup context={pasting} hide={clearPasting} />
		</div>
	);
};

const DataRows: React.FC = () => {
	const offset = useRecoilValue(select.offset);
	const columnWidth = useRecoilValue(select.columnWidth);
	const showDecodedText = useRecoilValue(select.showDecodedText);
	const dimensions = useRecoilValue(select.dimensions);
	const fileSize = useRecoilValue(select.fileSize) ?? Infinity;

	const displayedBytes = select.getDisplayedBytes(dimensions, columnWidth);
	const dataPageSize = useRecoilValue(select.dataPageSize);

	const startPageNo = Math.floor(offset / dataPageSize);
	const startPageStartsAt = startPageNo * dataPageSize;
	const endPageNo = Math.floor((offset + displayedBytes) / dataPageSize);
	const endPageStartsAt = endPageNo * dataPageSize;

	const rows: React.ReactChild[] = [];
	for (let i = startPageStartsAt; i <= endPageStartsAt && i < fileSize; i += dataPageSize) {
		rows.push(
			<DataPage
				key={i}
				pageNo={i / dataPageSize}
				pageStart={i}
				rowsStart={Math.max(i, offset)}
				rowsEnd={Math.min(i + dataPageSize, offset + displayedBytes)}
				top={((i - offset) / columnWidth) * dimensions.rowPxHeight}
				columnWidth={columnWidth}
				showDecodedText={showDecodedText}
				fileSize={fileSize}
				dimensions={dimensions}
			/>,
		);
	}

	return <>{rows}</>;
};

const LoadingDataRow: React.FC<{ width: number; showDecodedText: boolean }> = ({
	width,
	showDecodedText,
}) => {
	const cells: React.ReactNode[] = [];
	const text = strings.loadingUpper;
	for (let i = 0; i < width; i++) {
		const str = (text[i * 2] || ".") + (text[i * 2 + 1] || ".");
		cells.push(
			<span className={dataCellCls} aria-hidden style={{ opacity: 0.5 }} key={i}>
				{str}
			</span>,
		);
	}

	return (
		<>
			<DataCellGroup>{cells}</DataCellGroup>
			{showDecodedText && <DataCellGroup>{cells}</DataCellGroup>}
		</>
	);
};

interface IDataPageProps {
	// Page number
	pageNo: number;
	// Start of the page
	pageStart: number;
	// the offset rows should start displaying at
	rowsStart: number;
	// the offset rows should finish displaying at
	rowsEnd: number;
	// count of many rows are displayed before this data page
	top: number;

	// common properties:
	columnWidth: number;
	fileSize: number;
	showDecodedText: boolean;
	dimensions: select.IDimensions;
}

const DataPage: React.FC<IDataPageProps> = props => (
	<div className={style.dataPage} style={{ transform: `translateY(${props.top}px)` }}>
		<Suspense fallback={<LoadingDataRows {...props} />}>
			<DataPageContents {...props} />
		</Suspense>
	</div>
);

const generateRows = (
	props: IDataPageProps,
	fn: (offset: number, isRowWithInsertDataCell: boolean) => React.ReactChild,
) => {
	const rows: React.ReactNode[] = [];
	let row = (props.rowsStart - props.pageStart) / props.columnWidth;
	const lastRowIndex = props.fileSize - (props.fileSize % props.columnWidth);
	for (let i = props.rowsStart; i < props.rowsEnd && i <= lastRowIndex; i += props.columnWidth) {
		rows.push(
			<div
				key={i}
				className={style.dataRow}
				style={{ top: `${row++ * props.dimensions.rowPxHeight}px` }}
			>
				<DataCellGroup>
					<Address>{i.toString(16).padStart(8, "0")}</Address>
				</DataCellGroup>
				{fn(i, i === lastRowIndex)}
			</div>,
		);
	}

	return rows;
};

const LoadingDataRows: React.FC<IDataPageProps> = props => (
	<>
		{generateRows(props, () => (
			<LoadingDataRow width={props.columnWidth} showDecodedText={props.showDecodedText} />
		))}
	</>
);

const DataPageContents: React.FC<IDataPageProps> = props => {
	const pageSelector = select.editedDataPages(props.pageNo);
	const [data] = useLastAsyncRecoilValue(pageSelector);

	return (
		<>
			{generateRows(props, (offset, isRowWithInsertDataCell) => (
				<DataRowContents
					offset={offset}
					rawBytes={data.subarray(
						offset - props.pageStart,
						offset - props.pageStart + props.columnWidth,
					)}
					width={props.columnWidth}
					showDecodedText={props.showDecodedText}
					isRowWithInsertDataCell={isRowWithInsertDataCell}
				/>
			))}
		</>
	);
};

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
	const editMode = useRecoilValue(select.editMode);

	const onMouseEnter = useCallback(() => {
		ctx.hoveredByte = focusedElement;
		if (ctx.isSelecting !== undefined) {
			ctx.replaceLastSelectionRange(Range.inclusive(ctx.isSelecting, byte));
		}
	}, [byte, focusedElement]);

	const onMouseLeave = useCallback(
		(e: React.MouseEvent) => {
			ctx.hoveredByte = undefined;
			if (e.buttons & 1 && ctx.isSelecting === undefined) {
				ctx.isSelecting = byte;
				if (e.ctrlKey || e.metaKey) {
					ctx.addSelectionRange(Range.single(byte));
				} else {
					ctx.setSelectionRanges([Range.single(byte)]);
				}
			}
		},
		[byte],
	);

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (!(e.buttons & 1)) {
				return;
			}

			const prevFocused = ctx.focusedElement;
			ctx.focusedElement = focusedElement;

			if (ctx.isSelecting !== undefined) {
				ctx.isSelecting = undefined;
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
		},
		[focusedElement.key, byte],
	);

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
	const onKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) {
				return;
			}

			if (e.key === "Delete") {
				// this is a bit of a hack, but this is kind of tricky: we got a delete
				// for a range, and the edit must be undoable, but we aren't ensured to
				// have the data paged in for the range. So make a separate request
				// that will result in the extension host sending the edit to us.
				select.messageHandler
					.sendRequest<DeleteAcceptedMessage>({
						type: MessageType.RequestDeletes,
						deletes: ctx.getSelectionRanges().map(r => ({ start: r.start, end: r.end })),
					})
					.then(() => ctx.setSelectionRanges([]));
			}

			let newValue = isChar && e.key.length === 1 ? e.key.charCodeAt(0) : parseHexDigit(e.key);
			if (newValue === undefined) {
				return;
			}

			e.stopPropagation();

			if (ctx.isReadonly) {
				setReadonlyWarning(elRef.current);
				return;
			}

			if (editMode === HexDocumentEditOp.Insert) {
				if (isChar) {
					ctx.focusedElement = ctx.focusedElement?.shift(1);
					// Finishes byte insertion
				} else if (firstOctetOfEdit !== undefined) {
					ctx.edit({
						op: HexDocumentEditOp.Replace,
						previous: new Uint8Array([firstOctetOfEdit]),
						value: new Uint8Array([firstOctetOfEdit | newValue]),
						offset: byte,
					});
					ctx.focusedElement = ctx.focusedElement?.shift(1);
					return setFirstOctetOfEdit(undefined);
					// Starts a new byte insertion
				} else {
					setFirstOctetOfEdit(newValue << 4);
				}

				ctx.edit({
					op: HexDocumentEditOp.Insert,
					value: new Uint8Array([newValue]),
					offset: byte,
				});
			} else if (editMode === HexDocumentEditOp.Replace) {
				if (isChar) {
					// b is final
				} else if (firstOctetOfEdit !== undefined) {
					newValue = (firstOctetOfEdit << 4) | newValue;
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
			}
		},
		[byte, isChar, firstOctetOfEdit, editMode],
	);

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

	const isHovered = useIsHovered(focusedElement);
	const isSelected = useIsSelected(byte);
	const editStyle = useMemo(() => {
		if (editMode === HexDocumentEditOp.Replace) {
			return style.dataCellReplace;
		} else if (editMode === HexDocumentEditOp.Insert) {
			return firstOctetOfEdit !== undefined
				? style.dataCellInsertMiddle
				: style.dataCellInsertBefore;
		}
	}, [editMode, firstOctetOfEdit]);

	return (
		<span
			ref={elRef}
			tabIndex={0}
			onFocus={onFocus}
			onBlur={onBlur}
			className={clsx(
				isChar && style.dataCellChar,
				dataCellCls,
				className,
				isFocused && editStyle,
				isHovered && style.dataCellHovered,
				isSelected && style.dataCellSelected,
				isHovered && isSelected && style.dataCellSelectedHovered,
				useIsUnsaved(byte) && style.dataCellUnsaved,
			)}
			onMouseEnter={onMouseEnter}
			onMouseDown={onMouseDown}
			onMouseLeave={onMouseLeave}
			onKeyDown={onKeyDown}
			data-key={focusedElement.key}
		>
			{firstOctetOfEdit !== undefined ? firstOctetOfEdit.toString(16).toUpperCase() : children}
		</span>
	);
};

const DataRowContents: React.FC<{
	offset: number;
	width: number;
	showDecodedText: boolean;
	rawBytes: Uint8Array;
	isRowWithInsertDataCell: boolean;
}> = ({ offset, width, showDecodedText, rawBytes, isRowWithInsertDataCell }) => {
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
				if (isRowWithInsertDataCell) {
					bytes.push(<AppendDataCell key={i} byte={boffset} />);
					chars.push(<EmptyDataCell key={i} />);
					isRowWithInsertDataCell = false;
				} else {
					bytes.push(<EmptyDataCell key={i} />);
					chars.push(<EmptyDataCell key={i} />);
				}
				continue;
			}

			bytes.push(
				<DataCell key={i} byte={boffset} isChar={false} value={value}>
					{value.toString(16).padStart(2, "0").toUpperCase()}
				</DataCell>,
			);

			if (showDecodedText) {
				const char = getAsciiCharacter(value);
				chars.push(
					<DataCell
						key={i}
						byte={boffset}
						isChar={true}
						className={char === undefined ? style.nonGraphicChar : undefined}
						value={value}
					>
						{char === undefined ? "." : char}
					</DataCell>,
				);
			}
		}

		return { bytes, chars };
	}, [memoValue, showDecodedText, isRowWithInsertDataCell]);

	return (
		<>
			<DataCellGroup>{bytes}</DataCellGroup>
			<DataCellGroup>{chars}</DataCellGroup>
		</>
	);
};
