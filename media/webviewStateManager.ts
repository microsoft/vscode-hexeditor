// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { vscode } from "./hexEdit";

/**
 * Simple static class which handles setting and clearing the webviews state
 * We use this over the default .setState as it implements a setState which doesn't override the entire object just the given property
 */
export class WebViewStateManager {

    /**
     * @description Given a property and a value either updates or adds it to the state
     * @param {string} propertyName The name of the property
     * @param {any} propertyValue The value to store for the property
     */
    static setProperty(propertyName: string, propertyValue: any): void {
        let currentState = WebViewStateManager.getState();
        if (currentState === undefined) {
            currentState = { };
        }
        currentState[propertyName] = propertyValue;
        vscode.setState(currentState);
    }

    /***
     * @description Clears the state object
     */
    static clearState(): void {
        vscode.setState();
    }

    /**
     * @description Retrieves the state object
     */
    static getState(): any {
        return typeof vscode.getState() === "string" ? JSON.parse(vscode.getState()) : vscode.getState();
    }

    /**
     * @description Retrieves a property on the state object
     * @param {string} propertyName The name of the property to retrieve the value of
     */
    static getProperty(propertyName: string): any {
        const state =  WebViewStateManager.getState();
        return state[propertyName];
    }
}