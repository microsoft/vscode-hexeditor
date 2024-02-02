// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";

export function disposeAll(disposables: vscode.Disposable[]): void {
	while (disposables.length) {
		const item = disposables.pop();
		if (item) {
			item.dispose();
		}
	}
}

export abstract class Disposable {
	private _isDisposed = false;

	protected _disposables: vscode.Disposable[] = [];

	public dispose(): any {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		disposeAll(this._disposables);
	}

	protected _register<T extends vscode.Disposable>(value: T): T {
		if (this._isDisposed) {
			value.dispose();
		} else {
			this._disposables.push(value);
		}
		return value;
	}

	protected get isDisposed(): boolean {
		return this._isDisposed;
	}
}

export interface IDisposable {
	dispose(): void;
}

export class DisposableValue<T extends IDisposable> {
	private _value: T | undefined;

	constructor(value?: T) {
		this._value = value;
	}

	public get value(): T | undefined {
		return this._value;
	}

	public set value(value: T | undefined) {
		if (this._value === value) {
			return;
		}
		this._value?.dispose();
		this._value = value;
	}

	public dispose(): void {
		this.value?.dispose();
	}
}
