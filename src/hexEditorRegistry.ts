// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { ExtensionHostMessageHandler } from "../shared/protocol";
import { Disposable } from "./dispose";
import { HexDocument } from "./hexDocument";

const EMPTY: never[] = [];

export class HexEditorRegistry extends Disposable {
	private readonly docs = new Map<HexDocument, Set<ExtensionHostMessageHandler>>();
	private onChangeEmitter = new vscode.EventEmitter<HexDocument | undefined>();
	private _activeDocument?: HexDocument;

	/**
	 * Event emitter that fires when the focused hex editor changes.
	 */
	public readonly onDidChangeActiveDocument = this.onChangeEmitter.event;

	/**
	 * The currently active hex editor.
	 */
	public get activeDocument() {
		return this._activeDocument;
	}

	/**
	 * Messaging for the active hex editor.
	 */
	public get activeMessaging(): Iterable<ExtensionHostMessageHandler> {
		return (this._activeDocument && this.docs.get(this._activeDocument)) || EMPTY;
	}

	constructor() {
		super();
		this._register(vscode.window.tabGroups.onDidChangeTabs(this.onChangedTabs, this));
		this._register(vscode.window.tabGroups.onDidChangeTabGroups(this.onChangedTabs, this));
		this.onChangedTabs();
	}

	/** Gets messaging info for a document */
	public getMessaging(document: HexDocument): Iterable<ExtensionHostMessageHandler> {
		return this.docs.get(document) || EMPTY;
	}

	/** Registers an opened hex document. */
	public add(document: HexDocument, messaging: ExtensionHostMessageHandler) {
		let collection = this.docs.get(document);
		if (collection) {
			collection.add(messaging);
		} else {
			collection = new Set([messaging]);
			this.docs.set(document, collection);
		}

		// re-evaluate, since if a hex editor was just opened it won't have created
		// a HexDocument by the time the tab change event is delivered.
		this.onChangedTabs();

		return {
			dispose: () => {
				collection!.delete(messaging);
				if (collection!.size === 0) {
					this.docs.delete(document);
				}
			},
		};
	}

	private onChangedTabs() {
		const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
		const uri = input instanceof vscode.TabInputCustom ? input.uri : undefined;
		let next: HexDocument | undefined = undefined;
		if (uri) {
			for (const doc of this.docs.keys()) {
				if (doc.uri.toString() === uri.toString()) {
					next = doc;
					break;
				}
			}
		}

		if (next === this._activeDocument) {
			return;
		}

		this._activeDocument = next;
		vscode.commands.executeCommand("setContext", "hexEditor:isActive", !!next);
		this.onChangeEmitter.fire(next);
	}
}
