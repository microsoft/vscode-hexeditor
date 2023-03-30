import SettingsGearIcon from "@vscode/codicons/src/icons/settings-gear.svg";
import React, { useState } from "react";
import { useRecoilState } from "recoil";
import _style from "./settings.css";
import * as select from "./state";
import { throwOnUndefinedAccessInDev } from "./util";
import { VsIconButton, VsTextField, VsWidgetPopover } from "./vscodeUi";

const style = throwOnUndefinedAccessInDev(_style);

export const SettingsGear: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [anchor, setAnchor] = useState<Element | null>(null);

	return (
		<>
			<VsIconButton title="Open Settings" className={style.gear} onClick={() => setIsOpen(!isOpen)} ref={setAnchor}>
				<SettingsGearIcon />
			</VsIconButton>
			<VsWidgetPopover anchor={anchor} hide={() => setIsOpen(false)} visible={isOpen}>
				<SettingsContent />
			</VsWidgetPopover>
		</>
	);
};

const SettingsContent: React.FC = () => <div className={style.content}>
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

	const updateColumnWidth = (evt: React.ChangeEvent<HTMLInputElement>) => {
		updateSettings(s => {
			const colWidth = isNaN(evt.target.valueAsNumber) ? 1 : Math.max(evt.target.valueAsNumber, 1);
			const newSetting = { ...s, columnWidth: Math.min(colWidth, 32) };
			return newSetting;
		});
	};

	return (
		<>
			<label htmlFor="column-width">Bytes per Row</label>
			<VsTextField
				type="number"
				id="column-width"
				value={settings.columnWidth}
				min={1}
				max={32}
				style={{ width: 40 }}
				onChange={updateColumnWidth}
			/>
		</>
	);
};

