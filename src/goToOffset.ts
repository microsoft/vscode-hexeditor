import * as vscode from "vscode";
import { ExtensionHostMessageHandler, MessageType } from "../shared/protocol";

const addressRe = /^0x[a-f0-9]+$/i;
const decimalRe = /^[0-9]+$/i;

export const showGoToOffset = (messaging: ExtensionHostMessageHandler): void => {
	const input = vscode.window.createInputBox();
	input.placeholder = "Enter offset to go to";

	messaging.sendEvent({ type: MessageType.StashDisplayedOffset });

	let lastValue: number | undefined;
	let accepted = false;

	input.onDidChangeValue(value => {
		if (!value) {
			lastValue = undefined;
		} else if (addressRe.test(value)) {
			lastValue = parseInt(value.slice(2), 16);
		} else if (decimalRe.test(value)) {
			lastValue = parseInt(value, 10);
		} else {
			input.validationMessage = "Offset must be provided as a decimal (12345) or hex (0x12345) address";
			return;
		}

		input.validationMessage = "";
		if (lastValue !== undefined) {
			input.validationMessage = "";
			messaging.sendEvent({ type: MessageType.GoToOffset, offset: lastValue });
		}
	});

	input.onDidAccept(() => {
		accepted = true;
		if (lastValue !== undefined) {
			messaging.sendEvent({ type: MessageType.SetFocusedByte, offset: lastValue });
		}
	});

	input.onDidHide(() => {
		if (!accepted) {
			messaging.sendEvent({ type: MessageType.PopDisplayedOffset });
		}
	});

	input.show();
};
