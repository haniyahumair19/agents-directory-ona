import { openai } from "@ai-sdk/openai";
import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Checks diligence package / data-room readiness by inspecting which required documents are present.",
  model: openai("gpt-5.4-nano"),
});
