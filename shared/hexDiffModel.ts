import { bulkhead } from "cockatiel";
import * as vscode from "vscode";
import { HexDecorator } from "./decorators";
import {
	DiffDecoratorResponseMessage,
	DiffExtensionHostMessageHandler,
	DiffMessageType,
} from "./diffWorkerProtocol";
import { HexDocumentModel } from "./hexDocumentModel";
export type HexDiffModelBuilder = typeof HexDiffModel.Builder.prototype;

export class HexDiffModel {
	/** Guard to make sure only one computation operation happens */
	private readonly saveGuard = bulkhead(1, Infinity);
	private decorators?: { original: HexDecorator[]; modified: HexDecorator[] };

	constructor(
		private readonly originalModel: HexDocumentModel,
		private readonly modifiedModel: HexDocumentModel,
		private readonly messageHandler: DiffExtensionHostMessageHandler,
	) {}

	public async computeDecorators(uri: vscode.Uri): Promise<HexDecorator[]> {
		return this.saveGuard.execute(async () => {
			if (this.decorators === undefined) {
				//TODO: Add a warning if the file sizes are too large?
				const oSize = await this.originalModel.sizeWithEdits();
				const mSize = await this.modifiedModel.sizeWithEdits();
				if (oSize === undefined || mSize === undefined) {
					throw new Error(vscode.l10n.t("HexEditor Diff: Failed to get file sizes."));
				}

				const oArray = new Uint8Array(oSize);
				const mArray = new Uint8Array(mSize);
				await this.originalModel.readInto(0, oArray);
				await this.modifiedModel.readInto(0, mArray);
				const decorators = await this.messageHandler.sendRequest<DiffDecoratorResponseMessage>({
					type: DiffMessageType.DiffDecoratorRequest,
					original: oArray,
					modified: mArray,
				});
				this.decorators = decorators;
			}
			return uri.toString() === this.originalModel.uri.toString()
				? this.decorators.original
				: this.decorators.modified;
		});
	}

	/**
	 * Class to coordinate the creation of HexDiffModel
	 * with both HexDocumentModels
	 */
	static Builder = class {
		private originalModel: Promise<HexDocumentModel>;
		private modifiedModel: Promise<HexDocumentModel>;
		private resolveOriginalModel!: (
			value: HexDocumentModel | PromiseLike<HexDocumentModel>,
		) => void;
		private resolveModifiedModel!: (
			value: HexDocumentModel | PromiseLike<HexDocumentModel>,
		) => void;
		private builtModel?: HexDiffModel;
		public onBuild?: () => void;

		constructor(
			public readonly originalUri: vscode.Uri,
			public readonly modifiedUri: vscode.Uri,
			private readonly messageHandler: DiffExtensionHostMessageHandler,
		) {
			this.originalModel = new Promise<HexDocumentModel>(resolve => {
				this.resolveOriginalModel = resolve;
			});
			this.modifiedModel = new Promise<HexDocumentModel>(resolve => {
				this.resolveModifiedModel = resolve;
			});
		}

		public setModel(model: HexDocumentModel) {
			if (this.originalUri.toString() === model.uri.toString()) {
				this.resolveOriginalModel(model);
			} else if (this.modifiedUri.toString() === model.uri.toString()) {
				this.resolveModifiedModel(model);
			} else {
				throw new Error("Provided doc does not match uris.");
			}
			return this;
		}

		public async build() {
			const [originalModel, modifiedModel] = await Promise.all([
				this.originalModel,
				this.modifiedModel,
			]);
			if (this.builtModel === undefined) {
				this.builtModel = new HexDiffModel(originalModel, modifiedModel, this.messageHandler);
				if (this.onBuild) {
					this.onBuild();
				}
			}
			return this.builtModel;
		}
	};
}
