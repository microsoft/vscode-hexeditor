import * as vscode from "vscode";
import { HexDocumentModel } from "./hexDocumentModel";

export type HexDiffModelBuilder = typeof HexDiffModel.Builder.prototype;

export class HexDiffModel {
	constructor(
		private readonly originalModel: HexDocumentModel,
		private readonly modifiedModel: HexDocumentModel,
	) {}

	public async readDecorators() {}
	/**
	 * Class to coordinate the creation of HexDiffModel
	 * as both documents have to be created first by VSCode
	 * due to {vscode.CustomDocumentOpenContext}
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
		private key?: string;
		private builtModel?: HexDiffModel;
		public onBuild?: () => void;

		constructor(
			public readonly originalUri: vscode.Uri,
			public readonly modifiedUri: vscode.Uri,
		) {
			this.originalModel = new Promise<HexDocumentModel>(resolve => {
				this.resolveOriginalModel = resolve;
			});
			this.modifiedModel = new Promise<HexDocumentModel>(resolve => {
				this.resolveModifiedModel = resolve;
			});
		}

		public setKey(key: string) {
			this.key = key;
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
			const [originalModel, modifiedModel] = await Promise.all([this.originalModel, this.modifiedModel]);
			if (this.onBuild) {
				this.onBuild();
			}
			if (this.builtModel === undefined) {
				this.builtModel = new HexDiffModel(originalModel, modifiedModel);
			}
			return this.builtModel;
		}
	};
}
