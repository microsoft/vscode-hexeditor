// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Disposable, DisposableValue } from "./dispose";
import { HexDocument } from "./hexDocument";
import { HexEditorRegistry } from "./hexEditorRegistry";

const numberFormat = new Intl.NumberFormat();

/**
 * this is a class to represent the status bar item that displays the current hovered byte
 *
 * @class StatusHoverByte
 */
export default class StatusHoverByte extends Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly docChangeListener = this._register(new DisposableValue());

	constructor(registry: HexEditorRegistry) {
		super();

		this.item = this._register(
			// Will appear to the left of selection count bar item
			vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101),
		);

		const trackDocument = (doc: HexDocument | undefined) => {
			if (doc) {
				this.docChangeListener.value = doc.onDidChangeHoverByte(e => this.update(e));
				this.update(doc.hoverByte);
				this.show();
			} else {
				this.hide();
			}
		};

		this._register(registry.onDidChangeActiveDocument(trackDocument));
		trackDocument(registry.activeDocument);
	}

	update(hovered?: number): void {
		if (hovered === undefined) {
			this.item.text = vscode.l10n.t("Hover: 0/0x00");
		} else {
			this.item.text = vscode.l10n.t(
				"Hover: {0}/0x{1}",
				numberFormat.format(hovered),
				hovered!.toString(16).toUpperCase(),
			);
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
