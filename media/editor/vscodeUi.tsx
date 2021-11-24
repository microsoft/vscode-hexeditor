import { styled } from "@linaria/react";
import { css } from "@linaria/core";
import React from "react";
import { clsx } from "./util";

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
React.forwardRef<HTMLInputElement, { buttons: number; outerClassName?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>>(
	({ buttons, children, outerClassName, ...props }, ref) => (
		<VsTextFieldGroupInner className={outerClassName}>
			<VsTextField {...props} ref={ref} style={{ paddingRight: buttons * (iconButtonMargin + iconButtonSize) }} />
			<VsTextFieldGroupButtons>{children}</VsTextFieldGroupButtons>
		</VsTextFieldGroupInner>
	)
);

const VsTextFieldErrorMessage = styled.div`
	display: none;
	position: absolute;
	top: 100%;
	left: 0;
	right: 0;
	padding: .4em;
	font-size: 12px;
	line-height: 17px;
	margin-top: -1px;
	word-wrap: break-word;
	border: 1px solid var(--vscode-inputValidation-errorBorder);
	color: var(--vscode-inputValidation-errorForeground);
	background: var(--vscode-inputValidation-errorBackground);
	z-index: 1;
`;

const TextFieldWrapper = styled.div`
	position: relative;
	display: flex;

	:focus-within ${VsTextFieldErrorMessage} {
		display: block;
	}
`;

const VsTextFieldInner = styled.input`
	background: var(--vscode-input-background);
	border: 1px solid var(--vscode-input-border, transparent);
	color: var(--vscode-input-foreground);
	padding: 2px 4px;
	width: 0;
	flex-grow: 1;

	::placeholder {
		color: var(--vscode-input-placeholderForeground);
	}

	:focus {
		outline: 0 !important;
		border-color: var(--vscode-focusBorder);
	}
`;

const vsTextFieldErrorCls = css`
	border-color: var(--vscode-inputValidation-errorBorder) !important;
`;

export const VsTextField = React.forwardRef<HTMLInputElement, { error?: string } & React.InputHTMLAttributes<HTMLInputElement>>(({ error, className, ...props }, ref) =>
	<TextFieldWrapper>
		<VsTextFieldInner {...props} ref={ref} className={clsx(className, !!error && vsTextFieldErrorCls)} />
		{error && <VsTextFieldErrorMessage>{error}</VsTextFieldErrorMessage>}
	</TextFieldWrapper>
);

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

	&:hover {
		background: var(--vscode-toolbar-hoverBackground);
	}

	&[aria-checked="true"] {
		background: var(--vscode-inputOption-activeBackground);
		outline: 1px solid var(--vscode-inputOption-activeBorder);
		color: var(--vscode-inputOption-activeForeground);
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
