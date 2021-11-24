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
import ChevronRight from "@vscode/codicons/src/icons/chevron-right.svg";
import ChevronDown from "@vscode/codicons/src/icons/chevron-down.svg";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { HexDocumentEditOp, HexDocumentReplaceEdit } from "../../shared/hexDocumentModel";
import { LiteralSearchQuery, MessageType, SearchRequestMessage, SearchResult, SearchResultsWithProgress } from "../../shared/protocol";
import { dataCellCls } from "./dataDisplay";
import { FocusedElement, useDisplayContext } from "./dataDisplayContext";
import * as select from "./state";
import { clsx, hexDecode, isHexString, parseHexDigit, Range } from "./util";
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
	padding: 2px;
	z-index: 1;
	display: flex;
`;

const InputRow = styled.div`
	display: flex;
	align-items: center;
	justify-content: start;
	margin: 2px 0;
`;

const resultBadgeCls = css`
	margin: 0 0 0 3px;
	padding: 2px 0 0 2px;
	min-width: 69px;
	font-size: 0.9em;
	white-space: nowrap;

	> a {
		cursor: pointer;
	}
`;

const visibleCls = css`
	transform: translateY(0);
	box-shadow: 0 0 8px 2px var(--vscode-widget-shadow);
`;

const replaceToggleCls = css`
	align-self: stretch;
	height: initial !important;
	margin: 1px !important;
	padding: 0 !important;
`;

const ControlsContainer = styled.div`
	width: 0;
	flex-grow: 1;
`;

const textFieldCls = css`flex-grow: 1`;

const queryDebounce = 200;

const defaultResultCap = 10_000;

const resultCountFormat = new Intl.NumberFormat(undefined, { notation: "compact" });
const selectedFormat = new Intl.NumberFormat();

/**
 * Parses a query like "AABB??DD" into a query looking for
 * `[[170, 187], "*", [221]]`.
 */
const parseHexStringWithPlaceholders = (str: string): LiteralSearchQuery | undefined => {
	const value = new Uint8Array(Math.ceil(str.length / 2));
	let valueStart = 0;
	let valueEnd = 0;

	const query: LiteralSearchQuery = { literal: [] };
	for (let i = 0; i < str.length; i += 2) {
		if (str[i] === "?" && (i + 1 === str.length || str[i + 1] === "?")) {
			if (valueEnd > valueStart) {
				query.literal.push(value.subarray(valueStart, valueEnd));
				valueStart = valueEnd;
			}

			query.literal.push("*");
			continue;
		}

		const a = parseHexDigit(str[i]);
		const b = i + 1 === str.length ? 0 : parseHexDigit(str[i + 1]);
		if (a === undefined || b === undefined) {
			return undefined;
		}

		value[valueEnd++] = a << 4 | b;
	}

	if (valueEnd > valueStart) {
		query.literal.push(value.subarray(valueStart, valueEnd));
	}

	return query;
};

const getReplaceOrError = (replace: string, isBinaryMode: boolean) => {
	if (isBinaryMode) {
		return isHexString(replace)
			? hexDecode(replace)
			: "Only hexadecimal characters (0-9 and a-f) are allowed";
	}

	return new TextEncoder().encode(replace);
};

const getSearchQueryOrError = (query: string, isBinaryMode: boolean, isRegexp: boolean): SearchRequestMessage["query"] | string => {
	if (isBinaryMode) {
		return parseHexStringWithPlaceholders(query) || "Only hexadecimal characters (0-9, a-f, and ?? placeholders) are allowed";
	}

	if (isRegexp) {
		try {
			new RegExp(query);
		} catch (e) {
			return (e as SyntaxError).message;
		}

		return { re: query };
	}

	return { literal: [new TextEncoder().encode(query)] };
};

const searchResultToEdit = (value: Uint8Array) => (r: SearchResult): HexDocumentReplaceEdit => ({
	op: HexDocumentEditOp.Replace,
	offset: r.from,
	value,
	previous: r.previous,
});

export const FindWidget: React.FC = () => {
	const [visible, setVisible] = useState(false);
	const [replaceVisible, setReplaceVisible] = useState(false);
	const [query, setQuery] = useState("");
	const [replace, setReplace] = useState("");
	const [isBinaryMode, setIsBinaryMode] = useState(false);
	const [isRegexp, setIsRegexp] = useState(false);
	const [isCaseSensitive, setIsCaseSensitive] = useState(false);
	const [results, setResults]= useRecoilState(select.searchResults);
	const [selectedResult, setSelectedResult] = useState<number>();
	const [offset, setOffset] = useRecoilState(select.offset);
	const dimensions = useRecoilValue(select.dimensions);
	const ctx = useDisplayContext();
	const textFieldRef = useRef<HTMLInputElement | null>(null);
	const edits = useRecoilValue(select.edits);
	const [isUncapped, setUncapped] = useState(false);
	/** Element that was focused before the find widget was shown */
	const previouslyFocusedElement = useRef<FocusedElement>();

	const queryOrError = getSearchQueryOrError(query, isBinaryMode, isRegexp);
	const replaceOrError = getReplaceOrError(replace, isBinaryMode);

	const onQueryChange = useCallback(
		(evt: React.ChangeEvent<HTMLInputElement>) => {
			setQuery(evt.target.value);
			setUncapped(false);
			setSelectedResult(undefined);
		},
		[isBinaryMode],
	);

	const onReplaceChange = useCallback(
		(evt: React.ChangeEvent<HTMLInputElement>) => setReplace(evt.target.value),
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
				previouslyFocusedElement.current = ctx.focusedElement;
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

		if (typeof queryOrError === "string") {
			return;
		}

		let started = false;
		const timeout = setTimeout(() => {
			started = true;
			setResults({ progress: 0, results: [] });
			select.messageHandler.sendRequest({
				type: MessageType.SearchRequest,
				cap: isUncapped ? undefined : defaultResultCap,
				query: queryOrError,
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
	}, [query, isCaseSensitive, isUncapped, isRegexp, isBinaryMode, edits]);

	const closeWidget = () => {
		const prev = previouslyFocusedElement.current;
		if (prev !== undefined && select.isByteVisible(dimensions, offset, prev.byte)) {
			ctx.focusedElement = prev;
		} else {
			document.querySelector<HTMLElement>(`.${dataCellCls}`)?.focus();
		}

		setVisible(false);
	};

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
		if (selectedResult && typeof replaceOrError !== "string") {
			const r = results.results[selectedResult];
			ctx.edit(searchResultToEdit(replaceOrError)(r));
		}
	};

	const replaceAll = () => {
		if (typeof replaceOrError !== "string") {
			ctx.edit(results.results
				.map(searchResultToEdit(replaceOrError))
				.sort((a, b) => b.offset - a.offset));
		}
	};

	const toggleFindReplace = useCallback(() => setReplaceVisible(v => !v), []);

	return <Wrapper tabIndex={visible ? undefined : -1} className={clsx(visible && visibleCls)}>
		{results.progress < 1 && <VsProgressIndicator />}
		<VsIconButton title="Toggle Replace" onClick={toggleFindReplace} className={replaceToggleCls}>
			{replaceVisible ? <ChevronDown /> : <ChevronRight />}
		</VsIconButton>
		<ControlsContainer>
			<InputRow>
				<VsTextFieldGroup
					buttons={3}
					ref={textFieldRef}
					outerClassName={textFieldCls}
					placeholder={isBinaryMode ? "Find Bytes (hex)" : "Find Text"}
					value={query}
					onChange={onQueryChange}
					onKeyDown={onKeyDown}
					error={typeof queryOrError === "string" ? queryOrError : undefined}
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
				<ResultBadge onUncap={() => setUncapped(true)} results={results} selectedResult={selectedResult} />
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
			{replaceVisible && <InputRow>
				<VsTextFieldGroup
					outerClassName={textFieldCls}
					buttons={0}
					value={replace}
					onChange={onReplaceChange}
					onKeyDown={onKeyDown}
					placeholder="Replace"
					error={typeof replaceOrError === "string" ? replaceOrError : undefined}
				/>
				<VsIconButton disabled={typeof replaceOrError === "string" || selectedResult === undefined} onClick={replaceSelected} title="Replace Selected Match">
					<Replace />
				</VsIconButton>
				<VsIconButton disabled={typeof replaceOrError === "string" || results.progress < 1 || !results.results.length} onClick={replaceAll} title="Replace All Matches">
					<ReplaceAll />
				</VsIconButton>
			</InputRow>}
		</ControlsContainer>
	</Wrapper>;
};


const ResultBadge: React.FC<{
	results: SearchResultsWithProgress;
	selectedResult: number | undefined;
	onUncap(): void;
}> = ({ results, selectedResult, onUncap }) => {
	const resultCountStr = resultCountFormat.format(results.results.length);
	const resultCountComponent = results.capped
		? <a role="button" title={`More than ${results.results.length} results, click to find all`} onClick={onUncap}>{resultCountStr}+</a>
		: <span title={`${results.results.length} results`}>{resultCountStr}</span>;

		return <div className={resultBadgeCls}>
			{results.progress < 1
				? `Found ${resultCountStr}...`
				: !results.results.length
					? "No results"
					: selectedResult !== undefined
						? <>{selectedFormat.format(selectedResult + 1)} of {resultCountComponent}</>
						: <>{resultCountComponent} results</>}
		</div>;
};
