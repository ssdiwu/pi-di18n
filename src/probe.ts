type ProbeState = "matched" | "notFound" | "unsafe";

type ProbePoint = {
	id: string;
	state: ProbeState;
	hooked: number;
	hits: number;
	translated: number;
	reason?: string;
	lastSeenAt?: string;
};

type ProbeStore = {
	enabled: boolean;
	points: Record<string, ProbePoint>;
};

const g = globalThis as any;
const PROBE_KEY = "__pi_i18n_probe__";

function nowIso(): string {
	return new Date().toISOString();
}

function getStore(): ProbeStore {
	if (!g[PROBE_KEY]) {
		g[PROBE_KEY] = { enabled: true, points: {} } as ProbeStore;
	}
	return g[PROBE_KEY] as ProbeStore;
}

function ensurePoint(id: string): ProbePoint {
	const store = getStore();
	if (!store.points[id]) {
		store.points[id] = {
			id,
			state: "matched",
			hooked: 0,
			hits: 0,
			translated: 0,
		};
	}
	return store.points[id]!;
}

export function setProbeEnabled(enabled: boolean): void {
	getStore().enabled = !!enabled;
}

export function resetProbe(): void {
	const store = getStore();
	store.points = {};
}

export function probeHook(id: string, state: ProbeState, reason?: string): void {
	const store = getStore();
	if (!store.enabled) return;
	const p = ensurePoint(id);
	p.state = state;
	p.reason = reason;
	p.hooked += state === "matched" ? 1 : 0;
	p.lastSeenAt = nowIso();
}

export function probeHit(id: string, translated: boolean): void {
	const store = getStore();
	if (!store.enabled) return;
	const p = ensurePoint(id);
	p.hits += 1;
	if (translated) p.translated += 1;
	p.lastSeenAt = nowIso();
}

export function getProbeSnapshot(): { enabled: boolean; summary: any; points: ProbePoint[] } {
	const store = getStore();
	const points = Object.values(store.points).sort((a, b) => a.id.localeCompare(b.id));
	const summary = {
		total: points.length,
		matched: points.filter((p) => p.state === "matched").length,
		notFound: points.filter((p) => p.state === "notFound").length,
		unsafe: points.filter((p) => p.state === "unsafe").length,
		hit: points.filter((p) => p.hits > 0).length,
		translated: points.filter((p) => p.translated > 0).length,
	};
	return { enabled: store.enabled, summary, points };
}
