import { EventEmitter, IDisposable } from "cockatiel";
import { createContext, useContext, useEffect, useState } from "react";
import { MessageType } from "../../shared/protocol";
import { messageHandler } from "./state";
import { Range } from "./util";

export class FocusedElement {
	public static readonly zero = new FocusedElement(false, 0);
	public readonly key = BigInt(this.byte) << 1n | (this.char ? 1n : 0n);

	constructor(
		/** If true, the character rather than data is focused */
		public readonly char: boolean,
		/** Focused byte index */
		public readonly byte: number,
	) {}

	/** Gets the other element at this byte (the character or non-character) */
	public other(): FocusedElement {
		return new FocusedElement(!this.char, this.byte);
	}
}

/**
 * Data management context component. Initially we used Recoil for this, but
 * this ended up introducing performance issues with very many components.
 */
export class DisplayContext {
	private _selection: Range[] = [];
	private _hoveredByte?: FocusedElement;
	private _focusedByte?: FocusedElement;
	private readonly selectionChangeEmitter = new EventEmitter<{range:Range; isSingleSwap: boolean}>();
	private readonly hoverChangeHandlers = new Map<bigint, (isSelected: boolean) => void>();
	private readonly focusChangeHandlers = new Map<bigint, (isSelected: boolean) => void>();

	/**
	 * Whether the user is currently selecting data.
	 */
	public isSelecting = false;

	/**
	 * Emitter that fires when a selection for a single byte changes.
	 */
	public onDidChangeSelection(forByte: number, listener: (isSingleSwap: boolean) => void): IDisposable {
		return this.selectionChangeEmitter.addListener((evt) => {
			if (evt.range.includes(forByte)) {
				listener(evt.isSingleSwap);
			}
		});
	}

	/**
	 * Emitter that fires when the given byte is focused or unfocused.
	 */
	public onDidChangeFocus(element: FocusedElement, listener: (isFocused: boolean) => void): IDisposable {
		if (this.focusChangeHandlers.has(element.key)) {
			throw new Error(`Duplicate focus change handler for byte ${element.byte}`);
		}

		this.focusChangeHandlers.set(element.key, listener);
		return { dispose: () => this.focusChangeHandlers.delete(element.key) };
	}

	/**
	 * Emitter that fires when the given byte is hovered or unhovered.
	 */
	public onDidChangeHovered(element: FocusedElement, listener: (isHovered: boolean) => void): IDisposable {
		if (this.hoverChangeHandlers.has(element.key)) {
			throw new Error(`Duplicate hover change handler for byte ${element.byte}`);
		}

		this.hoverChangeHandlers.set(element.key, listener);
		return { dispose: () => this.hoverChangeHandlers.delete(element.key) };
	}

	/**
	 * Gets the currently focused byte, if any.
	 */
	public get focusedElement(): FocusedElement | undefined {
		return this._focusedByte;
	}

	/**
	 * Updates the currently focused byte.
	 */
	public set focusedElement(element: FocusedElement | undefined ) {
		if (this._focusedByte?.key === element?.key) {
			return;
		}

		if (this._focusedByte !== undefined) {
			this.focusChangeHandlers.get(this._focusedByte.key)?.(false);
		}

		this._focusedByte = element;

		if (this._focusedByte !== undefined) {
			this.focusChangeHandlers.get(this._focusedByte.key)?.(true);
			messageHandler.sendEvent({
				type: MessageType.SetInspectByte,
				offset: this._focusedByte.byte,
			});
		}
	}

	/**
	 * Gets the currently hovered byte, if any.
	 */
	public get hoveredByte(): FocusedElement | undefined {
		return this._hoveredByte;
	}

	/**
	 * Updates the currently hovered byte.
	 */
	public set hoveredByte(byte: FocusedElement | undefined) {
		if (this._hoveredByte === byte) {
			return;
		}

		if (this._hoveredByte !== undefined) {
			this.hoverChangeHandlers.get(this._hoveredByte.key)?.(false);
			this.hoverChangeHandlers.get(this._hoveredByte.other().key)?.(false);
		}

		this._hoveredByte = byte;

		if (this._hoveredByte !== undefined) {
			this.hoverChangeHandlers.get(this._hoveredByte.key)?.(true);
			this.hoverChangeHandlers.get(this._hoveredByte.other().key)?.(true);
		}
	}

	/**
	 * Bytes the user has selected, as a list of ranges. Each range "switches"
	 * the state of included bytes. For instance, if X is included `[r1]`, it's
	 * selected. If X is included in both `[r1, r2]`, it's not selected.
	 */
	public get selection(): readonly Range[] {
		return this._selection;
	}

	/**
	 * Gets whether the given byte is selected.
	 */
	public isSelected(byte: number): boolean {
		let selected = false;
		for (const range of this._selection) {
			if (range.includes(byte)) {
				selected = !selected;
			}
		}

		return selected;

	}

	/**
	 * Replaces the selection with the given ranges.
	 */
	public replaceSelectionRanges(ranges: Range[]): void {
		if (this._selection.length === 0 && ranges.length === 1) {
			this.addSelectionRange(ranges[0]);
			return;
		}

		let min = Infinity;
		let max = -Infinity;
		for (const rangeList of [ranges, this._selection]) {
			for (const range of rangeList) {
				min = Math.min(min, range.start);
				max = Math.max(max, range.end);
			}
		}

		this._selection = ranges;
		this.selectionChangeEmitter.emit({ range: new Range(min, max + 1), isSingleSwap: false });
	}

	/**
	 * Updates the last range in the selection to match the given new range.
	 */
	public replaceLastSelectionRange(range: Range): void {
		if (!this.selection.length) {
			this._selection.push(range);
			this.selectionChangeEmitter.emit({ range, isSingleSwap: true });
			return;
		}

		const changed = range.subtract(this._selection[0]);
		this._selection[0] = range;
		for (const range of changed) {
			this.selectionChangeEmitter.emit({ range, isSingleSwap: true });
		}
	}

	/**
	 * Updates the selected range.
	 */
	public addSelectionRange(range: Range): void {
		this._selection.unshift(range);
		this.selectionChangeEmitter.emit({ range, isSingleSwap: true });
	}
}

export const DataDisplayContext = createContext<DisplayContext | undefined>(undefined);

export const useDisplayContext = (): DisplayContext => {
	const ctx = useContext(DataDisplayContext);
	if (!ctx) {
		throw new Error("Component must be wrapped in <DataDisplayContext />");
	}

	return ctx;
};

/** Hook that returns whether the given byte is selected */
export const useIsSelected = (byte: number): boolean => {
	const ctx = useDisplayContext();
	const [selected, setSelected] = useState(ctx.isSelected(byte));

	useEffect(() => {
		setSelected(ctx.isSelected(byte));

		const disposable = ctx.onDidChangeSelection(byte, isSingleSwap => {
			if (isSingleSwap) {
				setSelected(s => !s);
			} else {
				setSelected(ctx.isSelected(byte));
			}
		});
		return () => disposable.dispose();
	}, [byte]);

	return selected;
};

/** Hook that returns whether the given byte is hovered */
export const useIsHovered = (element: FocusedElement): boolean => {
	const ctx = useDisplayContext();
	const [hovered, setIsHovered] = useState(false);

	useEffect(() => {
		setIsHovered(ctx.hoveredByte?.key === element.key);
		const disposable = ctx.onDidChangeHovered(element, setIsHovered);
		return () => disposable.dispose();
	}, [element.key]);

	return hovered;
};

/** Hook that returns whether the given byte is hovered */
export const useIsFocused = (element: FocusedElement): boolean => {
	const ctx = useDisplayContext();

	const [focused, setIsFocused] = useState(false);

	useEffect(() => {
		setIsFocused(ctx.focusedElement?.key === element.key);
		const disposable = ctx.onDidChangeFocus(element, setIsFocused);
		return () => disposable.dispose();
	}, [element.key]);

	return focused;
};
