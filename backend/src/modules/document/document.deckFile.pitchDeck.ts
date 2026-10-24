import type { SlideXml } from "./document.deckFile.engine.js";
import type { DeckFileTemplate } from "./document.deckFile.schema.js";

/**
 * Pitch Deck (frontend/Templates/PPTX Templates/Pitch Deck.pptx).
 *
 * Shape names ("Text 3", "Shape 8") are the ones inside that file. Limits are
 * sized to what each text box in the design holds at its font size.
 */

const DARK = "5B3FD1";
const MUTED_DOT = "B7B2BF";

const upper = (s: string) => s.toUpperCase();

/** Shrinks big display text so a longer value still fits its box. */
const fitDisplay = (s: SlideXml, name: string, text: string, sizes: Array<[number, number]>) => {
  s.setText(name, text);
  for (const [overLen, sz] of sizes) {
    if (text.length > overLen) {
      s.setFontSize(name, sz);
      return;
    }
  }
};

export const PITCH_DECK: DeckFileTemplate = {
  key: "pitch-deck",
  file: "pitch-deck.pptx",
  label: "Pitch Deck",
  dropOrder: ["product", "competition", "team", "market", "model", "traction", "solution", "problem", "ask"],
  fontMap: { "Bricolage Grotesque": "Calibri", Geist: "Calibri", "Geist Mono": "Consolas" },
  guidance:
    "An investor pitch deck, one idea per slide, told as a story: problem, solution, product, market, business model, traction, competition, team, the ask. Numbers and claims must come from the user's material; if they gave none and the request is clearly a sample or example, invent plausible fictional ones and keep them internally consistent (the market sizes nest, the allocation adds to 100, the model's unit economics add up). Never use real people's names.",
  slides: [
    {
      id: "title",
      source: 1,
      purpose: "Opening slide: company name, one-line pitch, round and date, presenter.",
      schema: {
        monogram: { type: "string", max: 1, hint: "one letter, the logo mark (first letter of the company)" },
        eyebrow: { type: "string", max: 40, hint: 'round and date, e.g. "Seed round - October 2026"' },
        title: { type: "string", max: 14, hint: "company or product name" },
        tagline: { type: "string", max: 100, hint: "one sentence on what it does" },
        presenter: { type: "string", max: 32, hint: "presenter name" },
        role: { type: "string", max: 44, hint: "presenter role" },
      },
      apply: (s, d) => {
        s.setText("Text 1", upper(d.monogram).slice(0, 1));
        s.setText("Text 2", upper(d.eyebrow));
        fitDisplay(s, "Text 3", d.title, [[14, 9000], [10, 11500]]);
        s.setText("Text 4", d.tagline);
        s.setText("Text 5", d.presenter);
        s.setText("Text 6", d.role);
      },
    },
    {
      id: "problem",
      source: 2,
      purpose: "The problem: a bold statement plus three pain points.",
      schema: {
        heading: { type: "string", max: 80, hint: "the problem as one sentence" },
        points: {
          type: "list",
          min: 3,
          max: 3,
          item: {
            title: { type: "string", max: 32, hint: "short pain point" },
            body: { type: "string", max: 95, hint: "one sentence of evidence" },
          },
        },
      },
      apply: (s, d) => {
        s.setText("Text 1", d.heading);
        const names = [[4, 5], [8, 9], [13, 14]];
        d.points.forEach((p: any, i: number) => {
          s.setText(`Text ${names[i][0]}`, p.title);
          s.setText(`Text ${names[i][1]}`, p.body);
        });
      },
    },
    {
      id: "solution",
      source: 3,
      purpose: "The solution: a statement plus three headline facts shown as cards.",
      schema: {
        heading: { type: "string", max: 64, hint: "what the company does for whom" },
        cards: {
          type: "list",
          min: 3,
          max: 3,
          item: {
            big: { type: "string", max: 7, hint: 'the number or value, e.g. "$140", "2 km", "12:30"' },
            title: { type: "string", max: 22, hint: "what the number means" },
            body: { type: "string", max: 80, hint: "one short sentence" },
          },
        },
      },
      apply: (s, d) => {
        s.setText("Text 1", d.heading);
        const names = [[3, 4, 5], [7, 8, 9], [11, 12, 13]];
        d.cards.forEach((c: any, i: number) => {
          fitDisplay(s, `Text ${names[i][0]}`, c.big, [[5, 7000]]);
          s.setText(`Text ${names[i][1]}`, c.title);
          s.setText(`Text ${names[i][2]}`, c.body);
        });
      },
    },
    {
      id: "product",
      source: 4,
      purpose: "The product: a statement plus three key features.",
      schema: {
        heading: { type: "string", max: 36, hint: "what the product lets you do" },
        features: {
          type: "list",
          min: 3,
          max: 3,
          item: {
            lead: { type: "string", max: 18, hint: "feature name (shown bold)" },
            rest: { type: "string", max: 40, hint: "what it does, continuing the lead" },
          },
        },
      },
      apply: (s, d) => {
        s.setText("Text 1", d.heading);
        d.features.forEach((f: any, i: number) => {
          s.setRuns(`Text ${3 + i * 2}`, [`${f.lead} `, f.rest]);
        });
      },
    },
    {
      id: "market",
      source: 5,
      purpose: "Market size as three nested tiers (TAM > SAM > SOM).",
      schema: {
        heading: { type: "string", max: 48, hint: "the headline market size" },
        tiers: {
          type: "list",
          min: 3,
          max: 3,
          hint: "TAM, then SAM, then SOM; each smaller than the last",
          item: {
            value: { type: "string", max: 9, hint: 'e.g. "$9B", "$2.1B", "$180M"' },
            note: { type: "string", max: 44, maxAt: [44, 34, 22], hint: "what the tier counts" },
          },
        },
      },
      apply: (s, d) => {
        s.setText("Text 1", d.heading);
        const rows = [
          { val: "Text 4", note: "Text 5", barEnd: 90 + 1080 + 0 },
          { val: "Text 8", note: "Text 9", barEnd: 270 + 691 },
          { val: "Text 12", note: "Text 13", barEnd: 270 + 367 },
        ];
        d.tiers.forEach((t: any, i: number) => {
          const r = rows[i];
          s.setText(r.val, t.value);
          s.setText(r.note, t.note);
          const box = s.getBox(r.note);
          s.setBox(r.note, { w: Math.max(r.barEnd - 24 - box.x, 100) });
        });
      },
    },
    {
      id: "model",
      source: 6,
      purpose: "Business model: the price point and the unit economics per sale.",
      schema: {
        heading: { type: "string", max: 40, hint: "how the company makes money" },
        amount: { type: "string", max: 8, hint: 'headline price or revenue figure, e.g. "$2,800"' },
        caption: { type: "string", max: 50, hint: "what the figure is per what" },
        tableTitle: { type: "string", max: 32, hint: 'e.g. "Unit economics per meal"' },
        rows: {
          type: "list",
          min: 4,
          max: 4,
          hint: "first row is the price/revenue, the next three are costs shown as negatives",
          item: {
            label: { type: "string", max: 26, hint: "line item" },
            value: { type: "string", max: 10, hint: 'amount; costs start with a minus, e.g. "-$22"' },
          },
        },
        total: {
          type: "object",
          hint: "the result line",
          fields: {
            label: { type: "string", max: 24, hint: 'e.g. "Contribution margin"' },
            value: { type: "string", max: 14, hint: 'e.g. "$31 - 22%"' },
          },
        },
      },
      apply: (s, d) => {
        s.setText("Text 1", d.heading);
        fitDisplay(s, "Text 2", d.amount, [[8, 9000], [6, 10500]]);
        s.setText("Text 3", d.caption);
        s.setText("Text 4", d.tableTitle);
        const names = [[6, 7], [9, 10], [12, 13], [15, 16]];
        d.rows.forEach((r: any, i: number) => {
          const [l, v] = names[i];
          s.setText(`Text ${l}`, r.label);
          s.setBox(`Text ${l}`, { w: 380 });
          s.setText(`Text ${v}`, r.value);
          s.setBox(`Text ${v}`, { x: 1056, w: 300 });
          s.setAlign(`Text ${v}`, "r");
        });
        s.setText("Text 18", d.total.label);
        s.setBox("Text 18", { w: 420 });
        s.setText("Text 19", d.total.value);
        s.setBox("Text 19", { x: 1006, w: 350 });
        s.setAlign("Text 19", "r");
      },
    },
    {
      id: "traction",
      source: 7,
      purpose: "Traction: one big headline number, two supporting stats and a growth chart.",
      schema: {
        big: { type: "string", max: 7, hint: 'the headline number, e.g. "3,400"' },
        caption: { type: "string", max: 30, hint: "what the number counts" },
        stats: {
          type: "list",
          min: 2,
          max: 2,
          item: {
            value: { type: "string", max: 8, hint: 'e.g. "38%"' },
            label: { type: "string", max: 30, hint: "what it measures" },
          },
        },
        bars: {
          type: "list",
          min: 5,
          max: 8,
          hint: "the growth series, oldest first; the last bar is highlighted and should match the headline number",
          item: {
            label: { type: "string", max: 6, hint: 'period, e.g. "Mar"' },
            value: { type: "number", min: 0, max: 1e12, hint: "the value for that period" },
          },
        },
      },
      apply: (s, d) => {
        fitDisplay(s, "Text 1", d.big, [[7, 11000], [5, 13500]]);
        s.setText("Text 2", d.caption);
        d.stats.forEach((st: any, i: number) => {
          s.setText(`Text ${4 + i * 2}`, st.value);
          s.setText(`Text ${5 + i * 2}`, st.label);
        });
        const n = d.bars.length;
        const peak = Math.max(...d.bars.map((b: any) => b.value), 1);
        const bottom = 682;
        const maxH = 592;
        const skip = 8 - n;
        for (let slot = 0; slot < 8; slot++) {
          if (slot < skip) {
            s.remove(`Shape ${8 + slot}`);
            s.remove(`Text ${16 + slot}`);
            continue;
          }
          const bar = d.bars[slot - skip];
          const h = Math.max(36, Math.round((bar.value / peak) * maxH));
          s.setBox(`Shape ${8 + slot}`, { y: bottom - h, h });
          s.setText(`Text ${16 + slot}`, bar.label);
        }
      },
    },
    {
      id: "competition",
      source: 8,
      purpose: "Competition: a comparison matrix where the company wins on every criterion.",
      schema: {
        heading: { type: "string", max: 48, hint: "why this company is the only complete option" },
        criteria: { type: "list", min: 4, max: 4, item: { name: { type: "string", max: 16, hint: "a buying criterion" } } },
        us: { type: "string", max: 18, hint: "the company name (highlighted row, ticks every criterion)" },
        rivals: {
          type: "list",
          min: 3,
          max: 3,
          item: {
            name: { type: "string", max: 26, hint: "a competitor or alternative" },
            has: { type: "bools", length: 4, hint: "does it meet each of the 4 criteria, in order" },
          },
        },
      },
      apply: (s, d) => {
        s.setText("Text 1", d.heading);
        d.criteria.forEach((c: any, i: number) => s.setText(`Text ${2 + i}`, c.name));
        s.setText("Text 7", d.us);
        const rows = [
          { name: "Text 17", cells: [19, 21, 23, 25] },
          { name: "Text 27", cells: [29, 31, 33, 35] },
          { name: "Text 36", cells: [37, 38, 39, 40] },
        ];
        d.rivals.forEach((r: any, i: number) => {
          s.setText(rows[i].name, r.name);
          rows[i].cells.forEach((cell, c) => {
            const yes = r.has[c] === true;
            s.setText(`Text ${cell}`, yes ? "●" : "–");
            s.setTextColor(`Text ${cell}`, yes ? DARK : MUTED_DOT);
          });
        });
      },
    },
    {
      id: "team",
      source: 9,
      purpose: "Team: four people with their role and the experience that matters.",
      schema: {
        heading: { type: "string", max: 48, hint: "why this team can win" },
        people: {
          type: "list",
          min: 4,
          max: 4,
          item: {
            name: { type: "string", max: 22, hint: "full name" },
            role: { type: "string", max: 24, hint: "title" },
            bio: { type: "string", max: 62, hint: "one line of relevant experience" },
          },
        },
      },
      apply: (s, d) => {
        s.setText("Text 1", d.heading);
        d.people.forEach((p: any, i: number) => {
          s.setText(`Text ${2 + i * 3}`, p.name);
          s.setText(`Text ${3 + i * 3}`, p.role);
          s.setText(`Text ${4 + i * 3}`, p.bio);
        });
      },
    },
    {
      id: "ask",
      source: 10,
      purpose: "The ask: the amount raised, what it achieves, and how the money is split.",
      schema: {
        amount: { type: "string", max: 7, hint: 'e.g. "$2.5M"' },
        summary: { type: "string", max: 140, hint: "what the round achieves and by when" },
        use: {
          type: "list",
          min: 4,
          max: 4,
          hint: "use of funds, largest first; percentages add up to 100",
          item: {
            pct: { type: "number", min: 5, max: 70, hint: "percent of the round" },
            label: { type: "string", max: 22, hint: "what the money is spent on" },
          },
        },
        contact: { type: "string", max: 36, hint: "email or website" },
        brand: { type: "string", max: 14, hint: "company name" },
      },
      apply: (s, d) => {
        fitDisplay(s, "Text 1", d.amount, [[7, 12000], [5, 14500]]);
        s.setBox("Text 1", { w: 560 });
        s.setText("Text 2", d.summary);
        s.setBox("Text 2", { x: 665, w: 685 });

        const total = d.use.reduce((sum: number, u: any) => sum + u.pct, 0) || 1;
        const gap = 4;
        const span = 1260 - gap * 3;
        let x = 90;
        d.use.forEach((u: any, i: number) => {
          const w = Math.round((u.pct / total) * span);
          s.setBox(`Shape ${3 + i}`, { x, w });
          s.setText(`Text ${7 + i * 2}`, `${Math.round(u.pct)}%`);
          s.setBox(`Text ${7 + i * 2}`, { x, w: Math.max(w - 6, 60) });
          s.setText(`Text ${8 + i * 2}`, u.label);
          s.setBox(`Text ${8 + i * 2}`, { x, w: Math.max(w - 6, 60) });
          x += w + gap;
        });

        s.setText("Text 15", d.contact);
        s.setBox("Text 15", { w: 700 });
        s.setText("Text 16", d.brand);
        s.setBox("Text 16", { x: 1000, w: 360 });
        s.setAlign("Text 16", "r");
      },
    },
  ],
};
