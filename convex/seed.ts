import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

type GapSeed = {
  label: string;
  status: "missing" | "in_progress" | "done";
  harnessId: "gtm" | "product" | "investments";
  subModuleId: string;
  osSection: "Foundation" | "Brand" | "Agents" | "Growth" | "Finance" | "Operations";
  osFieldKey: string;
  matchedAgentName: "Case Study Composer" | "Interview Synth" | "Build Readiness Report" | "Deck Drafter" | null;
  contextNote?: string;
};

const TAXONOMY: Omit<GapSeed, "status">[] = [
  { label: "Messaging architecture", harnessId: "gtm", subModuleId: "Marketing & Comms", osSection: "Brand", osFieldKey: "messagingArchitecture", matchedAgentName: null },
  { label: "Partner landscape", harnessId: "gtm", subModuleId: "BD & Partnerships", osSection: "Growth", osFieldKey: "partnerLandscape", matchedAgentName: null },
  { label: "Customer case study", harnessId: "gtm", subModuleId: "Sales Enablement", osSection: "Growth", osFieldKey: "customerCaseStudy", matchedAgentName: "Case Study Composer" },
  { label: "Onboarding success plan", harnessId: "gtm", subModuleId: "Customer Success", osSection: "Operations", osFieldKey: "onboardingSuccessPlan", matchedAgentName: null },
  { label: "Commercialisation pathway", harnessId: "gtm", subModuleId: "IP Commercialisation", osSection: "Foundation", osFieldKey: "commercialisationPathway", matchedAgentName: null },
  { label: "Problem definition", harnessId: "product", subModuleId: "Problem Discovery", osSection: "Foundation", osFieldKey: "problemDefinition", matchedAgentName: null },
  { label: "Customer Discovery", harnessId: "product", subModuleId: "Customer Discovery", osSection: "Brand", osFieldKey: "customerDiscovery", matchedAgentName: "Interview Synth" },
  { label: "AI wedge & moat", harnessId: "product", subModuleId: "AI Wedge & Moat", osSection: "Agents", osFieldKey: "aiWedgeMoat", matchedAgentName: null },
  { label: "Build readiness", harnessId: "product", subModuleId: "Build & Ship", osSection: "Operations", osFieldKey: "buildReadiness", matchedAgentName: "Build Readiness Report" },
  { label: "PMF evidence", harnessId: "product", subModuleId: "Product Market Fit", osSection: "Growth", osFieldKey: "pmfEvidence", matchedAgentName: null },
  { label: "Pitch deck", harnessId: "investments", subModuleId: "Narrative & Model", osSection: "Brand", osFieldKey: "pitchDeck", matchedAgentName: "Deck Drafter" },
  { label: "Diligence package", harnessId: "investments", subModuleId: "Diligence Package", osSection: "Finance", osFieldKey: "diligencePackage", matchedAgentName: null },
  { label: "Investor target list", harnessId: "investments", subModuleId: "Investor Targeting", osSection: "Finance", osFieldKey: "investorTargetList", matchedAgentName: null },
  { label: "Fundraising process", harnessId: "investments", subModuleId: "Deal Dynamics", osSection: "Finance", osFieldKey: "fundraisingProcess", matchedAgentName: null },
  { label: "Governance cadence", harnessId: "investments", subModuleId: "Governance", osSection: "Operations", osFieldKey: "governanceCadence", matchedAgentName: null },
];

const FELLOW_STATUSES = {
  ari: ["missing", "done", "missing", "in_progress", "done", "done", "missing", "in_progress", "missing", "done", "missing", "in_progress", "done", "missing", "done"],
  maya: ["done", "missing", "done", "done", "in_progress", "missing", "done", "done", "in_progress", "missing", "done", "missing", "in_progress", "done", "missing"],
  leo: ["in_progress", "done", "missing", "missing", "done", "done", "in_progress", "missing", "done", "missing", "in_progress", "done", "missing", "done", "in_progress"],
} as const;

const fellows = [
  { id: "ari", name: "Ari", statuses: FELLOW_STATUSES.ari },
  { id: "maya", name: "Maya", statuses: FELLOW_STATUSES.maya },
  { id: "leo", name: "Leo", statuses: FELLOW_STATUSES.leo },
] as const;

/** Re-runnable local demo seed. Untouched rows intentionally have no update history. */
export const demo = mutation({
  args: {},
  handler: async (ctx) => {
    const current = await ctx.db.query("gaps").collect();
    await Promise.all(current.map((gap) => ctx.db.delete(gap._id)));

    for (const fellow of fellows) {
      let ariCustomerDiscoveryId: Id<"gaps"> | undefined;
      for (const [index, template] of TAXONOMY.entries()) {
        const status = fellow.statuses[index];
        const isAriCustomerDiscovery = fellow.id === "ari" && template.label === "Customer Discovery";
        const isAriPitchDeck = fellow.id === "ari" && template.label === "Pitch deck";
        let dependsOn: Id<"gaps">[] = [];
        if (isAriPitchDeck) {
          const customerDiscoveryId = ariCustomerDiscoveryId;
          if (!customerDiscoveryId) {
            throw new Error("Ari's Pitch deck must follow Customer Discovery in the seed order.");
          }
          dependsOn = [customerDiscoveryId];
        }
        const id = await ctx.db.insert("gaps", {
          ...template,
          fellowId: fellow.id,
          status,
          dependsOn,
          ...(isAriPitchDeck ? { contextNote: "ahead of your call with Greylock next week" } : {}),
        });
        if (isAriCustomerDiscovery) ariCustomerDiscoveryId = id;
      }
    }
    return { fellows: fellows.map(({ id, name }) => ({ id, name })), rowsCreated: fellows.length * TAXONOMY.length };
  },
});
