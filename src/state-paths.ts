import { homedir } from "node:os";
import { join } from "node:path";

function stateRoot(): string {
	const override = process.env.PI_DI18N_STATE_DIR?.trim();
	if (override) return override;
	return join(homedir(), ".pi", "agent", "state", "pi-di18n");
}

export function statePath(...parts: string[]): string {
	return join(stateRoot(), ...parts);
}

export function getStateRoot(): string {
	return stateRoot();
}
