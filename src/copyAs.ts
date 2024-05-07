import * as base64 from "js-base64";
import * as vscode from "vscode";
import { CopyFormat, ExtensionHostMessageHandler, MessageType } from "../shared/protocol";

interface QuickPickCopyFormat extends vscode.QuickPickItem {
	label: CopyFormat;
}

export const copyAs = async (messaging: ExtensionHostMessageHandler): Promise<void> => {
	const formats: QuickPickCopyFormat[] = [
		{ label: CopyFormat.Hex },
		{ label: CopyFormat.Literal },
		{ label: CopyFormat.Utf8 },
		{ label: CopyFormat.C },
		{ label: CopyFormat.Go },
		{ label: CopyFormat.Java },
		{ label: CopyFormat.JSON },
		{ label: CopyFormat.Base64 },
	];

	vscode.window.showQuickPick(formats).then(format => {
		if (format) {
			messaging.sendEvent({ type: MessageType.TriggerCopyAs, format: format["label"] });
		}
	});
};

export function copyAsText(buffer: Uint8Array) {
	vscode.env.clipboard.writeText(new TextDecoder().decode(buffer));
}

export function copyAsHex(buffer: Uint8Array) {
	vscode.env.clipboard.writeText(Buffer.from(buffer).toString("hex"));
}

export function copyAsLiteral(buffer: Uint8Array) {
	let encoded: string = "";
	const digits = Buffer.from(buffer)
		.toString("hex")
		.match(/.{1,2}/g);
	if (digits) {
		encoded = "\\x" + digits.join("\\x");
	}

	vscode.env.clipboard.writeText(encoded);
}

export function copyAsC(buffer: Uint8Array, filename: string) {
	const len = buffer.length;
	let content: string = `unsigned char ${filename}[${len}] =\n{`;

	for (let i = 0; i < len; ++i) {
		if (i % 8 == 0) {
			content += "\n\t";
		}
		const byte = buffer[i].toString(16).padStart(2, "0");
		content += `0x${byte}, `;
	}

	content += "\n};\n";

	if (process.platform === "win32") {
		content = content.replace(/\n/g, "\r\n");
	}

	vscode.env.clipboard.writeText(content);
}

export function copyAsGo(buffer: Uint8Array, filename: string) {
	const len = buffer.length;
	let content: string = `// ${filename} (${len} bytes)\n`;
	content += `var ${filename} = []byte{`;

	for (let i = 0; i < len; ++i) {
		if (i % 8 == 0) {
			content += "\n\t";
		}
		const byte = buffer[i].toString(16).padStart(2, "0");
		content += `0x${byte}, `;
	}

	content += "\n}\n";

	if (process.platform === "win32") {
		content = content.replace(/\n/g, "\r\n");
	}

	vscode.env.clipboard.writeText(content);
}

export function copyAsJava(buffer: Uint8Array, filename: string) {
	const len = buffer.length;
	let content: string = `byte ${filename}[] =\n{`;

	for (let i = 0; i < len; ++i) {
		if (i % 8 == 0) {
			content += "\n\t";
		}
		const byte = buffer[i].toString(16).padStart(2, "0");
		content += `0x${byte}, `;
	}

	content += "\n};\n";

	if (process.platform === "win32") {
		content = content.replace(/\n/g, "\r\n");
	}

	vscode.env.clipboard.writeText(content);
}

export function copyAsJSON(buffer: Uint8Array) {
	vscode.env.clipboard.writeText(JSON.stringify(buffer));
}

export function copyAsBase64(buffer: Uint8Array) {
	vscode.env.clipboard.writeText(base64.fromUint8Array(buffer));
}
