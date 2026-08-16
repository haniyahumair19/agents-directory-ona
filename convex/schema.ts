import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  gaps: defineTable({
    fellowId: v.string(),
    label: v.string(),
    status: v.union(v.literal("missing"), v.literal("in_progress"), v.literal("done")),
    harnessId: v.union(v.literal("gtm"), v.literal("product"), v.literal("investments")),
    subModuleId: v.string(),
    osSection: v.union(
      v.literal("Foundation"),
      v.literal("Brand"),
      v.literal("Agents"),
      v.literal("Growth"),
      v.literal("Finance"),
      v.literal("Operations"),
    ),
    osFieldKey: v.string(),
    matchedAgentName: v.union(
      v.literal("Case Study Composer"),
      v.literal("Interview Synth"),
      v.literal("Build Readiness Report"),
      v.literal("Deck Drafter"),
      v.null(),
    ),
    dependsOn: v.array(v.id("gaps")),
    contextNote: v.optional(v.string()),
    lastUpdatedBy: v.optional(v.string()),
    lastUpdatedAt: v.optional(v.number()),
    sourceEngagementId: v.optional(v.string()),
  }).index("by_fellowId", ["fellowId"]),
});
