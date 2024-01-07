import * as vscode from "vscode";
import { ExtensionHostMessageHandler, MessageType } from "../shared/protocol";

const addressRe = /^0x[a-f0-9]+$/i;
const decimalRe = /^[0-9]+$/i;

export const showSelectUntilOffset = (messaging: ExtensionHostMessageHandler): void => {
    const startingInput = vscode.window.createInputBox();
    const endingInput = vscode.window.createInputBox();
    startingInput.placeholder = "Enter offset to select from";
    endingInput.placeholder = "Enter offset to select until";

    messaging.sendEvent({ type: MessageType.StashDisplayedOffset });

    let fromOffset: number | undefined;
    let toOffset: number | undefined;
    let accepted = false;

    startingInput.onDidChangeValue(value => {
        if (!value) {
            fromOffset = undefined;
        } else if (addressRe.test(value)) {
            fromOffset = parseInt(value.slice(2), 16);
        } else if (decimalRe.test(value)) {
            fromOffset = parseInt(value, 10);
        } else {
            startingInput.validationMessage = "Offset must be provided as a decimal (12345) or hex (0x12345) address";
            return;
        }

        startingInput.validationMessage = "";
        if (fromOffset !== undefined) {
            startingInput.validationMessage = "";
            messaging.sendEvent({ type: MessageType.GoToOffset, offset: fromOffset });
        }
    });

    startingInput.onDidAccept(() => {
        if (fromOffset !== undefined) {
            endingInput.show();
        }
    });

    startingInput.onDidHide(() => {
        if (!accepted) {
            messaging.sendEvent({ type: MessageType.PopDisplayedOffset });
        }
    });

    endingInput.onDidChangeValue(value => {
        if (!value) {
            toOffset = undefined;
        } else if (addressRe.test(value)) {
            toOffset = parseInt(value.slice(2), 16);
        } else if (decimalRe.test(value)) {
            toOffset = parseInt(value, 10);
        } else {
            startingInput.validationMessage = "Offset must be provided as a decimal (12345) or hex (0x12345) address";
            return;
        }

        startingInput.validationMessage = "";
        if (toOffset !== undefined) {
            startingInput.validationMessage = "";
            messaging.sendEvent({ type: MessageType.GoToOffset, offset: toOffset });
        }
    });

    endingInput.onDidAccept(() => {
        accepted = true;
        if (fromOffset !== undefined && toOffset !== undefined) {
            messaging.sendEvent({ type: MessageType.SetFocusedByteRange, startingOffset: fromOffset, endingOffset: toOffset });
        }
    });

    endingInput.onDidHide(() => {
        if (!accepted) {
            messaging.sendEvent({ type: MessageType.PopDisplayedOffset });
        }
    });

    startingInput.show();
};
