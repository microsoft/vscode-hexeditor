// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { styled } from "@linaria/react";
import React, { Suspense, useLayoutEffect, useMemo } from "react";
import { render } from "react-dom";
import { RecoilRoot, useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { DataHeader } from "./dataDisplay";
import { DataDisplayContext, DisplayContext } from "./dataDisplayContext";
import { FindWidget } from "./findWidget";
import { useTheme } from "./hooks";
import { ReadonlyWarning } from "./readonlyWarning";
import { ScrollContainer } from "./scrollContainer";
import { SettingsGear } from "./settings";
import * as select from "./state";
import { VsProgressIndicator } from "./vscodeUi";

const Container = styled.div`
	display: flex;
	flex-direction: column;
	width: 100vw;
	height: 100vh;

	:global() {
		body {
			margin: 0;
			padding: 0;
		}

		html {
			padding: 0;
			overflow: hidden;
		}
	}
`;

const Root: React.FC = () => {
	const setDimensions = useSetRecoilState(select.dimensions);
	const theme = useTheme();

	useLayoutEffect(() => {
		const applyDimensions = () => setDimensions({
			width: window.innerWidth,
			height: window.innerHeight,
			rowPxHeight: parseInt(theme["font-size"]) + 8,
		});

		window.addEventListener("resize", applyDimensions);
		applyDimensions();
		return () => window.removeEventListener("resize", applyDimensions);
	}, [theme]);

	return <Suspense fallback={<VsProgressIndicator />}><Editor /></Suspense>;
};

const Editor: React.FC = () => {
	const dimensions = useRecoilValue(select.dimensions);
	const setEdit = useSetRecoilState(select.edits);
	const isReadonly = useRecoilValue(select.isReadonly);
	const ctx = useMemo(() => new DisplayContext(setEdit, isReadonly), []);

	const isLargeFile = useRecoilValue(select.isLargeFile);
	const [bypassLargeFilePrompt, setBypassLargeFile] = useRecoilState(select.bypassLargeFilePrompt);

	if (isLargeFile && !bypassLargeFilePrompt) {
		return <div>
			<p>Opening this large file may cause instability. <a id="open-anyway" role="button" onClick={() => setBypassLargeFile(true)}>Open anyways</a></p>
		</div>;
	}

	return <DataDisplayContext.Provider value={ctx}>
		<Container style={{ "--cell-size": `${dimensions.rowPxHeight}px` } as React.CSSProperties}>
			<FindWidget />
			<SettingsGear />
			<DataHeader />
			<ScrollContainer />
			<ReadonlyWarning />
		</Container>
	</DataDisplayContext.Provider>;
};


render(<RecoilRoot><Root /></RecoilRoot>, document.body);


