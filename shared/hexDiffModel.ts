import * as vscode from "vscode";
import { HexEditorDecorationMap, HexEditorDecorationType } from "./decorators";
import { HexDocumentModel } from "./hexDocumentModel";
import { Range } from "./util/range";
import { HexDocument } from "../src/hexDocument";

export type HexDiffModelBuilder = typeof HexDiffModel.Builder.prototype;

export class HexDiffModel {
	constructor(
		private readonly originalModel: HexDocumentModel,
		private readonly modifiedModel: HexDocumentModel,
	) {}

	// Provisional algorithm to test and finalize the decorators.
	public async readDecorators(doc: HexDocument): Promise<HexEditorDecorationMap> {
		const originalDecoraMap = new HexEditorDecorationMap();
		const modifiedDecorMap = new HexEditorDecorationMap();

		const oChunks = this.originalModel.readWithUnsavedEdits();
		const mChunks = this.modifiedModel.readWithUnsavedEdits();
		const oSize = await this.originalModel.size();
		const mSize = await this.modifiedModel.size();
		if (oSize === undefined || mSize === undefined) {
			console.error("Files have infinite size");
			return new HexEditorDecorationMap();
		}
		const { highestSize, highestChunks } =
			oSize > mSize
				? { highestSize: oSize, highestChunks: oChunks }
				: { highestSize: mSize, highestChunks: mChunks };

		const lowestChunks = highestChunks === oChunks ? mChunks : oChunks;
		let offset = 0;
		let range: null | Range = null;
		for await (const hChunk of highestChunks) {
			const lChunk = await lowestChunks.next();
			let i = 0;
			for (; i < lChunk.value.length; i++) {
				if (hChunk[i] !== lChunk.value[i]) {
					if (range) {
						range = range.expandToContain(offset + i);
					} else {
						range = new Range(offset + i, offset + i + 1);
					}
				} else {
					if (range) {
						originalDecoraMap.add(HexEditorDecorationType.DiffRemoved, [range]);
						modifiedDecorMap.add(HexEditorDecorationType.DiffAdded, [range]);
						range = null;
					}
				}
			}
			if (i < hChunk.length) {
				if (range) {
					originalDecoraMap.add(HexEditorDecorationType.DiffRemoved, [range]);
					modifiedDecorMap.add(HexEditorDecorationType.DiffAdded, [range]);
				}
				const tmpRange = new Range(offset + i + 1, highestSize);
				originalDecoraMap.add(HexEditorDecorationType.DiffRemoved, [tmpRange]);
				modifiedDecorMap.add(HexEditorDecorationType.DiffAdded, [tmpRange]);
			}
			offset += hChunk.length;
		}
		return doc.uri.toString() === this.originalModel.uri.toString() ? originalDecoraMap : modifiedDecorMap;
	}

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
			const [originalModel, modifiedModel] = await Promise.all([
				this.originalModel,
				this.modifiedModel,
			]);
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
