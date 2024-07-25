import { DiffMessageType, FromDiffWorkerMessage, ToDiffWorkerMessage } from "./diffWorkerProtocol";
import { MessageHandler } from "./protocol";
import { MyersDiff } from "./util/myers";

function onMessage(message: ToDiffWorkerMessage): undefined | FromDiffWorkerMessage {
	switch (message.type) {
		case DiffMessageType.DiffDecoratorRequest:
			const script = MyersDiff.lcs(message.original, message.modified);
			const decorators = MyersDiff.toDecorator(script);
			return {
				type: DiffMessageType.DiffDecoratorResponse,
				original: decorators.original,
				modified: decorators.modified,
			};
	}
}

try {
	// Web worker
	const messageHandler = new MessageHandler<FromDiffWorkerMessage, ToDiffWorkerMessage>(
		async message => onMessage(message),
		message => postMessage(message),
	);
	onmessage = e => messageHandler.handleMessage(e.data);
} catch {
	// node worker

	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { parentPort } = require("worker_threads") as typeof import("worker_threads");
	if (parentPort) {
		const messageHandler = new MessageHandler<FromDiffWorkerMessage, ToDiffWorkerMessage>(
			async message => onMessage(message),
			message => parentPort.postMessage(message),
		);
		parentPort.on("message", e => {
			messageHandler.handleMessage(e);
		});
	}
}
