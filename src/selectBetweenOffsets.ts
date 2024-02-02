import * as vscode from "vscode";
import { ExtensionHostMessageHandler, MessageType } from "../shared/protocol";
import { ISelectionState } from "./hexDocument";
import { HexEditorRegistry } from "./hexEditorRegistry";

const addressRe = /^0x[a-f0-9]+$/i;
const decimalRe = /^[0-9]+$/i;

export const showSelectBetweenOffsets = async (
	messaging: ExtensionHostMessageHandler,
	registry: HexEditorRegistry,
): Promise<void> => {
	messaging.sendEvent({ type: MessageType.StashDisplayedOffset });

	let focusedOffset: string | undefined = undefined;

	// acquire selection state from active HexDocument
	const selectionState: ISelectionState | undefined = registry.activeDocument?.selectionState;

	// if there is a selection, use the focused offset as the starting offset
	if (
		selectionState !== undefined &&
		selectionState.selected > 0 &&
		selectionState.focused !== undefined
	) {
		// converting to hex to increase readability
		focusedOffset = `0x${selectionState.focused.toString(16)}`;
	}

	const offset1 = await getOffset(vscode.l10n.t("Enter offset to select from"), focusedOffset);
	if (offset1 !== undefined) {
		const offset2 = await getOffset(vscode.l10n.t("Enter offset to select until"));
		if (offset2 !== undefined) {
			messaging.sendEvent({
				type: MessageType.SetFocusedByteRange,
				startingOffset: offset1,
				endingOffset: offset2,
			});
		}
	}

	async function getOffset(inputBoxTitle: string, value?: string): Promise<number | undefined> {
		const disposables: vscode.Disposable[] = [];
		try {
			return await new Promise<number | undefined>((resolve, _reject) => {
				const input = vscode.window.createInputBox();
				input.title = inputBoxTitle;
				input.value = value || "";
				input.prompt = inputBoxTitle;
				input.ignoreFocusOut = true;
				input.placeholder = inputBoxTitle;
				disposables.push(
					input.onDidAccept(() => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						const offset = validate(value);
						if (offset !== undefined) {
							resolve(offset);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(text => {
						const offset = validate(text);

						if (offset === undefined) {
							input.validationMessage =
								"Offset must be provided as a decimal (12345) or hex (0x12345) address";
						} else {
							input.validationMessage = "";
							messaging.sendEvent({ type: MessageType.GoToOffset, offset: offset });
						}
					}),
					input.onDidHide(() => {
						messaging.sendEvent({ type: MessageType.PopDisplayedOffset });
						resolve(undefined);
					}),
					input,
				);
				input.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}

		function validate(text: string): number | undefined {
			let validatedOffset: number | undefined = undefined;
			if (!text) {
				validatedOffset = undefined;
			} else if (addressRe.test(text)) {
				validatedOffset = parseInt(text.slice(2), 16);
			} else if (decimalRe.test(text)) {
				validatedOffset = parseInt(text, 10);
			}

			return validatedOffset;
		}
	}
};
