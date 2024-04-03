// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Disposable, DisposableValue } from "./dispose";
import { HexDocument, ISelectionState } from "./hexDocument";
import { HexEditorRegistry } from "./hexEditorRegistry";

const numberFormat = new Intl.NumberFormat();

/**
 * Displays the focused byte in a StatusBarItem
 *
 * @class StatusFocus
 */
export default class StatusFocus extends Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly docChangeListener = this._register(new DisposableValue());

	constructor(registry: HexEditorRegistry) {
		super();

		this.item = this._register(
			vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100),
		);

		const trackDocument = (doc: HexDocument | undefined) => {
			if (doc) {
				this.docChangeListener.value = doc.onDidChangeSelectionState(e => this.update(e));
				this.update(doc.selectionState);
				this.show();
			} else {
				this.hide();
			}
		};

		this._register(registry.onDidChangeActiveDocument(trackDocument));
		trackDocument(registry.activeDocument);
	}

	update({ focused }: ISelectionState): void {
		const nFocus = focused !== undefined ? numberFormat.format(focused) : undefined;
		if (nFocus) {
			this.item.text = vscode.l10n.t("{0}/0x{1}", nFocus, focused!.toString(16).toUpperCase());
			this.item.show();
		} else {
			this.item.hide();
			return;
		}
	}

	show() {
		this.item.show();
	}

	hide() {
		this.item.hide();
	}
}
