// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { HexDocumentEditOp } from "../shared/hexDocumentModel";
import { Disposable, DisposableValue } from "./dispose";
import { HexDocument } from "./hexDocument";
import { HexEditorRegistry } from "./hexEditorRegistry";

const numberFormat = new Intl.NumberFormat();

/**
 * this is a class to represent the status bar item that displays the edit mode
 *  - Replace or Insert
 *
 * @class StatusSelectionCount
 */
export default class StatusEditMode extends Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly docChangeListener = this._register(new DisposableValue());

	constructor(registry: HexEditorRegistry) {
		super();

		this.item = this._register(
			vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99),
		);
		this.item.tooltip = vscode.l10n.t("Select Edit Mode");
		this.item.command = "hexEditor.selectEditMode";

		const trackDocument = (doc: HexDocument | undefined) => {
			if (doc) {
				this.docChangeListener.value = doc.onDidChangeEditMode(e => this.update(e));
				this.update(doc.editMode);
				this.show();
			} else {
				this.hide();
			}
		};

		this._register(registry.onDidChangeActiveDocument(trackDocument));
		trackDocument(registry.activeDocument);
	}

	update(mode: HexDocumentEditOp.Insert | HexDocumentEditOp.Replace): void {
		if (mode === HexDocumentEditOp.Insert) {
			this.item.text = vscode.l10n.t("Insert");
		} else if (mode === HexDocumentEditOp.Replace) {
			this.item.text = vscode.l10n.t("Replace");
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
