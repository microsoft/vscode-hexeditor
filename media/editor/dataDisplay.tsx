// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { ColorMap } from "vscode-webview-tools";
import { EditRangeOp, HexDocumentEditOp } from "../../shared/hexDocumentModel";
import { DeleteAcceptedMessage, InspectorLocation, MessageType } from "../../shared/protocol";
import { Range } from "../../shared/util/range";
import { PastePopup } from "./copyPaste";
import _style from "./dataDisplay.css";
import {
	DisplayContext,
	FocusedElement,
	dataCellCls,
	useDisplayContext,
	useIsFocused,
	useIsHovered,
	useIsSelected,
	useIsUnsaved,
} from "./dataDisplayContext";
import { DataInspectorAside } from "./dataInspector";
import { useGlobalHandler, useLastAsyncRecoilValue, useSize, useTheme } from "./hooks";
import * as select from "./state";
import { strings } from "./strings";
import { clamp, getAsciiCharacter, getScrollDimensions, throwOnUndefinedAccessInDev } from "./util";

const style = throwOnUndefinedAccessInDev(_style);

const EmptyDataCell = () => (
	<span className={dataCellCls} aria-hidden style={{ visibility: "hidden" }}>
		00
	</span>
);

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
				clamp(0, current.byte + delta, fileSize !== undefined ? fileSize - 1 : Infinity),
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
	const size = useSize(containerRef);

	return (
		<div ref={containerRef} className={style.dataDisplay}>
			<DataRows width={size.width} height={size.height} />
			<PastePopup context={pasting} hide={clearPasting} />
		</div>
	);
};

const DataRows: React.FC<{ width: number; height: number }> = ({ width, height }) => {
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

	const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
	const context = useMemo(() => canvas?.getContext("2d"), [canvas]);

	useEffect(() => {
		if (context) {
			const scale = window.devicePixelRatio;
			context.canvas.width = Math.floor(width * scale);
			context.canvas.height = Math.floor(height * scale);
			context.scale(scale, scale);
		}
	}, [width, height, context]);

	const rows: React.ReactChild[] = [];
	if (context) {
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
					context={context}
				/>,
			);
		}
	}

	return (
		<>
			<canvas ref={setCanvas} className={style.canvas} />
			{rows}
		</>
	);
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
	context: CanvasRenderingContext2D;
}

const DataPage: React.FC<IDataPageProps> = props => (
	<Suspense fallback={<LoadingDataRows {...props} />}>
		<DataPageContents {...props} />
	</Suspense>
);

const generateRows = (props: IDataPageProps, fn: (offset: number) => React.ReactChild) => {
	const rows: React.ReactNode[] = [];
	let row = (props.rowsStart - props.pageStart) / props.columnWidth;
	for (let i = props.rowsStart; i < props.rowsEnd && i < props.fileSize; i += props.columnWidth) {
		rows.push(
			<div
				key={i}
				className={style.dataRow}
				style={{ top: `${row++ * props.dimensions.rowPxHeight}px` }}
			>
				<DataCellGroup>
					<Address>{i.toString(16).padStart(8, "0")}</Address>
				</DataCellGroup>
				{fn(i)}
			</div>,
		);
	}

	return rows;
};

/** Renders line numbers and returns layout info */
const useLineNumbers = (
	{ context, rowsEnd, rowsStart, columnWidth, fileSize, dimensions }: IDataPageProps,
	theme: ColorMap,
) => {
	return useMemo(() => {
		let k = 0;
		context.textAlign = "left";
		context.font = `${theme["editor-font-size"]} ${theme["editor-font-family"]}`;
		context.fillStyle = theme["editorLineNumber-foreground"];
		context.textAlign = "left";
		context.textBaseline = "middle";

		const width = context.measureText(rowsEnd.toString(16).toUpperCase().padStart(8, "0")).width;

		context.clearRect(0, 0, width, context.canvas.height);
		for (let i = rowsStart; i <= rowsEnd && i < fileSize; i += columnWidth) {
			context.fillText(
				i.toString(16).toUpperCase().padStart(8, "0"),
				0,
				(k++ + 0.5) * dimensions.rowPxHeight,
			);
		}

		return { width };
	}, [theme, rowsStart, rowsEnd, columnWidth, fileSize]);
};

const LoadingDataRows: React.FC<IDataPageProps> = props => {
	const theme = useTheme();
	const lineNos = useLineNumbers(props, theme);

	return <></>;
};

const DataPageContents: React.FC<IDataPageProps> = props => {
	const theme = useTheme();
	const lineNos = useLineNumbers(props, theme);
	const pageSelector = select.editedDataPages(props.pageNo);
	const [data] = useLastAsyncRecoilValue(pageSelector);
	const ctx = useDisplayContext();

	const bytesStart = lineNos.width;
	const textStart = bytesStart + props.columnWidth * props.dimensions.rowPxHeight;
	props.context.font = `${theme["font-size"]}px ${theme["font-family"]}`;
	props.context.textAlign = "center";
	props.context.textBaseline = "middle";

	let rowNum = 0;
	for (
		let row = props.rowsStart;
		row < props.rowsEnd && row < props.fileSize;
		row += props.columnWidth, rowNum++
	) {
		for (let x = 0; x < props.columnWidth && row + x < props.fileSize; x++) {
			const byteInPage = row + x - props.pageStart;
			const byteOverall = row + x;
			drawCell({
				theme,
				ctx,
				left: bytesStart + x * props.dimensions.rowPxHeight,
				top: rowNum * props.dimensions.rowPxHeight,
				byte: byteOverall,
				value: data[byteInPage],
				isChar: false,
				size: props.dimensions.rowPxHeight,
				context: props.context,
			});

			if (props.showDecodedText) {
				drawCell({
					theme,
					ctx,
					left: textStart + x * props.dimensions.rowPxHeight * textCellWidth,
					top: rowNum * props.dimensions.rowPxHeight,
					byte: byteOverall,
					value: data[byteInPage],
					isChar: true,
					size: props.dimensions.rowPxHeight,
					context: props.context,
				});
			}
		}
	}

	return <></>;
};

const drawCell = ({
	ctx,
	left,
	top,
	size,
	byte,
	value,
	isChar,
	theme,
	context,
}: {
	theme: ColorMap;
	ctx: DisplayContext;
	left: number;
	top: number;
	size: number;
	byte: number;
	value: number;
	isChar: boolean;
	context: CanvasRenderingContext2D;
}) => {
	const drawRect = (color: string) => {
		context.fillStyle = color;
		context.fillRect(left, top, size, size);
	};

	const isHovered =
		ctx.hoveredByte && ctx.hoveredByte.byte === byte && ctx.hoveredByte.char === isChar;
	const isSelected = ctx.isSelected(byte);

	if (isHovered && isSelected) {
		drawRect(theme["editor-inactiveSelectionBackground"]);
		context.fillStyle = theme["editor-foreground"];
	} else if (isHovered) {
		drawRect(theme["editor-hoverHighlightBackground"]);
		context.fillStyle = theme["editor-foreground"];
	} else if (isSelected) {
		drawRect(theme["editor-selectionBackground"]);
		context.fillStyle = theme["editor-selectionForeground"];
	} else {
		drawRect(theme["editor-background"]);
		context.fillStyle = theme["editor-foreground"];
	}

	let char: string | undefined;
	if (isChar) {
		char = getAsciiCharacter(value);
		if (!char) {
			char = ".";
			context.fillStyle = theme["tab-unfocusedInactiveForeground"];
		}
	} else {
		char = value.toString(16).toUpperCase().padStart(2, "0");
	}

	const w = isChar ? size * textCellWidth : size;
	context.fillText(char, left + w / 2, top + size / 2);
};

const keysToOctets = new Map([
	["0", 0x0],
	["1", 0x1],
	["2", 0x2],
	["3", 0x3],
	["4", 0x4],
	["5", 0x5],
	["6", 0x6],
	["7", 0x7],
	["8", 0x8],
	["9", 0x9],
	["a", 0xa],
	["b", 0xb],
	["c", 0xc],
	["d", 0xd],
	["e", 0xe],
	["f", 0xf],
]);

for (const [key, value] of keysToOctets) {
	keysToOctets.set(key.toUpperCase(), value);
}

const DataCell: React.FC<{
	left: number;
	top: number;
	size: number;
	byte: number;
	value: number;
	isChar: boolean;
	context: CanvasRenderingContext2D;
}> = ({ byte, value, left, top, size, isChar, context }) => {
	const elRef = useRef<HTMLSpanElement | null>(null);
	const focusedElement = new FocusedElement(isChar, byte);
	const ctx = useDisplayContext();
	const setReadonlyWarning = useSetRecoilState(select.showReadonlyWarningForEl);

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
		},
		[byte, isChar, firstOctetOfEdit],
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
	const isUnsaved = useIsUnsaved(byte);
	const theme = useTheme();

	useEffect(() => {
		context.font = `${theme["font-size"]}px ${theme["font-family"]}`;
		context.textAlign = "center";
		context.textBaseline = "middle";

		const drawRect = (color: string) => {
			context.fillStyle = color;
			context.fillRect(left, top, size, size);
		};

		if (isHovered && isSelected) {
			drawRect(theme["editor-inactiveSelectionBackground"]);
			context.fillStyle = theme["editor-foreground"];
		} else if (isHovered) {
			drawRect(theme["editor-hoverHighlightBackground"]);
			context.fillStyle = theme["editor-foreground"];
		} else if (isSelected) {
			drawRect(theme["editor-selectionBackground"]);
			context.fillStyle = theme["editor-selectionForeground"];
		} else {
			drawRect(theme["editor-background"]);
			context.fillStyle = theme["editor-foreground"];
		}

		let char: string | undefined;
		if (isChar) {
			char = getAsciiCharacter(value);
			if (!char) {
				char = ".";
				context.fillStyle = theme["tab-unfocusedInactiveForeground"];
			}
		} else {
			char = value.toString(16).toUpperCase().padStart(2, "0");
		}
		// console.log("draw", value, isHovered, isSelected, isUnsaved, left, top, size);
		context.fillText(char, left + size / 2, top + size / 2);
	}, [value, isHovered, isSelected, isUnsaved, theme, left, top, size]);

	return <></>;

	// return (
	// 	<span
	// 		ref={elRef}
	// 		tabIndex={0}
	// 		onFocus={onFocus}
	// 		onBlur={onBlur}
	// 		className={clsx(
	// 			isChar && style.dataCellChar,
	// 			dataCellCls,
	// 			className,
	// 			isHovered && style.dataCellHovered,
	// 			isSelected && style.dataCellSelected,
	// 			isHovered && isSelected && style.dataCellSelectedHovered,
	// 			useIsUnsaved(byte) && style.dataCellUnsaved,
	// 		)}
	// 		onMouseEnter={onMouseEnter}
	// 		onMouseDown={onMouseDown}
	// 		onMouseLeave={onMouseLeave}
	// 		onKeyDown={onKeyDown}
	// 		data-key={focusedElement.key}
	// 	>
	// 		{firstOctetOfEdit !== undefined ? firstOctetOfEdit.toString(16).toUpperCase() : children}
	// 	</span>
	// );
};
