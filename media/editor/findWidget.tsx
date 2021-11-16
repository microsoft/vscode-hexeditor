import { css } from "@linaria/core";
import { styled } from "@linaria/react";
import React, { useState } from "react";
import { clsx } from "./util";
import { VsTextField } from "./vscodeUi";
import Search from "@vscode/codicons/src/icons/search.svg";

const Wrapper = styled.div`
	position: absolute;
	top: 0;
	right: 28px;
	width: 50%;
	max-width: 420px;
	transform: translateY(-100%);
	transition: transform 300ms;
	box-shadow: 0 0 8px 2px var(--vscode-widget-shadow);
	border: 1px solid var(--vscode-contrastBorder);
	color: var(--vscode-editorWidget-foreground);
	background: var(--vscode-editorWidget-background);
	padding: 4px;
`;

const InputRow = styled.div`
	display: flex;
`;

const visibleCls = css`transform: translateY(0);`;

export const FindWidget: React.FC = () => {
	const [visible, setVisible] = useState(true);

	return <Wrapper className={clsx(visible && visibleCls)}>
		<InputRow>
			<VsTextField placeholder="Find" />
			<Search />
		</InputRow>
	</Wrapper>;
};
