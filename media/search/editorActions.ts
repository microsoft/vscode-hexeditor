// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { MessageHandler } from "../common/messageHandler";

enum EditorMessageTypes {
  CLEAR = "clear",
  FIND_NEXT = "findNext",
  FIND_PREV = "findPrev",
}

/**
 * @description Notifies the editor that the current selection should be cleared
 * @param messageHandler The message handler to send the message to the editor
 */
export function clearEditorSelection(messageHandler: MessageHandler): void {
  messageHandler.postMessage("editor", { method: EditorMessageTypes.CLEAR });
}

/**
 * @description Notifies the editor that the next search result should be selected
 * @param messageHandler The message handler to send the message to the editor
 * @param focus Whether or not we want to focus the selection
 * @returns The index of the currently selected result
 */
export async function editorFindNext(messageHandler: MessageHandler, focus: boolean): Promise<number> {
  return await messageHandler.postMessageWithResponse("editor", { method: EditorMessageTypes.FIND_NEXT, focus });
}

/**
 * @description Notifies the editor that the previous search result should be selected
 * @param messageHandler The message handler to send the message to the editor
 * @param focus Whether or not we want to focus the selection 
 * @returns The index of the currently selected result
 */
export async function editorFindPrev(messageHandler: MessageHandler, focus: boolean): Promise<number> {
  return await messageHandler.postMessageWithResponse("editor", { method: EditorMessageTypes.FIND_PREV, focus });
}