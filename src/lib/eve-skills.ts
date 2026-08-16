export const SKILL_REVIEW_NOTE =
  "Eve responded without using the registered skill — needs review";

export const EVE_NEEDS_REPLY_NOTE =
  "Eve needs more detail to finish this — no way to reply yet in this prototype.";

const EXPECTED_SKILL: Record<string, string> = {
  "Pitch deck": "pitch-deck-outline",
  "Customer case study": "case-study-outline",
  "Customer Discovery": "interview-synthesis",
};

export function expectedSkillForLabel(label: string): string | null {
  return EXPECTED_SKILL[label] ?? null;
}

type ActionLike = {
  kind?: string;
  input?: { skill?: string };
  name?: string;
};

type EventLike = {
  type?: string;
  data?: {
    actions?: ActionLike[];
    event?: EventLike;
    result?: ActionLike & { skill?: string };
    name?: string;
    toolName?: string;
    input?: { skill?: string };
    childSessionId?: string;
  };
};

export function childSessionIdsFromEvents(events: readonly unknown[]): string[] {
  const ids = new Set<string>();
  walkEvents(events, (event) => {
    const childId = event.data?.childSessionId;
    if (event.type === "subagent.called" && childId) ids.add(childId);
  });
  return [...ids];
}

export function loadedSkillsFromEvents(events: readonly unknown[]): string[] {
  const skills = new Set<string>();
  walkEvents(events, (event) => {
    if (event.type === "actions.requested") {
      for (const action of event.data?.actions ?? []) {
        if (action.kind === "load-skill" && action.input?.skill) {
          skills.add(action.input.skill);
        }
      }
    }
    const result = event.data?.result;
    if (event.type === "action.result" && result?.kind === "load-skill-result") {
      const skill = result.input?.skill ?? result.skill;
      if (skill) skills.add(skill);
    }
    const toolName = event.data?.toolName ?? event.data?.name ?? result?.name;
    const toolSkill = event.data?.input?.skill ?? result?.input?.skill;
    if (toolName === "load_skill" && toolSkill) skills.add(toolSkill);
  });
  return [...skills];
}

export function skillLoadedFromEvents(events: readonly unknown[], expectedSkill: string): boolean {
  return loadedSkillsFromEvents(events).includes(expectedSkill);
}

/** True when Eve asked for inputs instead of returning the finished asset. */
export function isClarifyingQuestion(message: string): boolean {
  const text = message.toLowerCase();
  if (
    text.includes("participants / segments") ||
    (text.includes("pain points") && text.includes("product implications"))
  ) {
    return false;
  }
  return (
    text.includes("please paste") ||
    text.includes("please provide") ||
    text.includes("please share") ||
    text.includes("please include") ||
    text.includes("weren't included") ||
    text.includes("weren’t included") ||
    text.includes("i don't yet have") ||
    text.includes("i don’t yet have") ||
    text.includes("minimum inputs") ||
    text.includes("once you share") ||
    text.includes("once you send") ||
    text.includes("quick question") ||
    text.includes("before i draft") ||
    text.includes("exact inputs needed") ||
    text.includes("if you share") ||
    text.includes("share these") ||
    text.includes("if you provide") ||
    text.includes("if you want, paste") ||
    text.includes("paste 5") ||
    text.includes("checklist of inputs") ||
    text.includes("inputs to fill") ||
    /\bprovide:\s*$/m.test(text) ||
    (text.includes("?") && (text.includes("round type") || text.includes("traction") || text.includes("customer")))
  );
}

function walkEvents(events: readonly unknown[], visit: (event: EventLike) => void) {
  for (const raw of events) {
    const event = raw as EventLike;
    visit(event);
    if (event.type === "subagent.event" && event.data?.event) {
      walkEvents([event.data.event], visit);
    }
  }
}
