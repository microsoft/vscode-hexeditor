import * as vscode from "vscode";
import { ExtensionHostMessageHandler, MessageType } from "../shared/protocol";
import { HexDocument, ISelectionState } from "./hexDocument";

const addressRe = /^0x[a-f0-9]+$/i;
const decimalRe = /^[0-9]+$/i;

export const showSelectBetweenOffsets = (messaging: ExtensionHostMessageHandler): void => {
    const startingInput = vscode.window.createInputBox();
    const endingInput = vscode.window.createInputBox();
    startingInput.placeholder = "Enter offset to select from";
    endingInput.placeholder = "Enter offset to select until";

    messaging.sendEvent({ type: MessageType.StashDisplayedOffset });

    let inputOffset: number | undefined;
    let fromOffset: number | undefined;
    let toOffset: number | undefined;
    let accepted = false;

    // acquire selection state from current HexDocument
    const selectionState: ISelectionState | undefined = HexDocument.currentHexDocument?.selectionState;

    // if there is a selection, use the focused offset as the starting offset
    if (selectionState !== undefined && selectionState.selected > 0 && selectionState.focused !== undefined) {
        inputOffset = selectionState.focused;
        // converting to hex to increase readability
        startingInput.value = `0x${inputOffset.toString(16)}`;
    }

    startingInput.onDidChangeValue(changeValueHelper);
    endingInput.onDidChangeValue(changeValueHelper);

    startingInput.onDidHide(hideHelper);
    endingInput.onDidHide(hideHelper);

    startingInput.onDidAccept(() => {
        if (inputOffset !== undefined) {
            fromOffset = inputOffset;
            endingInput.show();
        }
    });
    endingInput.onDidAccept(() => {
        if (inputOffset !== undefined) {
            toOffset = inputOffset;
        }

        if (fromOffset !== undefined && toOffset !== undefined) {
            accepted = true;
            messaging.sendEvent({ type: MessageType.SetFocusedByteRange, startingOffset: fromOffset, endingOffset: toOffset });
        }
    });

    startingInput.show();

    function hideHelper() {
        if (!accepted) {
            messaging.sendEvent({ type: MessageType.PopDisplayedOffset });
        }
    }

    function changeValueHelper(value: string) {
        if (!value) {
            inputOffset = undefined;
        } else if (addressRe.test(value)) {
            inputOffset = parseInt(value.slice(2), 16);
        } else if (decimalRe.test(value)) {
            inputOffset = parseInt(value, 10);
        } else {
            startingInput.validationMessage = "Offset must be provided as a decimal (12345) or hex (0x12345) address";
            return;
        }

        startingInput.validationMessage = "";
        if (inputOffset !== undefined) {
            startingInput.validationMessage = "";
            messaging.sendEvent({ type: MessageType.GoToOffset, offset: inputOffset });
        }
    }
};