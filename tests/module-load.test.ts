import { describe, expect, it } from "vitest";
import extension from "../index.ts";
import { complete, getEnvApiKey } from "@earendil-works/pi-ai/compat";

describe("extension module", () => {
	it("loads with current @earendil-works pi packages", () => {
		expect(extension).toBeTypeOf("function");
		expect(complete).toBeTypeOf("function");
		expect(getEnvApiKey).toBeTypeOf("function");
	});
});
