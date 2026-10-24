import type { DeckFileTemplate } from "./document.deckFile.schema.js";
import { list, num, quoted, str } from "./document.deckFile.helpers.js";

/**
 * Marketing Plan (frontend/Templates/PPTX Templates/Marketing Plan.pptx).
 * Shape names are the ones inside that file.
 */
export const MARKETING_PLAN: DeckFileTemplate = {
  key: "marketing-plan",
  file: "marketing-plan.pptx",
  label: "Marketing Plan",
  fontMap: { "Young Serif": "Georgia", Figtree: "Calibri" },
  dropOrder: ["audience", "timeline", "kpis", "cost", "budget", "goals", "bigidea"],
  guidance:
    "A campaign marketing plan, warm and human, one idea per slide: the campaign, its goals, who it speaks to, the big idea, where the budget goes, what it costs, the timeline, and how success is measured. Numbers and facts must come from the user's material; if they gave none and the request is clearly a sample or example, invent plausible fictional ones that agree with each other (budget shares add to 100, phase costs add to the total). Never use real people's names.",
  slides: [
    {
      id: "cover",
      source: 1,
      purpose: "Opening slide: brand, campaign name, launch date.",
      schema: {
        brand: str(24, "brand or company name"),
        title: str(28, "the campaign name"),
        launch: str(9, 'launch date, short, e.g. "1 June"'),
      },
      apply: (s, d) => {
        s.setText("Text 0", d.brand);
        s.fitBlock("Text 1", d.title);
        s.fitOneLine("Text 6", d.launch);
      },
    },
    {
      id: "goals",
      source: 2,
      purpose: "The objective as a bold sentence plus three measurable goals shown as circles.",
      schema: {
        heading: str(70, "the campaign objective as one sentence"),
        goals: list(3, 3, {
          big: str(6, 'the number, e.g. "2M", "40k", "4.5"'),
          label: str(36, "what it measures"),
        }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 0", d.heading);
        const names = [[2, 3], [5, 6], [8, 9]];
        d.goals.forEach((g: any, i: number) => {
          s.fitOneLine(`Text ${names[i][0]}`, g.big);
          s.setText(`Text ${names[i][1]}`, g.label);
        });
      },
    },
    {
      id: "audience",
      source: 3,
      purpose: "Who the campaign talks to: two audience groups, each with a one-line quote.",
      schema: {
        heading: str(24, "short title, e.g. who we are talking to"),
        intro: str(80, "one sentence on what the two groups have in common"),
        groups: list(2, 2, {
          tag: str(30, 'age range and group, e.g. "22-30 - metro commuters"'),
          quote: str(60, "something a person in this group would say"),
        }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 0", d.heading);
        s.setText("Text 1", d.intro);
        const names = [[3, 4], [6, 7]];
        d.groups.forEach((g: any, i: number) => {
          s.setText(`Text ${names[i][0]}`, g.tag.toUpperCase());
          s.fitBlock(`Text ${names[i][1]}`, quoted(g.quote));
        });
      },
    },
    {
      id: "bigidea",
      source: 4,
      purpose: "The big idea: the single campaign line.",
      schema: { line: str(40, "the core campaign line, a short memorable sentence") },
      apply: (s, d) => s.fitBlock("Text 2", d.line, 0.52, 1.4),
    },
    {
      id: "budget",
      source: 5,
      purpose: "Where the money goes: channels with their share of the budget, as bars.",
      schema: {
        heading: str(40, 'e.g. "Where the money goes"'),
        channels: list(3, 5, {
          name: str(24, "channel"),
          pct: num(1, 100, "share of the budget in percent"),
        }, "largest first"),
      },
      apply: (s, d) => {
        s.fitBlock("Text 0", d.heading);
        const rows = [
          { label: 1, bar: 2, pct: 3 },
          { label: 4, bar: 5, pct: 6 },
          { label: 7, bar: 8, pct: 9 },
          { label: 10, bar: 11, pct: 12 },
          { label: 13, bar: 14, pct: 15 },
        ];
        const peak = Math.max(...d.channels.map((c: any) => c.pct), 1);
        rows.forEach((r, i) => {
          if (i >= d.channels.length) {
            s.remove(`Text ${r.label}`);
            s.remove(`Shape ${r.bar}`);
            s.remove(`Text ${r.pct}`);
            return;
          }
          const c = d.channels[i];
          const w = Math.max(Math.round((c.pct / peak) * 870), 150);
          s.setText(`Text ${r.label}`, c.name);
          s.setBox(`Shape ${r.bar}`, { w });
          s.setText(`Text ${r.pct}`, `${Math.round(c.pct)}%`);
          s.setBox(`Text ${r.pct}`, { x: 485, w: w - 29 });
        });
      },
    },
    {
      id: "cost",
      source: 6,
      purpose: "The total budget, how it splits across three phases, and the target cost per customer.",
      schema: {
        label: str(30, 'e.g. "Total budget, 12 weeks"'),
        total: str(7, 'the total, e.g. "$1.2M"'),
        phases: list(3, 3, {
          name: str(14, "phase name"),
          amount: str(8, 'cost, e.g. "$180K"'),
        }),
        perCustomer: str(8, "target cost to win one customer"),
      },
      apply: (s, d) => {
        s.setText("Text 0", d.label);
        s.setBox("Text 0", { y: 262 });
        s.fitOneLine("Text 1", d.total, 0.62);
        const names = [[5, 6], [8, 9], [11, 12]];
        d.phases.forEach((p: any, i: number) => {
          s.setText(`Text ${names[i][0]}`, p.name);
          s.setBox(`Text ${names[i][0]}`, { w: 300 });
          s.setText(`Text ${names[i][1]}`, p.amount);
          s.setBox(`Text ${names[i][1]}`, { x: 1100, w: 215 });
          s.setAlign(`Text ${names[i][1]}`, "r");
        });
        s.setBox("Text 14", { w: 300 });
        s.setText("Text 15", d.perCustomer);
        s.setBox("Text 15", { x: 1100, w: 213 });
        s.setAlign("Text 15", "r");
      },
    },
    {
      id: "timeline",
      source: 7,
      purpose: "The timeline as four phases, each with a start date and what happens.",
      schema: {
        heading: str(40, 'e.g. "Twelve weeks, four moments"'),
        phases: list(4, 4, {
          date: str(10, 'start date, short, e.g. "18 May"'),
          name: str(10, "one-word phase name"),
          note: str(60, "the key activity"),
        }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 0", d.heading);
        const names = [[3, 4, 5], [8, 9, 10], [13, 14, 15], [18, 19, 20]];
        d.phases.forEach((p: any, i: number) => {
          s.setText(`Text ${names[i][0]}`, p.date);
          s.fitOneLine(`Text ${names[i][1]}`, p.name, 0.55);
          s.setText(`Text ${names[i][2]}`, p.note);
        });
      },
    },
    {
      id: "kpis",
      source: 8,
      purpose: "How success is measured: up to four KPIs, and who reports them.",
      schema: {
        heading: str(32, 'e.g. "How we will know it worked"'),
        reporting: str(70, "how often and by whom it is reported"),
        kpis: list(4, 4, { name: str(30, "a metric to track") }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 0", d.heading);
        s.setText("Text 1", d.reporting);
        s.setBox("Text 1", { w: 640 });
        d.kpis.forEach((k: any, i: number) => s.setText(`Text ${4 + i * 2}`, k.name));
      },
    },
  ],
};
