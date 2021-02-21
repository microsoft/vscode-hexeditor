// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as vscode from "vscode";

/**
 * An adaptor to abstract away the extra logic required to make untitled URIs work
 * This adaptor can accept either file URIs or untitled URIs
 */
export abstract class FileSystemAdaptor {

  /**
   * @description Calculates the size of the document associated with the uri passed in
   * @param uri The uri
   * @returns The file size
   */
  public static async getFileSize(uri: vscode.Uri): Promise<number> {
    if (uri.scheme === "untitled") {
      const document = FileSystemAdaptor.findMatchingTextDocument(uri);
      return document ? document.getText().length : 0;
    } else {
      return (await vscode.workspace.fs.stat(uri)).size;
    }
  }

  public static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (uri.scheme === "untitled") {
      const document = FileSystemAdaptor.findMatchingTextDocument(uri);
      // Conver the document text to bytes and return it
      return document ? new TextEncoder().encode(document.getText()) : new Uint8Array();
    } else {
      return vscode.workspace.fs.readFile(uri);
    }
  }

  /**
   * @description Given a uri finds a text document associated with that URI, returns undefined if none is found
   * @param uri The uri of the text document
   */
  private static findMatchingTextDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
    const textDocuments = vscode.workspace.textDocuments;
    for (const document of textDocuments) {
      if (uri.scheme === document.uri.scheme && uri.path === document.uri.path) return document;
    }
    return;
  }
}