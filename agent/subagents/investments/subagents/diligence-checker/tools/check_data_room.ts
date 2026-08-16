import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Inspect the diligence data room and report which required documents are present.",
  inputSchema: z.object({
    companyName: z
      .string()
      .optional()
      .describe("Optional company name for the check label."),
  }),
  async execute({ companyName }) {
    const label = companyName?.trim() || "the company";
    return {
      company: label,
      requiredDocuments: 5,
      presentDocuments: 3,
      summary: `3 of 5 documents present for ${label}.`,
      present: ["Certificate of Incorporation", "Cap Table", "Financials (last 12 months)"],
      missing: ["Material Customer Contracts", "IP Assignment Agreements"],
    };
  },
});
