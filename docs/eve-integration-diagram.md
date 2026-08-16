# Eve integration — architecture and demo flow

Grounded in the code and traces in this repo. Do not treat every “asks for more input” card as `ask_question`: **most dashboard clarifying questions this week were ordinary assistant text**, not a HITL tool call.

---

## Demo note — PLACEHOLDER_NOTES auto-respond (real risk)

**Has this path fired in a normal dashboard click this week? No.** Case Study / Pitch / Discovery “please provide X” replies were the skill’s **text**. The one real `input.requested` earlier (`wrun_01M056VZ8WEJJEA4ZTR779Q7BB`) happened **before** auto-respond existed, so the click hung.

**Forced test (this check):** product instructions were temporarily told to use the human-input tool. Session `wrun_01M05D82DXQDTVRK0EG383PV4J` emitted `input.requested`. The same logic as `src/app/api/eve/generate/route.ts` then called `session.respond` with `PLACEHOLDER_NOTES`.

**What the Fellow would have seen** (final assistant text, abbreviated):

> I routed this to the **product** harness… the notes you provided appear to be **only a brief summary**… For now, I can only safely synthesize what’s in the recap: an Ops-led logistics persona… **4 hours/week**… **missed SLAs**… **Slack + Excel**… **30-day pilot pricing**… Paste the actual notes and I’ll redo the synthesis.

Direct answers:

| Question | Answer from that session |
|---|---|
| Finished deliverable? | **No.** It still asked for raw transcripts. It also recited the fake recap as if it were real-ish evidence. |
| Is the string `PLACEHOLDER_NOTES` / “Placeholder interview notes for dashboard generate” visible? | **No.** That label never appeared on the card. |
| Could Convex go `done` on fake data with no flag? | **Yes, if `load-skill` also fired.** The safeguard only checks skill load, not “is this placeholder.” This test did **not** load `interview-synthesis` (`skillsTurn2: []`), so write-back would have been `in_progress` / needs review — but the **message still contained the fake facts**. If a later HITL turn also loads the skill, the gap can be `done` with invented logistics-ops numbers and nothing saying they were injected by the API. |

Customer Discovery’s current `messageForGap` **already pastes those notes into the first user message**, so a dashboard CD click can bake the same fake facts in **without** HITL. HITL auto-respond is a second, quieter injection path for any gap that calls `ask_question`.

---

## Diagram 1 — Eve architecture (GTM as the worked example)

GTM has **no nested subagents**. Only Investments has a nested `diligence-checker`. Product repeats the same one-skill pattern as GTM (`interview-synthesis`).

```mermaid
flowchart TB
  subgraph dashboard["Next.js dashboard — src/app/page.tsx"]
    Card["Gap card: Customer case study<br/>Matched: Case Study Composer · Eve · GTM<br/>Generate it → generateGap → callEve"]
  end

  subgraph nextApi["POST /api/eve/generate<br/>src/app/api/eve/generate/route.ts"]
    Msg["messageForGap: Customer case study<br/>→ help me turn this pilot into a case study"]
    Session["eve/client: Client sessions.create<br/>host EVE_URL or http://127.0.0.1:2000"]
    Consume["consumeTurn: walk stream events"]
    Hitl["RISK: if type input.requested<br/>API auto session.respond PLACEHOLDER_NOTES<br/>Fellow never sees that label<br/>fake facts can appear in the card text"]
    Detect["collectLoadedSkills + loadedSkillsFromEvents<br/>expected skill: case-study-outline"]
    Json["JSON: sessionId, message, skillLoaded, loadedSkills"]
    Msg --> Session --> Consume --> Hitl --> Detect --> Json
  end

  subgraph eveHost["Eve dev server — npx eve dev --port 2000"]
    Root["Root router<br/>agent/agent.ts + agent/instructions.md<br/>model gpt-5.4-nano<br/>delegate to exactly one harness"]
    Root --> GTM
    Root --> INV
    Root --> PROD

    subgraph GTM["gtm — fully tested path"]
      GtmAgent["agent/subagents/gtm/agent.ts<br/>agent/subagents/gtm/instructions.md"]
      GtmSkill["skill: case-study-outline<br/>agent/subagents/gtm/skills/case-study-outline.md"]
      GtmNested["nested subagents: none"]
      GtmAgent --> GtmSkill
      GtmAgent --> GtmNested
    end

    subgraph INV["investments — same pattern + extra nest"]
      InvAgent["agent/subagents/investments/"]
      InvSkill["skill: pitch-deck-outline"]
      InvNest["nested: diligence-checker<br/>+ mock tool check_data_room"]
      InvAgent --> InvSkill
      InvAgent --> InvNest
    end

    subgraph PROD["product — same pattern as GTM"]
      ProdAgent["agent/subagents/product/"]
      ProdSkill["skill: interview-synthesis"]
      ProdAgent --> ProdSkill
    end
  end

  subgraph safeguard["Write-back — after Eve returns text"]
    Check{"skillLoaded === true<br/>for expected skill?"}
    Done["page.tsx writeBackIfSkillLoaded<br/>→ Convex runMatchedAgentCascade<br/>gaps.status = done"]
    Block["page.tsx writeBackIfSkillLoaded<br/>→ Convex markGapNeedsReview<br/>gaps.status = in_progress<br/>needs review note"]
    Clarify["If skill loaded but message is a question:<br/>still done. Card shows<br/>Eve needs more detail… no way to reply yet"]
    Check -->|yes| Done
    Check -->|no| Block
    Done --> Clarify
  end

  Card -->|"fetch POST /api/eve/generate"| nextApi
  Json -->|"HTTP to Eve :2000"| Root
  Json --> Check
```

**File map (GTM vs the other two)**

| Harness | Agent files | Skill | Nested subagents |
|---|---|---|---|
| `gtm` | `agent/subagents/gtm/agent.ts`, `instructions.md` | `case-study-outline.md` | **none** |
| `product` | `agent/subagents/product/agent.ts`, `instructions.md` | `interview-synthesis.md` | none |
| `investments` | `agent/subagents/investments/agent.ts`, `instructions.md` | `pitch-deck-outline.md` | `subagents/diligence-checker/` + `tools/check_data_room.ts` |

---

## Diagram 2 — Demo sequence (Customer case study)

This is the path we actually ran. Step 6 is **the two outcomes observed in testing**, not an ideal happy path.

```mermaid
sequenceDiagram
  autonumber
  actor Fellow
  participant Card as Gap card page.tsx
  participant Gen as generateGap / callEve
  participant API as POST /api/eve/generate
  participant Eve as Eve :2000 sessions.create
  participant Root as Root agent/instructions.md
  participant GTM as gtm subagent
  participant Skill as load-skill case-study-outline
  participant Gate as writeBackIfSkillLoaded
  participant Convex as Convex gaps table

  Fellow->>Card: Views Customer case study<br/>status missing<br/>Matched: Case Study Composer · Eve · GTM
  Fellow->>Card: Clicks Generate it
  Card->>Gen: window.confirm then generateGap
  Gen->>API: fetch POST /api/eve/generate<br/>body { label: Customer case study }
  API->>Eve: Client.sessions.create<br/>message: help me turn this pilot into a case study

  Note over API,Eve: Case study clarifying questions in the demo were TEXT replies,<br/>not ask_question. HITL auto-respond is a separate path:<br/>if input.requested, API injects PLACEHOLDER_NOTES invisibly.<br/>Without that handler the dashboard used to hang.

  Eve->>Root: user message
  Root->>GTM: subagent.called name gtm
  GTM->>Skill: actions.requested kind load-skill<br/>input.skill = case-study-outline

  Note over Skill,Convex: Step 6 — two outcomes actually observed in testing

  alt 6a Skill loaded, reply is a clarifying question<br/>observed: Case Study Composer live click
    Skill-->>GTM: skill text followed
    GTM-->>Eve: asks for customer, pilot dates, metrics, quotes, …
    Eve-->>API: skillLoaded true, loadedSkills case-study-outline
    API-->>Gen: 200 + message
    Gen->>Gate: writeBackIfSkillLoaded
    Gate->>Convex: runMatchedAgentCascade<br/>status done anyway
    Convex-->>Card: done + Eve session id + question text<br/>note: Eve needs more detail to finish this — no way to reply yet in this prototype
    Note over Card,Fellow: Arguably still a gap: right skill, not a finished case study.<br/>Dashboard cannot send a follow-up into that session.
  else 6b Skill does not load at all<br/>observed: Customer Discovery miss session replayed through the same gate
    GTM-->>Eve: text only, no load-skill
    Eve-->>API: skillLoaded false
    API-->>Gen: 200 + message
    Gen->>Gate: writeBackIfSkillLoaded
    Gate->>Convex: markGapNeedsReview<br/>status in_progress
    Convex-->>Card: in progress + Eve responded without using the registered skill — needs review
    Note over Card,Fellow: Generate it stays available. Still no reply-into-session UI.
  end
```

**What the safeguard does and does not do**

- It **does** block `done` when the expected skill never appears on the Eve stream (`case-study-outline` / `pitch-deck-outline` / `interview-synthesis`).
- It **does not** require a finished deliverable. A loaded skill that only asks for more input still goes through `runMatchedAgentCascade` → `done`.
- The dashboard stores Eve text in React state (`eveResults`), not a Convex content field. Reload loses the message; Convex only keeps status / `lastUpdatedBy`.
- There is no `session.send` from the UI after the first turn.
- **PLACEHOLDER_NOTES auto-respond** is not how Case Study Composer asked for inputs in the demo. It is live code on every `/api/eve/generate` call. If Eve emits `input.requested`, fake interview bullets are answered on the Fellow’s behalf. The card can show those facts without the word “placeholder.” If the expected skill also loaded, Convex still goes `done`.
