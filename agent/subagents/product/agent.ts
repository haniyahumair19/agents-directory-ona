import { openai } from "@ai-sdk/openai";
import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Master Product Agent for discovery and insight: customer interview synthesis, problem findings, and evidence from research notes.",
  model: openai("gpt-5.4-nano"),
});
