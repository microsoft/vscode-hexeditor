import { styled } from "@linaria/react";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { Endianness } from "../../shared/protocol";
import { FocusedElement, getDataCellElement, useDisplayContext } from "./dataDisplayContext";
import { inspectableTypes } from "./dataInspectorProperties";
import { useFileBytes, usePersistedState } from "./hooks";
import * as select from "./state";
import { VsTooltipPopover } from "./vscodeUi";

/** Component that shows a data inspector when bytes are hovered. */
export const DataInspectorHover: React.FC = () => {
	const ctx = useDisplayContext();
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
			<InspectorContents columns={4} offset={inspected.byte} />
		</Suspense>
	</VsTooltipPopover>;
};

/** Data inspector view shown to the right hand side of the hex editor. */
export const DataInspectorAside: React.FC<{ onInspecting?(isInspecting: boolean): void }> = ({ onInspecting }) => {
	const ctx = useDisplayContext();
	const [inspected, setInspected] = useState<FocusedElement | undefined>(ctx.focusedElement);

	useEffect(() => {
		const disposable = ctx.onDidFocus(focused => {
			if (!inspected) {
				onInspecting?.(true);
			}
			if (focused) {
				setInspected(focused);
			}
		});
		return () => disposable.dispose();
	}, []);

	if (!inspected) {
		return null;
	}

	return <Suspense fallback={null}>
		<InspectorContents columns={2} offset={inspected.byte} />
	</Suspense>;
};

const lookahead = 8;

const TypesList = styled.dl`
	display: grid;
	gap: 0.3rem 1rem;
	align-items: center;
	margin: 0;
	max-width: calc(100vw - 30px);

	dd, dl {
		margin: 0;
	}

	dd {
		font-family: var(--vscode-editor-font-family);
		user-select: all;
	}
`;

/** Inner contents of the data inspector, reused between the hover and aside inspector views. */
const InspectorContents: React.FC<{
	offset: number;
	columns: number;
}> = ({ offset, columns }) => {
	const defaultEndianness = useRecoilValue(select.editorSettings).defaultEndianness;
	const [endianness, setEndianness] = usePersistedState("endianness", defaultEndianness);
	const target = useFileBytes(offset, lookahead);
	const dv = new DataView(target.buffer);
	const le = endianness === Endianness.Little;

	return <>
		<TypesList style={{ gridTemplateColumns: "max-content ".repeat(columns) }}>
			{inspectableTypes.filter(t => target.length >= t.minBytes).map(({ label, convert }) =>
				<React.Fragment key={label}>
					<dt>{label}</dt>
					<dd>{convert(dv, le)}</dd>
				</React.Fragment>
			)}
		</TypesList>
		<EndiannessToggle endianness={endianness} setEndianness={setEndianness} />
	</>;
};

const EndiannessToggleContainer = styled.div`
	display: flex;
	align-items: center;

	input {
		margin: 0 0.3rem 0 0;
	}
`;

/** Controlled checkbox that toggles between little and big endian. */
const EndiannessToggle: React.FC<{
	endianness: Endianness;
	setEndianness: (e: Endianness) => void;
}> = ({ endianness, setEndianness }) => (
	<EndiannessToggleContainer>
		<input
			type="checkbox"
			id="endian-checkbox"
			checked={endianness === Endianness.Little}
			onChange={evt => setEndianness(evt.target.checked ? Endianness.Little : Endianness.Big)}
		/>
		<label htmlFor="endian-checkbox">Little Endian</label>
	</EndiannessToggleContainer>
);
