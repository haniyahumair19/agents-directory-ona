import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

/** The sole read path for the status model. */
export const listForFellow = query({
  args: { fellowId: v.string() },
  handler: async (ctx, { fellowId }) =>
    await ctx.db
      .query("gaps")
      .withIndex("by_fellowId", (q) => q.eq("fellowId", fellowId))
      .collect(),
});

/**
 * Runs a mocked delivery agent and any unfinished agent-backed prerequisites.
 * All state is written to `gaps`, so every view observes the same update.
 */
export const runMatchedAgentCascade = mutation({
  args: { gapId: v.id("gaps") },
  handler: async (ctx, { gapId }) => {
    const sourceEngagementId = `engagement_${Date.now()}_${gapId}`;
    const updated: { gapId: Id<"gaps">; label: string; agentName: string }[] = [];
    const visiting = new Set<Id<"gaps">>();

    const run = async (currentId: Id<"gaps">): Promise<void> => {
      if (visiting.has(currentId)) {
        throw new Error("This gap dependency chain contains a cycle.");
      }

      const gap = await ctx.db.get(currentId);
      if (!gap) throw new Error("A required gap could not be found.");
      if (gap.status === "done") return;
      if (!gap.matchedAgentName) {
        throw new Error(`“${gap.label}” is incomplete and has no matched agent to run.`);
      }

      visiting.add(currentId);
      for (const prerequisiteId of gap.dependsOn) {
        const prerequisite = await ctx.db.get(prerequisiteId);
        if (!prerequisite) throw new Error(`“${gap.label}” has a missing prerequisite record.`);
        if (prerequisite.status !== "done") await run(prerequisiteId);
      }

      await ctx.db.patch(currentId, {
        status: "done",
        lastUpdatedBy: gap.matchedAgentName,
        lastUpdatedAt: Date.now(),
        sourceEngagementId,
      });
      updated.push({ gapId: currentId, label: gap.label, agentName: gap.matchedAgentName });
      visiting.delete(currentId);
    };

    await run(gapId);
    return { sourceEngagementId, updated };
  },
});

/** Marks a gap in_progress when Eve returned text but did not load the registered skill. */
export const markGapNeedsReview = mutation({
  args: { gapId: v.id("gaps") },
  handler: async (ctx, { gapId }) => {
    const gap = await ctx.db.get(gapId);
    if (!gap) throw new Error("A required gap could not be found.");
    if (gap.status === "done") return { gapId, status: gap.status };

    await ctx.db.patch(gapId, {
      status: "in_progress",
      lastUpdatedBy: "Eve responded without using the registered skill — needs review",
      lastUpdatedAt: Date.now(),
    });
    return { gapId, status: "in_progress" as const };
  },
});

/** Test helper: reopen a single gap without reseeding the whole demo. */
export const resetGapToMissing = mutation({
  args: { gapId: v.id("gaps") },
  handler: async (ctx, { gapId }) => {
    const gap = await ctx.db.get(gapId);
    if (!gap) throw new Error("A required gap could not be found.");
    await ctx.db.patch(gapId, {
      status: "missing",
      lastUpdatedBy: undefined,
      lastUpdatedAt: undefined,
      sourceEngagementId: undefined,
    });
    return { gapId, status: "missing" as const };
  },
});
