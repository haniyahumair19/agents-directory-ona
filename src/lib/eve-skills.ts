export const SKILL_REVIEW_NOTE =
  "Eve responded without using the registered skill — needs review";

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

function walkEvents(events: readonly unknown[], visit: (event: EventLike) => void) {
  for (const raw of events) {
    const event = raw as EventLike;
    visit(event);
    if (event.type === "subagent.event" && event.data?.event) {
      walkEvents([event.data.event], visit);
    }
  }
}
