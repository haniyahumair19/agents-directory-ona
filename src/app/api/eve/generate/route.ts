import { Client } from "eve/client";
import type { InputRequest, MessageResponse } from "eve/client";
import {
  childSessionIdsFromEvents,
  expectedSkillForLabel,
  loadedSkillsFromEvents,
} from "@/lib/eve-skills";

export const runtime = "nodejs";

type Body = {
  label?: string;
  contextNote?: string;
};

/** Proven CLI messages so dashboard clicks hit the same skill as Checkpoint 1. */
function messageForGap(label: string, contextNote?: string) {
  if (label === "Pitch deck") {
    return contextNote
      ? `I need a pitch deck outline ${contextNote}.`
      : "I need a pitch deck outline";
  }
  if (label === "Customer case study") {
    return "help me turn this pilot into a case study";
  }
  if (label === "Customer Discovery") {
    return "synthesize these customer interview notes";
  }
  return contextNote ? `I need a ${label.toLowerCase()} ${contextNote}.` : `I need a ${label.toLowerCase()}.`;
}

const PLACEHOLDER_NOTES = `Placeholder interview notes for dashboard generate:
- Participant: Head of Ops at a mid-market logistics company
- Job: reduce manual dispatch exceptions
- Pain: spreadsheet handoffs, 4 hours/week lost, missed SLAs
- Workaround: Slack + Excel
- Buying signal: asked for a 30-day pilot price
- Tension: ops wants speed, finance wants ROI proof`;

async function consumeTurn(response: MessageResponse) {
  let message: string | undefined;
  let pending: readonly InputRequest[] = [];
  let failed: string | undefined;
  const events: unknown[] = [];

  for await (const event of response) {
    events.push(event);
    if (event.type === "message.completed" && event.data.finishReason !== "tool-calls") {
      message = event.data.message;
    }
    if (event.type === "input.requested") {
      pending = event.data.requests;
    }
    if (event.type === "session.failed" || event.type === "turn.failed") {
      failed = event.data?.message || event.data?.code || "Eve turn failed.";
    }
  }

  return { message, pending, failed, events };
}

async function collectLoadedSkills(client: Client, events: readonly unknown[]) {
  const skills = new Set(loadedSkillsFromEvents(events));
  for (const childId of childSessionIdsFromEvents(events)) {
    try {
      const snapshot = await client.sessions.attach(childId).snapshot();
      for (const skill of loadedSkillsFromEvents(snapshot.events)) skills.add(skill);
    } catch {
      // Child snapshot is evidence, not required to return Eve text.
    }
  }
  return [...skills];
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const label = body.label?.trim();
  if (!label) {
    return Response.json({ error: "label is required." }, { status: 400 });
  }

  const contextNote = body.contextNote?.trim();
  const message = messageForGap(label, contextNote);
  const host = process.env.EVE_URL ?? "http://127.0.0.1:2000";
  const expectedSkill = expectedSkillForLabel(label);

  try {
    const client = new Client({ host });
    const created = await client.sessions.create({ message });
    const events: unknown[] = [];
    let current = await consumeTurn(created.response);
    events.push(...current.events);

    if (current.pending.length > 0) {
      const resumed = await created.session.respond(
        current.pending.map((req) => ({
          requestId: req.requestId,
          optionId: req.options?.[0]?.id,
          text: PLACEHOLDER_NOTES,
        })),
      );
      current = await consumeTurn(resumed);
      events.push(...current.events);
    }

    if (current.failed || !current.message) {
      return Response.json(
        {
          error: current.failed || "Eve turn failed.",
          sessionId: created.response.sessionId,
        },
        { status: 502 },
      );
    }

    const loadedSkills = await collectLoadedSkills(client, events);
    const skillLoaded = expectedSkill ? loadedSkills.includes(expectedSkill) : true;

    return Response.json({
      ok: true,
      sessionId: created.response.sessionId,
      message: current.message,
      status: "waiting",
      expectedSkill,
      loadedSkills,
      skillLoaded,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: "Could not reach Eve.", detail, host },
      { status: 502 },
    );
  }
}
