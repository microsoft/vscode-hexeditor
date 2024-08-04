import { HexDecorator } from "./decorators";
import { MessageHandler } from "./protocol";

export type DiffExtensionHostMessageHandler = MessageHandler<
	ToDiffWorkerMessage,
	FromDiffWorkerMessage
>;
export type DiffWorkerMessageHandler = MessageHandler<FromDiffWorkerMessage, ToDiffWorkerMessage>;

export type ToDiffWorkerMessage = DiffDecoratorsRequestMessage;
export type FromDiffWorkerMessage = DiffDecoratorResponseMessage;
export enum DiffMessageType {
	// #region to diffworker
	DiffDecoratorRequest,
	// #endregion
	// #region from diff worker
	DiffDecoratorResponse,
	// #endregion
}

export interface DiffDecoratorsRequestMessage {
	type: DiffMessageType.DiffDecoratorRequest;
	original: Uint8Array;
	modified: Uint8Array;
}

export interface DiffDecoratorResponseMessage {
	type: DiffMessageType.DiffDecoratorResponse;
	original: HexDecorator[];
	modified: HexDecorator[];
}
