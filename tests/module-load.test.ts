import { describe, expect, it } from "vitest";
import extension from "../index.ts";

describe("extension module", () => {
	it("loads with current @earendil-works pi packages", () => {
		expect(extension).toBeTypeOf("function");
	});
});
