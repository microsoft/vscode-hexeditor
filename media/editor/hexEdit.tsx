// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Fragment, FunctionComponent, h, render } from "preact";
import { Suspense, useEffect } from "preact/compat";
import { RecoilRoot, useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { FromWebviewMessage, MessageHandler, ToWebviewMessage, WebviewMessageHandler } from "../../shared/protocol";
import { useTheme } from "./hooks";
import * as select from "./state";
import { DataDisplay } from "./virtualDocument";

const Root: FunctionComponent = () => {
	const setWindowSize = useSetRecoilState(select.dimensions);
	const theme = useTheme();
	useEffect(() => {
		const listener = () => setWindowSize({
			width: window.innerWidth,
			height: window.innerHeight,
			rowHeight: parseInt(theme["font-size"]) + 4
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

	return <>
		<div className="column left">
			<div className="header" aria-hidden>00000000</div>
			<div className="rowwrapper" id="hexaddr" />
		</div>
		<div id="editor-container">
			<DataDisplay />
			<div id="scrollbar">
				<div role="scrollbar" id="scroll-thumb">
				</div>
			</div>
		</div>
	</>;
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


