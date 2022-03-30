
import * as vscode from "vscode";


/**
 * this is a class to represent the status bar item that displays the number of selected bytes
 *
 * @class StatusSelectionCount
 */
export default class StatusSelectionCount {
	item: vscode.StatusBarItem;


	constructor() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

	}

	update(count: number): void {
		if (count > 0) {
			this.item.text = `${count} byte(s) selected`;
			this.item.show();
		} else {
			this.item.hide();
		}
	}

	show() {
		this.item.show();
	}

	hide() {
		this.item.hide();
	}

}