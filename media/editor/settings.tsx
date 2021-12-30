import SettingsGearIcon from "@vscode/codicons/src/icons/settings-gear.svg";
import React, { useState } from "react";
import { useRecoilState } from "recoil";
import * as select from "./state";
import { VsIconButton, VsTextField, VsWidgetPopover } from "./vscodeUi";
import { css } from "@linaria/core";

const settingsGearCls = css`
	position: absolute;
	top: 0;
	left: 0;
`;

export const SettingsGear: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [anchor, setAnchor] = useState<Element | null>(null);

	return (
		<>
			<VsIconButton title="Open Settings" className={settingsGearCls} onClick={() => setIsOpen(!isOpen)} ref={setAnchor}>
				<SettingsGearIcon />
			</VsIconButton>
			<VsWidgetPopover anchor={anchor} hide={() => setIsOpen(false)} visible={isOpen}>
				<SettingsContent />
			</VsWidgetPopover>
		</>
	);
};

const contentCls = css`
	display: grid;
	grid-template-columns: 1fr auto;
	grid-gap: 0.5em;
	align-items: center;
`;

const SettingsContent: React.FC = () => <div className={contentCls}>
	<TextCheckbox />
	<ColumnWidth />
</div>;

const TextCheckbox: React.FC = () => {
	const [settings, updateSettings] = useRecoilState(select.editorSettings);

  return (
		<>
			<label htmlFor="text-checkbox">Show Decoded Text</label>
			<input
				type="checkbox"
				id="text-checkbox"
				checked={settings.showDecodedText}
				onChange={evt => updateSettings(s => ({ ...s, showDecodedText: evt.target.checked }))}
			/>
		</>
	);
};

const ColumnWidth: React.FC = () => {
	const [settings, updateSettings] = useRecoilState(select.editorSettings);

  return (
		<>
			<label htmlFor="column-width">Bytes per Row</label>
			<VsTextField
				type="number"
				id="column-width"
				value={settings.columnWidth}
				min={1}
				max={512}
				style={{ width: 40 }}
				onChange={evt => updateSettings(s => ({ ...s, columnWidth: evt.target.valueAsNumber }))}
			/>
		</>
	);
};

