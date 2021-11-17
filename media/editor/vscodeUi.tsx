import { styled } from "@linaria/react";
import React from "react";

const VsTextFieldGroupInner = styled.div`
	position: relative

	> input {
		width: 100%;
		box-sizing: border-box;
	}
`;
const VsTextFieldGroupButtons = styled.div`
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
`;

export const VsTextFieldGroup =
React.forwardRef<HTMLInputElement, { buttons: number; outerClassName?: string } & React.InputHTMLAttributes<HTMLInputElement>>(
	({ buttons, children, outerClassName, ...props }, ref) => (
		<VsTextFieldGroupInner className={outerClassName}>
			<VsTextField {...props} ref={ref} style={{ paddingRight: buttons * (iconButtonMargin + iconButtonSize) }} />
			<VsTextFieldGroupButtons>{children}</VsTextFieldGroupButtons>
		</VsTextFieldGroupInner>
	)
);

export const VsTextField = styled.input`
	background: var(--vscode-input-background);
	border: 1px solid var(--vscode-input-border, transparent);
	color: var(--vscode-input-foreground);
	padding: 2px 4px;

	::placeholder {
		color: var(--vscode-input-placeholderForeground);
	}

	:focus {
		outline: 0 !important;
		border-color: var(--vscode-focusBorder);
	}
`;

export const VsProgressIndicator = styled.div`
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 3px;
	pointer-events: none;
	overflow: hidden;
	z-index: 1;

	::before {
		content: "";
		position: absolute;
		inset: 0;
		width: 2%;
		animation-name: progress;
		animation-duration: 4s;
		animation-iteration-count: infinite;
		animation-timing-function: linear;
		transform: translate3d(0px, 0px, 0px);
		background: var(--vscode-progressBar-background);
	}

	@keyframes progress {
		from { transform: translateX(0%) scaleX(1) }
		50% { transform: translateX(2500%) scaleX(3) }
		to { transform: translateX(4900%) scaleX(1) }
	}
`;

const iconButtonSize = 22;
const iconButtonMargin = 3;

const VsIconButtonInner = styled.button`
	background: transparent;
	width: ${iconButtonSize}px;
	height: ${iconButtonSize}px;
	padding: 4px;
	border-radius: 5px;
	display: flex;
	flex: initial;
	margin-left: ${iconButtonMargin}px;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 0;
	color: var(--vscode-icon-foreground);

	&[disabled] {
		opacity: 0.3;
		background: transparent !important;
		cursor: auto;
	}

	&[aria-checked="true"] {
		background: var(--vscode-inputOption-activeBackground);
		outline: 1px solid var(--vscode-inputOption-activeBorder);
		color: var(--vscode-inputOption-activeForeground);
	}

	&:hover {
		background: var(--vscode-toolbar-hoverBackground);
	}

	&:focus {
		outline: 1px solid var(--vscode-focusBorder);
	}
`;

export const VsIconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string }> = props => <VsIconButtonInner {...props} aria-label={props.title} />;

export const VsIconCheckbox: React.FC<{
	checked: boolean;
	title: string;
	onToggle: (checked: boolean) => void,
}> = ({ checked, title, onToggle, children }) => (
	<VsIconButton role="checkbox" title={title} aria-checked={checked} onClick={() => onToggle(!checked)}>
		{children}
	</VsIconButton>
);
