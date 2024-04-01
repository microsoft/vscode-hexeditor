// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Disposable, DisposableValue } from "./dispose";
import { HexDocument } from "./hexDocument";
import { HexEditorRegistry } from "./hexEditorRegistry";

const numberFormat = new Intl.NumberFormat();

/**
 * Displays the hovered byte and the selection count in a StatusBarItem
 *
 * @class StatusHoverAndSelection
 */
export default class StatusHoverAndSelection extends Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly docChangeListener = this._register(new DisposableValue());

	constructor(registry: HexEditorRegistry) {
		super();

		this.item = this._register(
			// Primary Badge, so appears first
			vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101),
		);

		const trackDocument = (doc: HexDocument | undefined) => {
			if (doc) {
				this._register(doc.onDidChangeHoverState(() => this.update(doc)));
				this._register(doc.onDidChangeSelectionState(() => this.update(doc)));
				this.update(doc);
				this.show();
			} else {
				this.hide();
			}
		};

		this._register(registry.onDidChangeActiveDocument(trackDocument));
		trackDocument(registry.activeDocument);
	}

	update({ hoverState, selectionState }: HexDocument): void {
		const { selected } = selectionState;
		const nHovered = hoverState !== undefined ? numberFormat.format(hoverState) : undefined;
		const nSelected = selected > 1 ? numberFormat.format(selected) : undefined;
		if (nHovered && nSelected) {
			this.item.text = vscode.l10n.t(
				"{0}/0x{1} ({2}/0x{3} selected)",
				nHovered,
				hoverState!.toString(16).toUpperCase(),
				nSelected,
				selected!.toString(16).toUpperCase(),
			);
		} else if (nHovered) {
			this.item.text = vscode.l10n.t("{0}/0x{1}", nHovered, hoverState!.toString(16).toUpperCase());
		} else if (nSelected) {
			this.item.text = vscode.l10n.t(
				"{0}/0x{1} selected",
				nSelected,
				selected!.toString(16).toUpperCase(),
			);
		} else {
			// Hiding the element creates a flashing effect so instead set it
			// to an empty string
			this.item.text = vscode.l10n.t("");
		}

		this.item.show();
	}

	show() {
		this.item.show();
	}

	hide() {
		this.item.hide();
	}
}
