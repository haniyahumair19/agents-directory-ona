import { openai } from "@ai-sdk/openai";
import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Master GTM Agent for go-to-market and sales enablement: customer case studies, pilot proof, messaging, and commercial narrative.",
  model: openai("gpt-5.4-nano"),
});
