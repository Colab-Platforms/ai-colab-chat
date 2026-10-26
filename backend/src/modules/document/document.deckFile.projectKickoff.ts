import type { SlideXml } from "./document.deckFile.engine.js";
import type { DeckFileTemplate } from "./document.deckFile.schema.js";
import { list, num, pad2, str, upper } from "./document.deckFile.helpers.js";

/** Project Kickoff (frontend/Templates/PPTX Templates/Project Kickoff.pptx). */

const page = (s: SlideXml, name: string, pos: number, total: number) =>
  s.setText(name, `${pad2(pos)} / ${pad2(total)}`);

const MONTH_LABELS = [5, 7, 9, 11, 13, 15, 17, 19];

export const PROJECT_KICKOFF: DeckFileTemplate = {
  key: "project-kickoff",
  file: "project-kickoff.pptx",
  label: "Project Kickoff",
  fontMap: { "Red Hat Display": "Calibri", "Red Hat Mono": "Consolas" },
  dropOrder: ["week", "actions", "risks", "team", "scope", "plan", "why"],
  guidance:
    "A project kickoff deck in the style of an engineering drawing: the project and its goal, why now, scope, who owns what, the plan, the risks, the weekly rhythm, and the first actions. Facts and dates must come from the user's material; if they gave none and the request is clearly a sample or example, invent plausible fictional ones that agree with each other. Never use real people's names.",
  slides: [
    {
      id: "cover",
      source: 1,
      purpose: "Opening slide: project name, one-line goal, lead, date.",
      schema: {
        eyebrow: str(36, 'drawing-style label, e.g. "DWG-001 - Project kickoff"'),
        first: str(10, "first word of the project name"),
        second: str(12, "second word of the project name"),
        goal: str(90, "the goal in one sentence"),
        lead: str(40, "project lead, then team, e.g. Name - Team"),
        date: str(12, 'kickoff date, e.g. "03.03.27"'),
        rev: str(3, 'revision letter, e.g. "A"'),
      },
      apply: (s, d, ctx) => {
        s.setText("Text 2", upper(d.eyebrow));
        s.setRuns("Text 3", [`${upper(d.first)} `, upper(d.second)]);
        // The file draws the second word in black on navy; use the accent so it reads.
        s.setRunColor("Text 3", 1, "F4D35E");
        const longest = Math.max(d.first.length, d.second.length + 1, 4);
        s.setFontSize("Text 3", Math.min(16500, Math.floor(1230 / (longest * 0.66)) * 100));
        s.setText("Text 4", d.goal);
        s.setText("Text 8", d.lead);
        s.setText("Text 11", d.date);
        s.setText("Text 14", upper(d.rev));
        page(s, "Text 16", ctx.pos, ctx.total);
      },
    },
    {
      id: "why",
      source: 2,
      purpose: "Why now: the current system or process, and three problems it causes, each with a number.",
      schema: {
        heading: str(40, "why the project is needed"),
        current: str(28, "the current system or process"),
        problems: list(3, 3, {
          value: str(9, 'the number, e.g. "3.5 hrs", "2.8%"'),
          label: str(36, "what it measures"),
        }),
      },
      apply: (s, d, ctx) => {
        s.setText("Text 1", `${pad2(ctx.pos)} · WHY NOW`);
        s.setBox("Text 1", { w: 400 });
        s.fitBlock("Text 2", d.heading);
        s.setText("Text 5", d.current);
        const names = [[12, 13], [15, 16], [18, 19]];
        d.problems.forEach((p: any, i: number) => {
          s.fitOneLine(`Text ${names[i][0]}`, p.value, 0.6);
          s.setText(`Text ${names[i][1]}`, p.label);
          s.setBox(`Text ${names[i][1]}`, { w: 320 });
        });
        s.setText("Text 20", `SHEET ${pad2(ctx.pos)} / ${pad2(ctx.total)}`);
      },
    },
    {
      id: "scope",
      source: 3,
      purpose: "Scope: what is in and what is out.",
      schema: {
        heading: str(14, 'e.g. "Scope"'),
        inScope: list(3, 4, { item: str(30, "an in-scope item") }),
        outScope: list(2, 3, { item: str(30, "an out-of-scope item") }),
      },
      apply: (s, d, ctx) => {
        s.fitOneLine("Text 2", d.heading, 0.55);
        page(s, "Text 3", ctx.pos, ctx.total);
        [6, 7, 8, 9].forEach((n, i) => {
          if (i >= d.inScope.length) return s.remove(`Text ${n}`);
          s.setBox(`Text ${n}`, { w: 620 });
          s.fitOneLine(`Text ${n}`, `[x] ${d.inScope[i].item}`, 0.58);
        });
        [11, 12, 13].forEach((n, i) => {
          if (i >= d.outScope.length) return s.remove(`Text ${n}`);
          s.setBox(`Text ${n}`, { w: 620 });
          s.fitOneLine(`Text ${n}`, `[ ] ${d.outScope[i].item}`, 0.58);
        });
      },
    },
    {
      id: "team",
      source: 4,
      purpose: "Who owns what: sponsor, project lead, and four workstream owners.",
      schema: {
        heading: str(20, 'e.g. "Who owns what"'),
        sponsor: str(30, "sponsor, name and title"),
        lead: str(14, "project lead name"),
        streams: list(4, 4, {
          label: str(12, "workstream, e.g. Tech"),
          owner: str(22, "who owns it"),
        }),
      },
      apply: (s, d, ctx) => {
        s.fitOneLine("Text 1", d.heading, 0.55);
        page(s, "Text 2", ctx.pos, ctx.total);
        s.setText("Text 5", d.sponsor);
        s.fitOneLine("Text 9", d.lead, 0.58);
        const cols = [
          { label: 14, owner: 15, x: 83 },
          { label: 18, owner: 19, x: 409 },
          { label: 22, owner: 23, x: 735 },
          { label: 26, owner: 27, x: 1061 },
        ];
        d.streams.forEach((st: any, i: number) => {
          const c = cols[i];
          s.setText(`Text ${c.label}`, upper(st.label));
          s.setBox(`Text ${c.owner}`, { x: c.x + 8, w: 281 });
          s.fitOneLine(`Text ${c.owner}`, st.owner, 0.55);
        });
      },
    },
    {
      id: "plan",
      source: 5,
      purpose: "The plan: five workstreams on an eight-month timeline, plus a final milestone.",
      schema: {
        heading: str(28, 'e.g. "Plan - Mar to Oct"'),
        months: list(8, 8, { name: str(4, 'month, e.g. "MAR"') }, "eight consecutive months, in order"),
        tasks: list(5, 5, {
          label: str(26, "workstream"),
          start: num(0, 7, "first month, 0 = first month listed"),
          end: num(0, 7, "last month, same scale, at or after start"),
        }),
        milestone: str(26, "the final milestone, e.g. switch off the old system"),
        milestoneMonth: num(0, 7, "month of the milestone, same scale"),
      },
      apply: (s, d, ctx) => {
        s.fitOneLine("Text 2", d.heading, 0.55);
        s.setBox("Text 2", { w: 900 });
        page(s, "Text 3", ctx.pos, ctx.total);
        d.months.forEach((m: any, i: number) => s.setText(`Text ${MONTH_LABELS[i]}`, upper(m.name)));
        const rows = [
          { label: 21, bar: 22 },
          { label: 24, bar: 25 },
          { label: 27, bar: 28 },
          { label: 30, bar: 31 },
          { label: 33, bar: 34 },
        ];
        d.tasks.forEach((t: any, i: number) => {
          const start = Math.min(Math.max(Math.round(t.start), 0), 7);
          const end = Math.min(Math.max(Math.round(t.end), start), 7);
          s.setText(`Text ${rows[i].label}`, t.label);
          s.setBox(`Shape ${rows[i].bar}`, { x: 343 + start * 133, w: (end - start + 1) * 133 - 9 });
        });
        s.setText("Text 36", d.milestone);
        const m = Math.min(Math.max(Math.round(d.milestoneMonth), 0), 7);
        s.setBox("Shape 37", { x: 343 + m * 133 + 45 });
      },
    },
    {
      id: "risks",
      source: 6,
      purpose: "Risk matrix: four risks placed by impact and likelihood, each with a mitigation. Risk A is the most severe.",
      schema: {
        heading: str(18, 'e.g. "Risk matrix"'),
        risks: list(4, 4, {
          title: str(44, "the risk"),
          mitigation: str(56, "how it is handled"),
          impact: num(0, 100, "0 = low impact, 100 = high"),
          likelihood: num(0, 100, "0 = unlikely, 100 = very likely"),
        }, "ordered most severe first"),
      },
      apply: (s, d, ctx) => {
        s.fitOneLine("Text 1", d.heading, 0.55);
        page(s, "Text 2", ctx.pos, ctx.total);
        const dots = [
          { dot: 12, letter: 13 },
          { dot: 14, letter: 15 },
          { dot: 16, letter: 17 },
          { dot: 18, letter: 19 },
        ];
        const rows = [[21, 22], [24, 25], [27, 28], [30, 31]];
        d.risks.forEach((r: any, i: number) => {
          const x = 116 + (Math.min(Math.max(r.impact, 0), 100) / 100) * 520;
          const y = 706 - 48 - (Math.min(Math.max(r.likelihood, 0), 100) / 100) * 490;
          s.setBox(`Shape ${dots[i].dot}`, { x, y });
          s.setBox(`Text ${dots[i].letter}`, { x: x - 3, y });
          s.setText(`Text ${rows[i][0]}`, r.title);
          s.setText(`Text ${rows[i][1]}`, r.mitigation);
        });
      },
    },
    {
      id: "week",
      source: 7,
      purpose: "A typical project week: five days, each with a time or tag and what happens.",
      schema: {
        heading: str(28, 'e.g. "A typical project week"'),
        days: list(5, 5, {
          tag: str(10, 'time or tag only, never the day name, e.g. "10:00", "ALL DAY", "FOCUS"'),
          what: str(24, "the meeting or work"),
        }, "Monday to Friday"),
        tools: str(40, "tools used"),
        decisions: str(60, "how decisions are made"),
      },
      apply: (s, d, ctx) => {
        s.fitOneLine("Text 2", d.heading, 0.55);
        s.setBox("Text 2", { w: 900 });
        page(s, "Text 3", ctx.pos, ctx.total);
        const names = [[7, 8], [12, 13], [17, 18], [22, 23], [26, 27]];
        d.days.forEach((day: any, i: number) => {
          s.setText(`Text ${names[i][0]}`, upper(day.tag));
          s.fitBlock(`Text ${names[i][1]}`, day.what, 0.6, 1.15);
        });
        s.setText("Text 29", `TOOLS · ${d.tools}`);
        s.setBox("Text 29", { w: 400 });
        s.setText("Text 30", `DECISIONS · ${d.decisions}`);
        s.setBox("Text 30", { x: 490, w: 880 });
      },
    },
    {
      id: "actions",
      source: 8,
      purpose: "Action log: four immediate actions with owner and due date.",
      schema: {
        heading: str(18, 'e.g. "Action log"'),
        actions: list(4, 4, {
          action: str(60, "what needs doing"),
          owner: str(16, "first name or team"),
          due: str(10, 'date, e.g. "05.03"'),
        }),
      },
      apply: (s, d, ctx) => {
        s.fitOneLine("Text 2", d.heading, 0.55);
        page(s, "Text 3", ctx.pos, ctx.total);
        const rows = [[9, 11, 13, 15], [17, 19, 21, 23], [25, 27, 29, 31], [33, 35, 37, 39]];
        d.actions.forEach((a: any, i: number) => {
          s.setText(`Text ${rows[i][0]}`, `A-${pad2(i + 1)}`);
          s.setText(`Text ${rows[i][1]}`, a.action);
          s.setText(`Text ${rows[i][2]}`, a.owner);
          s.setText(`Text ${rows[i][3]}`, a.due);
        });
      },
    },
  ],
};
