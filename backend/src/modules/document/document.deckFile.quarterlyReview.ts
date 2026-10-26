import { freeformXml, type SlideXml } from "./document.deckFile.engine.js";
import type { DeckFileTemplate } from "./document.deckFile.schema.js";
import { estWidth, list, num, pad2, str, upper } from "./document.deckFile.helpers.js";

/** Quarterly Review (frontend/Templates/PPTX Templates/Quarterly Review.pptx). */

const pageNo = (s: SlideXml, name: string, pos: number) => s.setText(name, pad2(pos));

const GREEN = "0CA678";

export const QUARTERLY_REVIEW: DeckFileTemplate = {
  key: "quarterly-review",
  file: "quarterly-review.pptx",
  label: "Quarterly Review",
  fontMap: { Archivo: "Arial" },
  dropOrder: ["regions", "spotlight", "winsmisses", "priorities", "trend", "numbers", "close"],
  guidance:
    "A bold, data-first quarterly business review: the quarter, four headline numbers, a revenue trend, wins and misses, one spotlight number, revenue by region, next-quarter priorities, and a closing slide. Figures must come from the user's material; if they gave none and the request is clearly a sample or example, invent plausible fictional ones that agree with each other (the trend ends at the revenue figure, region values add up). Never use real people's names.",
  slides: [
    {
      id: "cover",
      source: 1,
      purpose: "Opening slide: company, quarter, report date, presenter.",
      schema: {
        company: str(24, "company name"),
        date: str(14, 'report date, e.g. "14 - 01 - 2027"'),
        quarter: str(3, 'the quarter, e.g. "Q3"'),
        title: str(40, 'e.g. "Quarterly business review FY27"'),
        presenter: str(50, "presenter name and role"),
      },
      apply: (s, d) => {
        s.setText("Text 1", upper(d.company));
        s.setBox("Text 1", { w: 400 });
        s.setText("Text 3", d.date);
        s.setBox("Text 3", { x: 1094, w: 300 });
        s.setAlign("Text 3", "r");
        s.fitOneLine("Text 4", upper(d.quarter), 0.72);
        s.fitBlock("Text 6", upper(d.title), 0.62);
        s.setText("Text 7", d.presenter);
      },
    },
    {
      id: "numbers",
      source: 2,
      purpose: "The numbers: four headline KPIs, each with its change since last quarter.",
      schema: {
        kpis: list(4, 4, {
          label: str(24, "metric name"),
          value: str(8, 'the figure, e.g. "$48.2M", "41.6%"'),
          change: str(8, 'change vs last quarter, e.g. "+18%", "Flat"'),
          tone: str(4, 'exactly "up" if good news, otherwise "down" or "flat"'),
        }),
      },
      apply: (s, d, ctx) => {
        pageNo(s, "Text 2", ctx.pos);
        const cells = [
          { label: 5, value: 6, chip: 7, chipText: 8, x: 60, chipY: 358 },
          { label: 10, value: 11, chip: 12, chipText: 13, x: 752, chipY: 358 },
          { label: 15, value: 16, chip: 17, chipText: 18, x: 60, chipY: 696 },
          { label: 20, value: 21, chip: 22, chipText: 23, x: 752, chipY: 692 },
        ];
        d.kpis.forEach((k: any, i: number) => {
          const c = cells[i];
          s.setText(`Text ${c.label}`, upper(k.label));
          s.setBox(`Text ${c.value}`, { w: 600 });
          s.fitOneLine(`Text ${c.value}`, k.value, 0.6);
          const size = s.getFontSize(`Text ${c.value}`);
          const valueW = Math.min(estWidth(k.value, size), 560);
          const chipW = Math.max(k.change.length * 14 + 34, 70);
          const chipX = c.x + valueW + 24;
          const up = /up/i.test(k.tone);
          s.setText(`Text ${c.chipText}`, k.change);
          s.setBox(`Shape ${c.chip}`, { x: chipX, w: chipW });
          s.setBox(`Text ${c.chipText}`, { x: chipX + 8, w: chipW - 12 });
          s.setFill(`Shape ${c.chip}`, up ? GREEN : "111111");
          s.setTextColor(`Text ${c.chipText}`, "FFFFFF");
        });
      },
    },
    {
      id: "trend",
      source: 3,
      purpose: "Revenue trend: six months as a line chart against a target.",
      schema: {
        lead: str(26, "headline, first part, e.g. DECEMBER BEAT TARGET"),
        highlight: str(12, "headline, highlighted part, e.g. BY 12%"),
        targetLabel: str(30, 'e.g. "TARGET $16M / MONTH"'),
        target: num(0, 1e12, "the target value, same unit as the points"),
        points: list(6, 6, {
          label: str(4, 'month, e.g. "JUL"'),
          value: num(0, 1e12, "monthly revenue"),
        }, "oldest first"),
        lastLabel: str(16, 'label for the last point, e.g. "DEC $17.9M"'),
      },
      apply: (s, d, ctx) => {
        pageNo(s, "Text 2", ctx.pos);
        s.setRuns("Text 3", [`${upper(d.lead)} `, upper(d.highlight)]);
        s.setBox("Text 3", { w: 1320 });
        const total = d.lead.length + d.highlight.length + 1;
        s.setFontSize("Text 3", Math.min(9000, Math.floor(1300 / (total * 0.7)) * 100));
        s.setText("Text 4", upper(d.targetLabel));
        s.setBox("Text 4", { w: 600 });

        s.removePicture("Image 0");

        const values: number[] = d.points.map((p: any) => p.value);
        const lo = Math.min(...values, d.target) * 0.78;
        const hi = Math.max(...values, d.target) * 1.06;
        const top = 300;
        const bottom = 720;
        const left = 60;
        const right = 1380;
        const yOf = (v: number) => bottom - ((v - lo) / Math.max(hi - lo, 1e-9)) * (bottom - top);
        const xs = values.map((_, i) => left + (i * (right - left)) / (values.length - 1));
        const pts = values.map((v, i): [number, number] => [xs[i], yOf(v)]);

        s.addShapesBehind(
          freeformXml({
            id: 901,
            name: "Chart area",
            points: [...pts, [right, bottom], [left, bottom]],
            closed: true,
            fill: { color: GREEN, alpha: 0.22 },
          }) +
            freeformXml({ id: 902, name: "Chart line", points: pts, line: { color: GREEN, widthPt: 5 } }) +
            freeformXml({
              id: 903,
              name: "Target line",
              points: [[left, yOf(d.target)], [right, yOf(d.target)]],
              line: { color: "FFFFFF", widthPt: 1.5, dashed: true },
            }),
        );
        s.setBox("Text 4", { y: Math.max(yOf(d.target) - 34, 215) });

        const labels = [5, 6, 7, 8, 9, 10];
        labels.forEach((n, i) => {
          const last = i === labels.length - 1;
          s.setText(`Text ${n}`, last ? upper(d.lastLabel) : upper(d.points[i].label));
          const w = last ? 200 : 100;
          const x = last ? right - w : Math.min(Math.max(xs[i] - w / 2, left), right - w);
          s.setBox(`Text ${n}`, { x, w });
          if (last) s.setAlign(`Text ${n}`, "r");
        });
      },
    },
    {
      id: "winsmisses",
      source: 4,
      purpose: "Wins and misses: three of each, one line apiece.",
      schema: {
        wins: list(3, 3, { text: str(52, "a win, one line") }),
        misses: list(3, 3, { text: str(52, "a miss, one line") }),
      },
      apply: (s, d, ctx) => {
        pageNo(s, "Text 2", ctx.pos);
        [8, 10, 11].forEach((n, i) => s.fitBlock(`Text ${n}`, d.wins[i].text, 0.52, 1.2));
        [16, 18, 19].forEach((n, i) => s.fitBlock(`Text ${n}`, d.misses[i].text, 0.52, 1.2));
      },
    },
    {
      id: "spotlight",
      source: 5,
      purpose: "Spotlight: the single most important number this quarter, with a short explanation.",
      schema: {
        label: str(32, 'e.g. "SPOTLIGHT - WEST REGION"'),
        big: str(6, 'the number, e.g. "+34%"'),
        text: str(70, "what the number means, one or two lines"),
      },
      apply: (s, d, ctx) => {
        s.setText("Text 1", upper(d.label));
        s.setBox("Text 1", { w: 600 });
        pageNo(s, "Text 2", ctx.pos);
        s.fitOneLine("Text 3", d.big, 0.7);
        s.fitBlock("Text 4", d.text, 0.55);
      },
    },
    {
      id: "regions",
      source: 6,
      purpose: "Revenue by region or business unit, as bars.",
      schema: {
        label: str(26, 'e.g. "REVENUE BY REGION"'),
        rows: list(3, 4, {
          name: str(8, "region or unit"),
          value: num(0, 1e12, "revenue, used for the bar length"),
          display: str(8, 'the value as shown, e.g. "$21.4M"'),
        }, "largest first"),
      },
      apply: (s, d, ctx) => {
        s.setText("Text 1", upper(d.label));
        s.setBox("Text 1", { w: 600 });
        pageNo(s, "Text 2", ctx.pos);
        const rows = [
          { name: 3, bar: 4, val: 5 },
          { name: 6, bar: 7, val: 8 },
          { name: 9, bar: 10, val: 11 },
          { name: 12, bar: 13, val: 14 },
        ];
        const peak = Math.max(...d.rows.map((r: any) => r.value), 1e-9);
        rows.forEach((r, i) => {
          if (i >= d.rows.length) {
            s.remove(`Text ${r.name}`);
            s.remove(`Shape ${r.bar}`);
            s.remove(`Text ${r.val}`);
            return;
          }
          const row = d.rows[i];
          s.setText(`Text ${r.name}`, upper(row.name));
          s.setBox(`Shape ${r.bar}`, { w: Math.max((row.value / peak) * 912, 60) });
          s.fitOneLine(`Text ${r.val}`, row.display, 0.6);
        });
      },
    },
    {
      id: "priorities",
      source: 7,
      purpose: "Next quarter's priorities: four goals, each with an owner.",
      schema: {
        label: str(24, 'e.g. "Q4 PRIORITIES"'),
        goals: list(4, 4, {
          text: str(44, "the goal"),
          owner: str(14, "owning team, one word"),
        }),
      },
      apply: (s, d, ctx) => {
        s.setText("Text 1", upper(d.label));
        s.setBox("Text 1", { w: 600 });
        pageNo(s, "Text 2", ctx.pos);
        const names = [[6, 7], [10, 11], [14, 15], [18, 19]];
        d.goals.forEach((g: any, i: number) => {
          s.fitBlock(`Text ${names[i][0]}`, g.text, 0.52, 1.2);
          s.setText(`Text ${names[i][1]}`, upper(g.owner));
        });
      },
    },
    {
      id: "close",
      source: 8,
      purpose: "Closing slide: a closing word and contact for follow-ups.",
      schema: {
        company: str(24, "company name"),
        closing: str(10, 'one big word, e.g. "QUESTIONS"'),
        contact: str(40, "email for follow-ups"),
      },
      apply: (s, d, ctx) => {
        s.setText("Text 1", upper(d.company));
        s.setBox("Text 1", { w: 400 });
        pageNo(s, "Text 2", ctx.pos);
        s.fitOneLine("Text 3", upper(d.closing), 0.68);
        s.setText("Text 4", d.contact);
        s.setBox("Text 4", { x: 880, w: 500 });
        s.setAlign("Text 4", "r");
      },
    },
  ],
};
