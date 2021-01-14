// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ByteData } from "../common/byteData";
import { messageHandler } from "./hexEdit";

// Class responsible for notifying the data inspector view of the necessary editor information
export abstract class DataInspectorHandler {

  /**
   * @description Sends a message to the ext host -> data inspector view to notify the inspector to clear
   */
  public static clearInspector(): void {
    messageHandler.postMessage("dataInspector", {
      method: "clear"
    });
  }

  /**
   * @description Sends the selected bytes to the inspector view to update it
   * @param byte_obj The bytedata object representing the selected bytes
   */
  public static updateInspector(byte_obj: ByteData): void {
    messageHandler.postMessage("dataInspector", {
      method: "update",
      byteData: byte_obj, 
    });
  }
}