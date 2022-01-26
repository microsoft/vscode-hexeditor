import { css } from "@linaria/core";
import { styled } from "@linaria/react";
import Close from "@vscode/codicons/src/icons/close.svg";
import React, { useEffect, useState } from "react";
import { usePopper } from "react-popper";
import { clsx } from "./util";
import ReactDOM from "react-dom";

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

export const iconButtonSize = 22;
const iconButtonMargin = 3;

export const VsButton = styled.button`
	background: var(--vscode-button-background);
	color: var(--vscode-button-foreground);
	border: 1px solid var(--vscode-button-border);
	padding: 0 ${iconButtonMargin + iconButtonSize}px;
	font-family: var(--vscode-font-family);
	cursor: pointer;
	padding: 6px 11px;

	:hover {
		background: var(--vscode-button-hoverBackground);
	}

	:active {
		background: var(--vscode-button-background);
	}

	:focus {
		outline: 1px solid var(--vscode-focusBorder);
	}

	:disabled {
		opacity: 0.5;
		cursor: default;
	}
`;

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

export const VsIconButton = React.forwardRef<HTMLButtonElement, { title: string }& React.ButtonHTMLAttributes<HTMLButtonElement>>(
	(props, ref) => <VsIconButtonInner ref={ref} role="button" {...props} aria-label={props.title} />,
);

export const VsIconCheckbox: React.FC<{
	checked: boolean;
	title: string;
	onToggle: (checked: boolean) => void,
}> = ({ checked, title, onToggle, children }) => (
	<VsIconButton role="checkbox" title={title} aria-checked={checked} onClick={() => onToggle(!checked)}>
		{children}
	</VsIconButton>
);

const popoverCls = css`
	position: absolute;
	z-index: 1;
`;

const popoverHiddenCls = css`
	opacity: 0;
	pointer-events: none;
`;

export interface IPopoverProps {
	anchor: Element | null;
	className?: string;
	focusable?: boolean;
	visible: boolean;
	hide: () => void;
	role?: string;
	arrow?: { className: string, size: number };
}

const PopoverArrow: React.FC<{ size: number } & React.SVGProps<SVGSVGElement>> = ({ size: h, ...props }) => {
	const w = h * 1.5;
	return (
		<svg data-popper-arrow height={h} width={w} {...props}>
			<polygon points={`${w / 2},0 ${w},${h} 0,${h}`} />
			<polygon points={`${w / 2},1 ${w - 1},${h} 1,${h}`} />
		</svg>
	);
};

export const Popover: React.FC<IPopoverProps> = ({ anchor, visible, className, children, focusable = true, arrow, hide: _hide, ...props }) => {
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null);
  const [arrowElement, setArrowElement] = useState<HTMLElement | null>(null);
  const { styles, attributes } = usePopper(anchor, popperElement, arrow && {
		modifiers: [
			{
				name: "arrow",
				options: { element: arrowElement }
			},
		],
	});
	useEffect(() => {
		if (visible && focusable) {
			popperElement?.focus();
		}
	}, [visible]);

	return ReactDOM.createPortal(
		<div
			ref={setPopperElement}
			aria-hidden={!visible}
			className={clsx(popoverCls, !visible && popoverHiddenCls)}
			style={styles.popper}
			tabIndex={visible ? 0 : -1}
			role="region"
			{...attributes.popper}
			{...props}
		>
			<div className={className} style={arrow && { margin: arrow.size - 1 }}>{children}</div>
			{arrow && <div ref={setArrowElement} className={arrow.className} style={styles.arrow} {...attributes.arrow} >
				<PopoverArrow size={arrow.size} />
			</div>}
		</div>,
		document.body,
	);
};

const tooltipPopoverCls = css`
	background: var(--vscode-editorWidget-background);
	color: var(--vscode-editorWidget-foreground);
	border: 1px solid var(--vscode-editorWidget-border);
	padding: 0.5em;
	padding-right: calc(0.8em + ${iconButtonSize}px);
	box-shadow: 0 0 8px 2px var(--vscode-widget-shadow);
	transition: 0.2s opacity;
`;

const tooltipArrowCls = css`
	position: absolute;
	top: 0;
	left: 0;

	svg {
		display: block;
	}

	polygon:first-child {
		fill: var(--vscode-editorWidget-border);
	}

	polygon:last-child {
		fill: var(--vscode-editorWidget-background);
	}
}
`;

const widgetPopoverCls = css`
	padding-right: calc(0.8em + ${iconButtonSize}px);
	transition: none;
`;

const widgetPopoverCloser = css`
	position: absolute;
	top: 0.5em;
	right: 0.5em;
`;

const tooltipArrow = { size: 8, className: tooltipArrowCls };

export const VsTooltipPopover: React.FC<IPopoverProps> = (props) => {
	useEffect(() => {
		const listener = props.hide;
		window.addEventListener("keydown", listener);
		window.addEventListener("mousedown", listener);
		return () => {
			window.removeEventListener("keydown", listener);
			window.removeEventListener("mousedown", listener);
		};
	}, [props.hide]);

	return (
		<Popover {...props} className={clsx(props.className, tooltipPopoverCls)} role="alert" focusable={false} arrow={tooltipArrow}>
			{props.children}
		</Popover>
	);
};

export const VsWidgetPopover: React.FC<IPopoverProps> = props => (
	<Popover {...props} className={clsx(props.className, tooltipPopoverCls, widgetPopoverCls)}>
		<VsIconButton title="Close" onClick={props.hide} className={widgetPopoverCloser}>
			<Close />
		</VsIconButton>
		{props.children}
	</Popover>
);

