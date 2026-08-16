"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { SKILL_REVIEW_NOTE } from "@/lib/eve-skills";

const companyTabs = ["Foundation", "Brand", "Agents", "Growth", "Finance", "Operations"] as const;
const harnesses = [
  { id: "gtm", name: "GTM Harness", engine: "GTM Engineering" },
  { id: "product", name: "Product Harness", engine: "Co-Build OS" },
  { id: "investments", name: "Investments Harness", engine: "Capital Ops" },
] as const;

type View = "home" | "harnesses" | "company";
type Gap = Doc<"gaps">;
type EveResult = {
  message: string;
  sessionId: string | null;
  skillLoaded: boolean;
  expectedSkill: string | null;
  loadedSkills: string[];
  reviewNote?: string;
};

const EVE_GAPS = new Set(["Pitch deck", "Customer case study", "Customer Discovery"]);

function eveBadge(label: string) {
  if (label === "Pitch deck") return "Eve · Investments";
  if (label === "Customer case study") return "Eve · GTM";
  if (label === "Customer Discovery") return "Eve · Product";
  return "Example — not a real agent";
}

function tabForGap(gap: Gap): (typeof companyTabs)[number] {
  return companyTabs.includes(gap.osSection as (typeof companyTabs)[number])
    ? (gap.osSection as (typeof companyTabs)[number])
    : "Brand";
}

function statusClass(status: "missing" | "in_progress" | "done") {
  return {
    missing: "bg-rose-50 text-rose-700 ring-rose-200",
    in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
    done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  }[status];
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [fellowId, setFellowId] = useState("ari");
  const [companyTab, setCompanyTab] = useState<(typeof companyTabs)[number]>("Foundation");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [eveResults, setEveResults] = useState<Record<string, EveResult>>({});
  const gaps = useQuery(api.gaps.listForFellow, { fellowId });
  const runCascade = useMutation(api.gaps.runMatchedAgentCascade);
  const markNeedsReview = useMutation(api.gaps.markGapNeedsReview);
  const fellowName = { ari: "Ari", maya: "Maya", leo: "Leo" }[fellowId] ?? "Fellow";

  const nudge = useMemo(
    () => gaps?.find((gap) => gap.status === "missing" && gap.contextNote),
    [gaps],
  );

  const companyGaps = useMemo(
    () => gaps?.filter((gap) => gap.osSection === companyTab) ?? [],
    [gaps, companyTab],
  );

  const highlightGapId = useMemo(
    () => gaps?.find((gap) => gap.label === "Pitch deck")?._id,
    [gaps],
  );

  async function callEve(gap: Gap): Promise<EveResult> {
    const response = await fetch("/api/eve/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: gap.label,
        contextNote: gap.contextNote,
      }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      message?: string;
      error?: string;
      detail?: string;
      sessionId?: string;
      skillLoaded?: boolean;
      expectedSkill?: string | null;
      loadedSkills?: string[];
    };
    if (!response.ok || !payload.message) {
      throw new Error(payload.detail || payload.error || `Eve did not return content for ${gap.label}.`);
    }
    const result: EveResult = {
      message: payload.message,
      sessionId: payload.sessionId ?? null,
      skillLoaded: payload.skillLoaded === true,
      expectedSkill: payload.expectedSkill ?? null,
      loadedSkills: payload.loadedSkills ?? [],
    };
    setEveResults((current) => ({ ...current, [gap._id]: result }));
    return result;
  }

  async function writeBackIfSkillLoaded(gap: Gap, result: EveResult) {
    if (result.skillLoaded) {
      await runCascade({ gapId: gap._id });
      return true;
    }

    const reviewed: EveResult = { ...result, reviewNote: SKILL_REVIEW_NOTE };
    setEveResults((current) => ({ ...current, [gap._id]: reviewed }));
    try {
      await markNeedsReview({ gapId: gap._id });
    } catch {
      // Cloud may not have the new mutation yet; still refuse to mark done.
    }
    setGenerateError(SKILL_REVIEW_NOTE);
    return false;
  }

  async function generateGap(gap: Gap) {
    if (!gaps) return;
    const confirmLabel = gap.label === "Pitch deck"
      ? "Generate Pitch deck? This will also run any unfinished agent-backed prerequisites through Eve."
      : `Generate ${gap.label} with Eve?`;
    if (!window.confirm(confirmLabel)) return;

    setGenerateError(null);
    setGeneratingId(gap._id);
    try {
      const unfinishedPrereqs = gap.dependsOn
        .map((id) => gaps.find((candidate) => candidate._id === id))
        .filter((prereq): prereq is Gap => Boolean(prereq && prereq.status !== "done" && prereq.matchedAgentName));

      for (const prereq of unfinishedPrereqs) {
        const prereqResult = await callEve(prereq);
        const wrote = await writeBackIfSkillLoaded(prereq, prereqResult);
        if (!wrote) {
          setView("company");
          setCompanyTab(tabForGap(prereq));
          return;
        }
      }

      const result = await callEve(gap);
      await writeBackIfSkillLoaded(gap, result);
      setView("company");
      setCompanyTab(tabForGap(gap));
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f6f4] text-[#29262a]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#5a5051] bg-[#3c3436] px-5 py-6 text-stone-100 lg:block">
        <button onClick={() => setView("home")} className="flex items-center gap-3 text-left">
          <span className="grid h-7 w-7 place-items-center bg-[#d65a38] text-xs font-bold">▰</span>
          <span className="font-semibold">Utopia OS</span>
        </button>
        <nav className="mt-10 space-y-8 text-sm">
          <NavGroup title="Programme">
            <NavItem label="Co-Build Hub" onClick={() => setView("home")} active={view === "home"} />
            <NavItem label="Your Concept" onClick={() => setView("home")} />
            <NavItem label="Your Company" onClick={() => setView("company")} active={view === "company"} />
            <NavItem label="Co-Build Plan" onClick={() => setView("harnesses")} active={view === "harnesses"} />
          </NavGroup>
          <NavGroup title="Astrolabe">
            <NavItem label="How We Work" onClick={() => undefined} />
            <NavItem label="Library" onClick={() => setView("harnesses")} />
          </NavGroup>
          <NavGroup title="Support">
            <NavItem label="Requests" onClick={() => undefined} />
          </NavGroup>
        </nav>
        <div className="absolute bottom-6 text-xs text-stone-400">Agents & Skills Directory</div>
      </aside>

      <main className="min-h-screen lg:ml-64">
        <header className="flex min-h-16 items-center justify-between border-b border-stone-200 bg-white px-6">
          <p className="text-sm text-stone-500">Home / {view === "company" ? "Your Company" : view === "harnesses" ? "Agent Inventory" : "Co-Build Hub"}</p>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            Fellow
            <select value={fellowId} onChange={(event) => setFellowId(event.target.value)} className="rounded border border-stone-300 bg-white px-2 py-1 text-stone-900">
              <option value="ari">Ari</option>
              <option value="maya">Maya</option>
              <option value="leo">Leo</option>
            </select>
          </label>
        </header>

        {gaps === undefined ? (
          <div className="p-8 text-stone-500">Loading your company state…</div>
        ) : view === "home" ? (
          <HomeView
            fellowName={fellowName}
            nudge={nudge}
            generating={Boolean(nudge && generatingId === nudge._id)}
            generateError={generateError}
            onCompany={() => setView("company")}
            onGenerate={() => {
              if (nudge) void generateGap(nudge);
            }}
          />
        ) : view === "harnesses" ? (
          <HarnessView
            gaps={gaps}
            generatingId={generatingId}
            generateError={generateError}
            onRun={(gap) => void generateGap(gap)}
          />
        ) : (
          <CompanyView
            gaps={companyGaps}
            selectedTab={companyTab}
            onSelectTab={setCompanyTab}
            highlightGapId={highlightGapId}
            eveResults={eveResults}
            generatingId={generatingId}
            generateError={generateError}
            onRun={(gap) => void generateGap(gap)}
          />
        )}
      </main>
    </div>
  );
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</p><div className="space-y-1">{children}</div></section>;
}

function NavItem({ label, onClick, active = false }: { label: string; onClick: () => void; active?: boolean }) {
  return <button onClick={onClick} className={`block w-full rounded px-3 py-2 text-left transition ${active ? "bg-white/10 text-white" : "text-stone-300 hover:bg-white/5"}`}>{label}</button>;
}

function HomeView({
  fellowName,
  nudge,
  generating,
  generateError,
  onCompany,
  onGenerate,
}: {
  fellowName: string;
  nudge: Gap | undefined;
  generating: boolean;
  generateError: string | null;
  onCompany: () => void;
  onGenerate: () => void;
}) {
  return <section className="mx-auto max-w-6xl p-6 lg:p-10">
    <p className="text-xs font-semibold uppercase tracking-wide text-[#d65a38]">Your day</p>
    <h1 className="mt-2 text-3xl font-semibold">Good afternoon, {fellowName}.</h1>
    <p className="mt-2 max-w-2xl text-stone-600">Your company state and the next useful agent action, in one place.</p>
    {nudge ? (
      <article className="mt-8 border-t-2 border-[#d65a38] bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#d65a38]">A personal next step</p>
        <h2 className="mt-3 text-xl font-semibold">{fellowName} — you haven&apos;t created a {nudge.label.toLowerCase()} yet, {nudge.contextNote}.</h2>
        <p className="mt-3 text-sm text-stone-600">{nudge.matchedAgentName ?? "Agent"} <span className="ml-2 rounded bg-stone-100 px-2 py-1 text-xs font-medium">{eveBadge(nudge.label)}</span></p>
        <button
          data-testid="run-pitchDeck"
          onClick={onGenerate}
          disabled={generating}
          className="mt-5 bg-[#c75031] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a93f26] disabled:cursor-wait disabled:opacity-70"
        >
          {generating ? "Generating with Eve…" : "Generate it"}
        </button>
        {generateError ? <p className="mt-3 text-sm text-rose-700">{generateError}</p> : null}
      </article>
    ) : (
      <article className="mt-8 border border-emerald-200 bg-emerald-50 p-7"><h2 className="text-lg font-semibold text-emerald-800">Your contextual nudges are clear.</h2></article>
    )}
    <button onClick={onCompany} className="mt-8 border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">Open Your Company →</button>
  </section>;
}

function HarnessView({
  gaps,
  generatingId,
  generateError,
  onRun,
}: {
  gaps: Gap[];
  generatingId: string | null;
  generateError: string | null;
  onRun: (gap: Gap) => void;
}) {
  return <section className="mx-auto max-w-6xl p-6 lg:p-10">
    <p className="text-xs font-semibold uppercase tracking-wide text-[#d65a38]">Agent Inventory</p>
    <h1 className="mt-2 text-3xl font-semibold">Offering harnesses</h1>
    <p className="mt-2 text-stone-600">One company state, organised by the delivery system that can move it forward.</p>
    {generateError ? <p className="mt-4 text-sm text-rose-700">{generateError}</p> : null}
    <div className="mt-8 grid gap-5 xl:grid-cols-3">
      {harnesses.map((harness) => {
        const harnessGaps = gaps.filter((gap) => gap.harnessId === harness.id);
        return <article key={harness.id} className="border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Engine: {harness.engine}</p>
          <h2 className="mt-2 text-xl font-semibold">{harness.name}</h2>
          <div className="mt-5 divide-y divide-stone-100">
            {harnessGaps.map((gap) => (
              <div key={gap._id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{gap.subModuleId}</p>
                  <p className="text-sm text-stone-500">{gap.label}</p>
                  <UpdateMetadata gap={gap} />
                  {EVE_GAPS.has(gap.label) && gap.status !== "done" ? (
                    <button
                      data-testid={`run-${gap.osFieldKey}`}
                      onClick={() => onRun(gap)}
                      disabled={generatingId !== null}
                      className="mt-2 bg-[#c75031] px-3 py-1 text-xs font-semibold text-white hover:bg-[#a93f26] disabled:cursor-wait disabled:opacity-70"
                    >
                      {generatingId === gap._id ? "Generating with Eve…" : "Generate it"}
                    </button>
                  ) : null}
                </div>
                <Status status={gap.status} />
              </div>
            ))}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function CompanyView({
  gaps,
  selectedTab,
  onSelectTab,
  highlightGapId,
  eveResults,
  generatingId,
  generateError,
  onRun,
}: {
  gaps: Gap[];
  selectedTab: (typeof companyTabs)[number];
  onSelectTab: (tab: (typeof companyTabs)[number]) => void;
  highlightGapId?: Gap["_id"];
  eveResults: Record<string, EveResult>;
  generatingId: string | null;
  generateError: string | null;
  onRun: (gap: Gap) => void;
}) {
  return <section className="p-6 lg:p-10">
    <p className="text-xs font-semibold uppercase tracking-wide text-[#d65a38]">Company · Data room</p>
    <h1 className="mt-2 text-3xl font-semibold">Your Company</h1>
    <p className="mt-2 text-stone-600">Evidence, working assets, and the agents that can create what is missing.</p>
    {generateError ? <p className="mt-4 text-sm text-rose-700">{generateError}</p> : null}
    <div className="mt-8 grid border-y border-stone-200 bg-white sm:grid-cols-3 lg:grid-cols-6">
      {companyTabs.map((tab, index) => <button key={tab} onClick={() => onSelectTab(tab)} className={`border-b-2 p-4 text-left ${selectedTab === tab ? "border-[#d65a38] bg-stone-50" : "border-transparent"}`}><span className="block text-xs text-stone-400">0{index + 1}</span><span className="mt-1 block font-semibold">{tab}</span></button>)}
    </div>
    <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {gaps.map((gap) => (
        <article
          key={gap._id}
          className={`border bg-white p-5 shadow-sm ${highlightGapId === gap._id ? "border-[#d65a38]" : "border-stone-200"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{gap.osFieldKey}</p>
              <h2 className="mt-2 text-lg font-semibold">{gap.label}</h2>
            </div>
            <Status status={eveResults[gap._id]?.reviewNote && gap.status !== "done" ? "in_progress" : gap.status} />
          </div>
          <p className="mt-3 text-sm text-stone-600">{gap.harnessId} · {gap.subModuleId}</p>
          <UpdateMetadata gap={gap} />
          {gap.matchedAgentName && (
            <p className="mt-4 text-sm font-medium">
              Matched: {gap.matchedAgentName}{" "}
              <span className="ml-1 rounded bg-stone-100 px-1.5 py-1 text-xs">
                {eveBadge(gap.label)}
              </span>
            </p>
          )}
          {EVE_GAPS.has(gap.label) && gap.status !== "done" ? (
            <button
              data-testid={`run-${gap.osFieldKey}`}
              onClick={() => onRun(gap)}
              disabled={generatingId !== null}
              className="mt-4 bg-[#c75031] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a93f26] disabled:cursor-wait disabled:opacity-70"
            >
              {generatingId === gap._id ? "Generating with Eve…" : "Generate it"}
            </button>
          ) : null}
          {eveResults[gap._id] ? (
            <div className="mt-4">
              {eveResults[gap._id].sessionId ? (
                <p className="mb-2 text-xs text-stone-500">Eve session {eveResults[gap._id].sessionId}</p>
              ) : null}
              {eveResults[gap._id].reviewNote ? (
                <p data-testid="eve-skill-review" className="mb-2 text-sm text-amber-800">
                  {eveResults[gap._id].reviewNote}
                </p>
              ) : null}
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-3 text-xs text-stone-700 ring-1 ring-stone-200">
                {eveResults[gap._id].message}
              </pre>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  </section>;
}

function Status({ status }: { status: "missing" | "in_progress" | "done" }) {
  return <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(status)}`}>{status.replace("_", " ")}</span>;
}

function UpdateMetadata({ gap }: { gap: Gap }) {
  if (!gap.lastUpdatedBy || !gap.lastUpdatedAt) return null;
  return <p className="mt-1 text-xs text-stone-500">Updated by {gap.lastUpdatedBy} · {new Date(gap.lastUpdatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" })} UTC</p>;
}
