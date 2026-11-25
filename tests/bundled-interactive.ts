import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Inspect the live CLI classes, including the command copies it hands to the editor.
const chunks = join(process.cwd(), "node_modules/@earendil-works/pi-coding-agent/dist/bundle/chunks");
const filename = readdirSync(chunks).find(name => name.endsWith(".js") && readFileSync(join(chunks, name), "utf8").includes("InteractiveMode=class"));
if (!filename) throw new Error("Pi interactive runtime chunk missing");
export const { InteractiveMode, LoginDialogComponent } = await import(pathToFileURL(join(chunks, filename)).href);

export function commandDescription(name: string): string {
	const provider = InteractiveMode.prototype.createBaseAutocompleteProvider.call({
		session: { promptTemplates: [], extensionRunner: { getRegisteredCommands: () => [] } },
		settingsManager: { getEnableSkillCommands: () => false },
		skillCommands: new Map(),
		sessionManager: { getCwd: () => process.cwd() },
	});
	return provider.commands.find((command: { name: string }) => command.name === name).description;
}
