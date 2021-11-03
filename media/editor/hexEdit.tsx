// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import React, { useEffect, Suspense } from "react";
import { render } from "react-dom";
import { RecoilRoot, useRecoilState, useRecoilValue } from "recoil";
import { FromWebviewMessage, MessageHandler, ToWebviewMessage, WebviewMessageHandler } from "../../shared/protocol";
import { useTheme } from "./hooks";
import { ScrollContainer } from "./scrollContainer";
import * as select from "./state";
import { DataHeader } from "./virtualDocument";
import { styled } from "@linaria/react";

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
	const [dimensions, setDimensions] = useRecoilState(select.dimensions);
	const theme = useTheme();
	useEffect(() => {
		const listener = () => setDimensions({
			width: window.innerWidth,
			height: window.innerHeight,
			rowPxHeight: parseInt(theme["font-size"]) + 8,
			rowByteWidth: 16
		});

		window.addEventListener("resize", listener);
		listener();
		return () => window.removeEventListener("resize", listener);
	}, [theme]);

	const isLargeFile = useRecoilValue(select.isLargeFile);
	const [bypassLargeFilePrompt, setBypassLargeFile] = useRecoilState(select.bypassLargeFilePrompt);

	if (isLargeFile && !bypassLargeFilePrompt) {
		return <div>
			<p>Opening this large file may cause instability. <a id="open-anyway" role="button" onClick={() => setBypassLargeFile(true)}>Open anyways</a></p>
		</div>;
	}

	return <Container style={{ "--cell-size": `${dimensions.rowPxHeight}px` } as React.CSSProperties}>
		<DataHeader width={dimensions.rowByteWidth} />
		<ScrollContainer />
	</Container>;
};


render(<RecoilRoot><Suspense fallback='Loading...'><Root /></Suspense></RecoilRoot>, document.body);

const handleMessage = async (_message: ToWebviewMessage): Promise<FromWebviewMessage | undefined> => {
	return undefined; // todo
};

const messageHandler: WebviewMessageHandler = new MessageHandler(
	handleMessage,
	msg => window.postMessage(msg)
);

window.addEventListener("message", msg => messageHandler.handleMessage(msg.data));


