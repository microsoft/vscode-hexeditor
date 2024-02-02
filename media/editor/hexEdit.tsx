// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import React, { Suspense, useLayoutEffect, useMemo } from "react";
import { render } from "react-dom";
import { RecoilRoot, useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { InspectorLocation } from "../../shared/protocol";
import { DataHeader } from "./dataDisplay";
import { DataDisplayContext, DisplayContext } from "./dataDisplayContext";
import { DataInspectorHover } from "./dataInspector";
import { FindWidget } from "./findWidget";
import _style from "./hexEdit.css";
import { useTheme } from "./hooks";
import { ReadonlyWarning } from "./readonlyWarning";
import { ScrollContainer } from "./scrollContainer";
import { SettingsGear } from "./settings";
import * as select from "./state";
import { strings } from "./strings";
import { throwOnUndefinedAccessInDev } from "./util";
import { VsProgressIndicator } from "./vscodeUi";

const style = throwOnUndefinedAccessInDev(_style);

const Root: React.FC = () => {
	const setDimensions = useSetRecoilState(select.dimensions);
	const theme = useTheme();

	useLayoutEffect(() => {
		const applyDimensions = () =>
			setDimensions({
				width: window.innerWidth,
				height: window.innerHeight,
				rowPxHeight: parseInt(theme["font-size"]) + 8,
			});

		window.addEventListener("resize", applyDimensions);
		applyDimensions();
		return () => window.removeEventListener("resize", applyDimensions);
	}, [theme]);

	return (
		<Suspense fallback={<VsProgressIndicator />}>
			<Editor />
		</Suspense>
	);
};

const Editor: React.FC = () => {
	const dimensions = useRecoilValue(select.dimensions);
	const setEdit = useSetRecoilState(select.edits);
	const isReadonly = useRecoilValue(select.isReadonly);
	const inspectorLocation = useRecoilValue(select.dataInspectorLocation);
	const ctx = useMemo(() => new DisplayContext(setEdit, isReadonly), []);

	const isLargeFile = useRecoilValue(select.isLargeFile);
	const [bypassLargeFilePrompt, setBypassLargeFile] = useRecoilState(select.bypassLargeFilePrompt);

	if (isLargeFile && !bypassLargeFilePrompt) {
		return (
			<div>
				<p>
					{strings.openLargeFileWarning}{" "}
					<a id="open-anyway" role="button" onClick={() => setBypassLargeFile(true)}>
						{strings.openAnyways}
					</a>
				</p>
			</div>
		);
	}

	return (
		<DataDisplayContext.Provider value={ctx}>
			<div
				className={style.container}
				style={{ "--cell-size": `${dimensions.rowPxHeight}px` } as React.CSSProperties}
			>
				<FindWidget />
				<SettingsGear />
				<DataHeader />
				<ScrollContainer />
				<ReadonlyWarning />
				{inspectorLocation === InspectorLocation.Hover && <DataInspectorHover />}
			</div>
		</DataDisplayContext.Provider>
	);
};

render(
	<RecoilRoot>
		<Root />
	</RecoilRoot>,
	document.body,
);
