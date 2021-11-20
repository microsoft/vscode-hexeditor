import { css } from "@linaria/core";
import { styled } from "@linaria/react";
import ArrowDown from "@vscode/codicons/src/icons/arrow-down.svg";
import ArrowUp from "@vscode/codicons/src/icons/arrow-up.svg";
import CaseSensitive from "@vscode/codicons/src/icons/case-sensitive.svg";
import Close from "@vscode/codicons/src/icons/close.svg";
import BinaryFile from "@vscode/codicons/src/icons/file-binary.svg";
import RegexIcon from "@vscode/codicons/src/icons/regex.svg";
import ReplaceAll from "@vscode/codicons/src/icons/replace-all.svg";
import Replace from "@vscode/codicons/src/icons/replace.svg";
import SearchStop from "@vscode/codicons/src/icons/search-stop.svg";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { HexDocumentEditOp, HexDocumentReplaceEdit } from "../../shared/hexDocumentModel";
import { MessageType } from "../../shared/protocol";
import { dataCellCls } from "./dataDisplay";
import { useDisplayContext } from "./dataDisplayContext";
import * as select from "./state";
import { clsx, hexDecode, Range } from "./util";
import { VsIconButton, VsIconCheckbox, VsProgressIndicator, VsTextFieldGroup } from "./vscodeUi";

const Wrapper = styled.div`
	position: absolute;
	top: 0;
	right: 28px;
	width: 50%;
	max-width: 420px;
	transform: translateY(-100%);
	transition: transform 300ms;
	border: 1px solid var(--vscode-contrastBorder);
	color: var(--vscode-editorWidget-foreground);
	background: var(--vscode-editorWidget-background);
	padding: 0 4px 4px;
	z-index: 1;
`;

const InputRow = styled.div`
	display: flex;
	align-items: center;
	justify-content: start;
	margin-top: 4px;
`;

const ResultBadge = styled.div`
	margin: 0 0 0 3px;
	padding: 2px 0 0 2px;
	min-width: 69px;
	font-size: 0.9em;
`;

const visibleCls = css`
	transform: translateY(0);
	box-shadow: 0 0 8px 2px var(--vscode-widget-shadow);
`;

const textFieldCls = css`flex-grow: 1`;

const queryDebounce = 300;

const numberFormat = new Intl.NumberFormat();

const getQueryBytes = (query: string, isBinaryMode: boolean) => isBinaryMode ? hexDecode(query) : new TextEncoder().encode(query);

export const FindWidget: React.FC = () => {
	const [visible, setVisible] = useState(false);
	const [query, setQuery] = useState("");
	const [replace, setReplace] = useState("");
	const [isBinaryMode, setIsBinaryMode] = useState(false);
	const [isRegexp, setIsRegexp] = useState(false);
	const [isCaseSensitive, setIsCaseSensitive] = useState(false);
	const results = useRecoilValue(select.searchResults);
	const [selectedResult, setSelectedResult] = useState<number>();
	const [offset, setOffset] = useRecoilState(select.offset);
	const dimensions = useRecoilValue(select.dimensions);
	const ctx = useDisplayContext();
	const textFieldRef = useRef<HTMLInputElement | null>(null);

	const onQueryChange = useCallback(
		(evt: React.ChangeEvent<HTMLInputElement>) => {
			setQuery(isBinaryMode ? evt.target.value.replace(/[^0-9a-f]/g, "") : evt.target.value);
			setSelectedResult(undefined);
		},
		[isBinaryMode],
	);

	const onReplaceChange = useCallback(
		(evt: React.ChangeEvent<HTMLInputElement>) => setReplace(isBinaryMode ? evt.target.value.replace(/[^0-9a-f]/g, "") : evt.target.value),
		[isBinaryMode],
	);

	const stopSearch = useCallback(
		() => select.messageHandler.sendRequest({ type: MessageType.CancelSearch }),
		[],
	);

	useEffect(() => {
		const l = (evt: KeyboardEvent) => {
			if (evt.key === "f" && (evt.metaKey || evt.ctrlKey)) {
				setVisible(true);
				textFieldRef.current?.focus();
				evt.preventDefault();
			}
		};

		window.addEventListener("keydown", l);
		return () => window.removeEventListener("keydown", l);
	}, []);

	useEffect(() => {
		if (!query.length) {
			return;
		}

		let started = false;
		const timeout = setTimeout(() => {
			started = true;
			select.messageHandler.sendRequest({
				type: MessageType.SearchRequest,
				query: !isBinaryMode && isRegexp
					? { re: query }
					: { literal: getQueryBytes(query, isBinaryMode) },
				caseSensitive: isCaseSensitive,
			});
		}, queryDebounce);

		return () => {
			if (started) {
				select.messageHandler.sendRequest({ type: MessageType.CancelSearch });
			} else {
				clearTimeout(timeout);
			}
		};
	}, [query, isCaseSensitive, isRegexp, isBinaryMode]);

	const closeWidget = useCallback(() => {
		setVisible(false);
		document.querySelector<HTMLElement>(dataCellCls)?.focus();
	}, []);

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			closeWidget();
		} else if (e.key === "Enter") {
			if (e.shiftKey) {
				e.preventDefault();
				navigateResults(-1);
			} else if (e.ctrlKey || e.metaKey) {
				// no-op, enter in text area
			} else if (e.altKey && results.results.length) {
				e.preventDefault();
				ctx.setSelectionRanges(results.results.map(r => new Range(r.from, r.to)));
			} else {
				e.preventDefault();
				navigateResults(1);
			}
		}
	};

	const navigateResults = (increment: number) => {
		if (results.results.length === 0) {
			return;
		}

		let next: number;
		if (selectedResult !== undefined) {
			next = selectedResult + increment;
		} else {
			// if there was no previous selected result, pick the next result on the
			// screen. If the user navigated backwards, then pick the one right before.
			next = results.results.findIndex(r => r.from > offset) + Math.min(increment, 0);
		}

		if (next < 0) {
			next = results.results.length - 1;
		} else if (next >= results.results.length) {
			next = 0;
		}

		const r = results.results[next];
		ctx.setSelectionRanges([new Range(r.from, r.to)]);

		setOffset(Math.max(0, select.startOfRowContainingByte(r.to - select.getDisplayedBytes(dimensions) / 1.5, dimensions)));
		setSelectedResult(next);
	};

	const replaceSelected = () => {
		if (selectedResult) {
			const r = results.results[selectedResult];
			ctx.edit({
				op: HexDocumentEditOp.Replace,
				offset: r.from,
				value: getQueryBytes(replace, isBinaryMode),
				previous: r.previous,
			});
		}
	};

	const replaceAll = () => {
		ctx.edit(results.results.map((r): HexDocumentReplaceEdit => ({
			op: HexDocumentEditOp.Replace,
			offset: r.from,
			value: getQueryBytes(replace, isBinaryMode),
			previous: r.previous,
		})));
	};

	const resultCountStr = numberFormat.format(results.results.length);

	return <Wrapper tabIndex={visible ? undefined : -1} className={clsx(visible && visibleCls)}>
		{results.progress < 1 && <VsProgressIndicator />}
		<InputRow>
			<VsTextFieldGroup
				buttons={3}
				ref={textFieldRef}
				outerClassName={textFieldCls}
				placeholder={isBinaryMode ? "Find Bytes (hex)" : "Find Text"}
				value={query}
				onChange={onQueryChange}
				onKeyDown={onKeyDown}
			>
				{!isBinaryMode && <VsIconCheckbox checked={isRegexp} onToggle={setIsRegexp} title="Regular Expression Search">
					<RegexIcon />
				</VsIconCheckbox>}
				<VsIconCheckbox checked={isBinaryMode} onToggle={setIsBinaryMode} title="Search in Binary Mode">
					<BinaryFile />
				</VsIconCheckbox>
				<VsIconCheckbox checked={isCaseSensitive} onToggle={setIsCaseSensitive} title="Case Sensitive">
					<CaseSensitive />
				</VsIconCheckbox>
			</VsTextFieldGroup>
			<ResultBadge>
				{results.progress < 1
					? `Found ${resultCountStr}...`
					: !results.results.length
						? "No results"
						: selectedResult !== undefined
							? `${numberFormat.format(selectedResult + 1)} of ${resultCountStr}`
							: `${resultCountStr} results`}
			</ResultBadge>
			<VsIconButton title="Cancel Search" disabled={results.progress === 1} onClick={stopSearch}>
				<SearchStop />
			</VsIconButton>
			<VsIconButton disabled={results.results.length === 0} onClick={() => navigateResults(-1)} title="Previous Match">
				<ArrowUp />
			</VsIconButton>
			<VsIconButton disabled={results.results.length === 0} onClick={() => navigateResults(1)} title="Next Match">
				<ArrowDown />
			</VsIconButton>
			<VsIconButton title="Close Widget (Esc)" onClick={closeWidget}>
				<Close />
			</VsIconButton>
		</InputRow>
		<InputRow>
			<VsTextFieldGroup
				outerClassName={textFieldCls}
				buttons={0}
				value={replace}
				onChange={onReplaceChange}
				onKeyDown={onKeyDown}
				placeholder="Replace"
			/>
			<VsIconButton disabled={selectedResult === undefined} onClick={replaceSelected} title="Replace Selected Match">
				<Replace />
			</VsIconButton>
			<VsIconButton disabled={results.progress < 1 || !results.results.length} onClick={replaceAll} title="Replace All Matches">
				<ReplaceAll />
			</VsIconButton>
		</InputRow>
	</Wrapper>;
};
