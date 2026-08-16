import { openai } from "@ai-sdk/openai";
import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Master Investments Agent for fundraising and investment work: Narrative & Model, Diligence Package, Investor Targeting, Deal Dynamics, and Governance.",
  model: openai("gpt-5.4-nano"),
});
