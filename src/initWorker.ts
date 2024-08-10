import * as vscode from "vscode";
import {
	DiffExtensionHostMessageHandler,
	FromDiffWorkerMessage,
	ToDiffWorkerMessage,
} from "../shared/diffWorkerProtocol";
import { MessageHandler } from "../shared/protocol";

/** Prepares diff worker to be lazily initialized and instantiated once*/
export function prepareLazyInitDiffWorker(
	extensionUri: vscode.Uri,
	addDispose: (dispose: vscode.Disposable) => void,
) {
	let messageHandler: DiffExtensionHostMessageHandler;
	return () => {
		if (!messageHandler) {
			const { msgHandler, dispose } = initDiffWorker(extensionUri);
			messageHandler = msgHandler;
			addDispose({ dispose: dispose });
		}
		return messageHandler;
	};
}

/**	Initializes the diff worker */
function initDiffWorker(extensionUri: vscode.Uri): {
	msgHandler: DiffExtensionHostMessageHandler;
	dispose: () => void;
} {
	let worker: Worker;
	const workerFilePath = vscode.Uri.joinPath(extensionUri, "dist", "diffWorker.js").toString();

	try {
		worker = new Worker(workerFilePath);
	} catch {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { Worker } = require("worker_threads") as typeof import("worker_threads");
		const nodeWorker = new Worker(new URL(workerFilePath));
		// Web and node js have different worker interfaces, so we share a function
		// to initialize both workers the same way.
		const ref = nodeWorker.addListener;
		(nodeWorker as any).addEventListener = ref;
		worker = nodeWorker as any;
	}

	const workerMessageHandler = new MessageHandler<ToDiffWorkerMessage, FromDiffWorkerMessage>(
		// Always return undefined as the diff worker
		// does not request anything from extension host
		async () => undefined,
		// worker.postMessage's transfer parameter type looks to be wrong because
		// it should be set as optional.
		(message, transfer) => worker.postMessage(message, transfer!),
	);

	worker.addEventListener("message", e =>
		// e.data is used in web worker and e is used in node js worker
		e.data
			? workerMessageHandler.handleMessage(e.data)
			: workerMessageHandler.handleMessage(e as any),
	);
	return { msgHandler: workerMessageHandler, dispose: () => worker.terminate() };
}
