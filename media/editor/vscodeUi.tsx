import { VirtualElement } from "@popperjs/core";
import Close from "@vscode/codicons/src/icons/close.svg";
import React, { KeyboardEvent, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { usePopper } from "react-popper";
import { useGlobalHandler } from "./hooks";
import { clsx, throwOnUndefinedAccessInDev } from "./util";
import _style from "./vscodeUi.css";

const style = throwOnUndefinedAccessInDev(_style);

export const VsTextFieldGroup = React.forwardRef<
	HTMLInputElement,
	{
		buttons: number;
		outerClassName?: string;
		error?: string;
	} & React.InputHTMLAttributes<HTMLInputElement>
>(({ buttons, children, outerClassName, ...props }, ref) => (
	<div className={clsx(outerClassName, style.vsTextFieldGroupInner)}>
		<VsTextField
			{...props}
			ref={ref}
			style={{ paddingRight: buttons * (iconButtonMargin + iconButtonSize) }}
		/>
		<div className={style.vsTextFieldGroupButtons}>{children}</div>
	</div>
));

export const VsTextField = React.forwardRef<
	HTMLInputElement,
	{ error?: string } & React.InputHTMLAttributes<HTMLInputElement>
>(({ error, className, ...props }, ref) => (
	<div className={style.textFieldWrapper}>
		<input
			{...props}
			ref={ref}
			className={clsx(className, style.vsTextFieldInner, !!error && style.vsTextFieldError)}
		/>
		{error && <div className={style.vsTextFieldErrorMessage}>{error}</div>}
	</div>
));

export const VsProgressIndicator: React.FC = () => <div className={style.vsProgressIndicator} />;

export const iconButtonSize = 22;
const iconButtonMargin = 3;

export const VsButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
	children,
	...props
}) => (
	<button className={style.vsButton} {...props}>
		{children}
	</button>
);

const VsIconButtonInner = React.forwardRef<
	HTMLButtonElement,
	React.ButtonHTMLAttributes<HTMLButtonElement>
>((props, ref) => (
	<button {...props} className={clsx(props.className, style.vsIconButtonInner)} ref={ref}>
		{props.children}
	</button>
));

export const VsIconButton = React.forwardRef<
	HTMLButtonElement,
	{ title: string } & React.ButtonHTMLAttributes<HTMLButtonElement>
>((props, ref) => (
	<VsIconButtonInner ref={ref} role="button" {...props} aria-label={props.title} />
));

export const VsIconCheckbox: React.FC<{
	checked: boolean;
	title: string;
	onToggle: (checked: boolean) => void;
}> = ({ checked, title, onToggle, children }) => (
	<VsIconButton
		role="checkbox"
		title={title}
		aria-checked={checked}
		onClick={() => onToggle(!checked)}
	>
		{children}
	</VsIconButton>
);

export interface IPopoverProps {
	anchor: Element | VirtualElement | null;
	className?: string;
	focusable?: boolean;
	visible: boolean;
	hide: () => void;
	onClickOutside?: () => void;
	role?: string;
	arrow?: { className: string; size: number };
}

const PopoverArrow: React.FC<{ size: number } & React.SVGProps<SVGSVGElement>> = ({
	size: h,
	...props
}) => {
	const w = h * 1.5;
	return (
		<svg data-popper-arrow height={h} width={w} {...props}>
			<polygon points={`${w / 2},0 ${w},${h} 0,${h}`} />
			<polygon points={`${w / 2},1 ${w - 1},${h} 1,${h}`} />
		</svg>
	);
};

export const Popover: React.FC<IPopoverProps> = ({
	anchor,
	visible,
	className,
	children,
	focusable = true,
	arrow,
	hide,
	...props
}) => {
	const [popperElement, setPopperElement] = useState<HTMLElement | null>(null);
	const [arrowElement, setArrowElement] = useState<HTMLElement | null>(null);
	const { styles, attributes } = usePopper(
		anchor,
		popperElement,
		arrow && {
			modifiers: [
				{
					name: "arrow",
					options: { element: arrowElement },
				},
			],
		},
	);
	useEffect(() => {
		if (visible && focusable) {
			popperElement?.focus();
		}
	}, [visible]);

	useGlobalHandler<MouseEvent>(
		"mousedown",
		evt => {
			if (evt.target instanceof Element && !popperElement?.contains(evt.target)) {
				hide();
			}
		},
		[hide, popperElement],
	);

	return ReactDOM.createPortal(
		<div
			ref={setPopperElement}
			aria-hidden={!visible}
			className={clsx(style.popover, !visible && style.popoverHidden)}
			style={styles.popper}
			tabIndex={visible ? 0 : -1}
			role="region"
			{...attributes.popper}
			{...props}
		>
			<div className={className} style={arrow && { margin: arrow.size - 1 }}>
				{children}
			</div>
			{arrow && (
				<div
					ref={setArrowElement}
					className={arrow.className}
					style={styles.arrow}
					{...attributes.arrow}
				>
					<PopoverArrow size={arrow.size} />
				</div>
			)}
		</div>,
		document.body,
	);
};

const tooltipArrow = { size: 8, className: style.tooltipArrow };

export const tooltipArrowSize = tooltipArrow.size;

export const VsTooltipPopover: React.FC<IPopoverProps> = props => {
	useGlobalHandler<KeyboardEvent>(
		"keydown",
		evt => {
			if (evt.key === "Escape") {
				props.hide();
			}
		},
		[props.hide],
	);

	return (
		<Popover
			{...props}
			className={clsx(props.className, style.tooltipPopover)}
			role="alert"
			focusable={false}
			arrow={tooltipArrow}
		>
			{props.children}
		</Popover>
	);
};

export const VsWidgetPopover: React.FC<IPopoverProps> = props => (
	<Popover {...props} className={clsx(props.className, style.tooltipPopover, style.widgetPopover)}>
		<VsIconButton title="Close" onClick={props.hide} className={style.widgetPopoverCloser}>
			<Close />
		</VsIconButton>
		{props.children}
	</Popover>
);
