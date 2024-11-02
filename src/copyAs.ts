import * as base64 from "js-base64";
import * as vscode from "vscode";
import { CopyFormat, ExtensionHostMessageHandler, MessageType } from "../shared/protocol";

interface QuickPickCopyFormat extends vscode.QuickPickItem {
	label: CopyFormat;
}

export const copyAsFormats: { [K in CopyFormat]: (buffer: Uint8Array, filename: string) => void } =
	{
		[CopyFormat.HexOctets]: copyAsHexOctets,
		[CopyFormat.Hex]: copyAsHex,
		[CopyFormat.Literal]: copyAsLiteral,
		[CopyFormat.Utf8]: copyAsText,
		[CopyFormat.C]: copyAsC,
		[CopyFormat.Go]: copyAsGo,
		[CopyFormat.Java]: copyAsJava,
		[CopyFormat.JSON]: copyAsJSON,
		[CopyFormat.Base64]: copyAsBase64,
	};

export const copyAs = async (messaging: ExtensionHostMessageHandler): Promise<void> => {
	const formats: QuickPickCopyFormat[] = [
		{ label: CopyFormat.HexOctets },
		{ label: CopyFormat.Hex },
		{ label: CopyFormat.Literal },
		{ label: CopyFormat.Utf8 },
		{ label: CopyFormat.C },
		{ label: CopyFormat.Go },
		{ label: CopyFormat.Java },
		{ label: CopyFormat.JSON },
		{ label: CopyFormat.Base64 },
		{ label: "Configure HexEditor: Copy Type" as CopyFormat }
	];

	vscode.window.showQuickPick(formats).then(format => {
		if (format?.label == formats.at(-1)?.label) {
			vscode.commands.executeCommand('workbench.action.openSettings2', { query: '@id:hexeditor.copyType' });
		}
		else if (format) {
			messaging.sendEvent({ type: MessageType.TriggerCopyAs, format: format["label"] });
		}
	});
};

export function copyAsText(buffer: Uint8Array) {
	vscode.env.clipboard.writeText(new TextDecoder().decode(buffer));
}

export function copyAsHexOctets(buffer: Uint8Array) {
	const hexString = Array.from(buffer, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")
	vscode.env.clipboard.writeText(hexString)
}

export function copyAsHex(buffer: Uint8Array) {
	const hexString = Array.from(buffer, b => b.toString(16).padStart(2, "0")).join("");
	vscode.env.clipboard.writeText(hexString);
}

export function copyAsLiteral(buffer: Uint8Array) {
	let encoded: string = "";
	const hexString = Array.from(buffer, b => b.toString(16).padStart(2, "0")).join("");
	const digits = hexString.match(/.{1,2}/g);
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

	if (typeof process !== "undefined" && process.platform === "win32") {
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

	if (typeof process !== "undefined" && process.platform === "win32") {
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

	if (typeof process !== "undefined" && process.platform === "win32") {
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
