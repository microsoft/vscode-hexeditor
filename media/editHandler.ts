// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.


interface DocumentEdits {
    offset: number;
    previousValue: string;
    newValue: string;
}
export class EditHandler {
    private redoStack: DocumentEdits[];
    private currentEdits: DocumentEdits[];
    constructor() {
        this.redoStack = [];
        this.currentEdits = [];
    }
}