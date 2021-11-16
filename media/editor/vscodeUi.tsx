import { styled } from "@linaria/react";

export const VsTextField = styled.input`
	background: var(--vscode-input-background);
	border: 1px solid var(--vscode-input-border, transparent);
	color: var(--vscode-input-foreground);
	padding: 2px 4px;

	::placeholder {
		color: var(--vscode-input-foreground);
	}

	:focus {
		outline: 0 !important;
		border-color: var(--vscode-focusBorder);
	}
`;
