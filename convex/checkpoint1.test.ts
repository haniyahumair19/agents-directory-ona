import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

describe("Checkpoint 1: gaps schema and seed", () => {
  it("returns Ari's seeded gaps through the real Convex query function", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));

    const seeded = await t.mutation(api.seed.demo, {});
    const ariGaps = await t.query(api.gaps.listForFellow, { fellowId: "ari" });

    expect(seeded.rowsCreated).toBe(45);
    expect(ariGaps).toHaveLength(15);
    expect(ariGaps.find((gap) => gap.label === "Customer Discovery")?.status).toBe("missing");
    const pitchDeck = ariGaps.find((gap) => gap.label === "Pitch deck");
    expect(pitchDeck?.status).toBe("missing");
    expect(pitchDeck?.dependsOn).toHaveLength(1);
    expect(pitchDeck?.contextNote).toBe("ahead of your call with Greylock next week");
    expect(ariGaps.every((gap) => gap.lastUpdatedBy === undefined)).toBe(true);

    console.log(JSON.stringify(ariGaps, null, 2));
  });
});
