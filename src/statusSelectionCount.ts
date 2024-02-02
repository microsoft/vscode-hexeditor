// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Disposable, DisposableValue } from "./dispose";
import { HexDocument, ISelectionState } from "./hexDocument";
import { HexEditorRegistry } from "./hexEditorRegistry";

const numberFormat = new Intl.NumberFormat();

/**
 * this is a class to represent the status bar item that displays the number of selected bytes
 *
 * @class StatusSelectionCount
 */
export default class StatusSelectionCount extends Disposable {
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

	update({ focused, selected }: ISelectionState): void {
		if (focused === undefined && selected === 0) {
			return;
		}

		const nFocus = focused !== undefined ? numberFormat.format(focused) : undefined;
		const nSelected = selected > 1 ? numberFormat.format(selected) : undefined;
		if (nFocus && nSelected) {
			this.item.text = vscode.l10n.t("Byte {0} ({1} selected)", nFocus, nSelected);
		} else if (nSelected) {
			this.item.text = vscode.l10n.t("{0} selected", nSelected);
		} else if (nFocus) {
			this.item.text = vscode.l10n.t("Byte {0}", nFocus);
		} else {
			this.item.hide();
			return;
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
