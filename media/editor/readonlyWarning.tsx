import React, { useCallback, useEffect } from "react";
import { useRecoilState } from "recoil";
import * as select from "./state";
import { strings } from "./strings";
import { VsTooltipPopover } from "./vscodeUi";

export const ReadonlyWarning: React.FC = () => {
	const [anchor, setAnchor] = useRecoilState(select.showReadonlyWarningForEl);
	const hide = useCallback(() => setAnchor(null), []);

	useEffect(() => {
		if (!anchor) {
			return;
		}

		const timeout = setTimeout(() => setAnchor(null), 3000000);
		return () => clearTimeout(timeout);
	});

	return (
		<VsTooltipPopover anchor={anchor} hide={hide} visible={!!anchor}>
			{strings.readonlyWarning}
		</VsTooltipPopover>
	);
};
