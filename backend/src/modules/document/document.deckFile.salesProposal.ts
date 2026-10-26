import type { DeckFileTemplate } from "./document.deckFile.schema.js";
import { list, quoted, str } from "./document.deckFile.helpers.js";

/** Sales Proposal (frontend/Templates/PPTX Templates/Sales Proposal.pptx). */
export const SALES_PROPOSAL: DeckFileTemplate = {
  key: "sales-proposal",
  file: "sales-proposal.pptx",
  label: "Sales Proposal",
  fontMap: { Gloock: "Georgia", "Albert Sans": "Calibri" },
  dropOrder: ["included", "proof", "approach", "heard", "pricing"],
  guidance:
    "A B2B sales proposal from one company to one client: what we heard, our approach, what is included, the price options, why us, and the next steps. Facts and figures must come from the user's material; if they gave none and the request is clearly a sample or example, invent plausible fictional ones that agree with each other. Never use real people's names.",
  slides: [
    {
      id: "cover",
      source: 1,
      purpose: "Opening slide: your company, the client, the proposal title, presenter and date.",
      schema: {
        company: str(24, "your company"),
        client: str(40, 'who it is for, e.g. "Prepared for Acme, Pune campus"'),
        title: str(60, "the proposal title, what you will deliver"),
        presenter: str(24, "presenter name"),
        role: str(34, "presenter role"),
        date: str(18, 'month and year, e.g. "November 2026"'),
      },
      apply: (s, d) => {
        s.setText("Text 0", d.company);
        s.setBox("Text 0", { w: 500 });
        s.setText("Text 1", d.client);
        s.setBox("Text 1", { x: 800, w: 588 });
        s.setAlign("Text 1", "r");
        s.fitBlock("Text 3", d.title);
        s.setRuns("Text 4", [`${d.presenter} `, `· ${d.role}`]);
        s.setBox("Text 4", { w: 800 });
        s.setText("Text 5", d.date);
        s.setBox("Text 5", { x: 1000, w: 367 });
        s.setAlign("Text 5", "r");
      },
    },
    {
      id: "heard",
      source: 2,
      purpose: "What we heard: the client's own words, and three numbers that show the problem.",
      schema: {
        quote: str(150, "what the client told you, in their words"),
        source: str(44, "who said it, role and place"),
        stats: list(3, 3, {
          value: str(10, 'the number, e.g. "25 min", "54%"'),
          label: str(48, "what it measures"),
        }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 1", quoted(d.quote));
        s.setText("Text 2", d.source);
        const names = [[4, 5], [7, 8], [11, 12]];
        d.stats.forEach((st: any, i: number) => {
          s.fitOneLine(`Text ${names[i][0]}`, st.value);
          s.setText(`Text ${names[i][1]}`, st.label);
        });
      },
    },
    {
      id: "approach",
      source: 3,
      purpose: "Our approach: the solution in one line and three pillars.",
      schema: {
        heading: str(56, "the solution in one line"),
        pillars: list(3, 3, {
          title: str(24, "pillar name"),
          body: str(90, "one or two sentences"),
        }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 1", d.heading);
        const names = [[4, 5], [8, 9], [12, 13]];
        d.pillars.forEach((p: any, i: number) => {
          s.setText(`Text ${names[i][0]}`, p.title);
          s.setText(`Text ${names[i][1]}`, p.body);
        });
      },
    },
    {
      id: "included",
      source: 4,
      purpose: "What is included: the deliverables or service items, numbered.",
      schema: {
        heading: str(46, 'e.g. "Everything from kitchen to counter"'),
        items: list(4, 6, { text: str(36, "one deliverable") }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 1", d.heading);
        // Display order is down the left column, then the right: 1 4 / 2 5 / 3 6.
        const pairs = [[3, 4], [9, 10], [16, 17], [6, 7], [12, 13], [20, 21]];
        pairs.forEach(([num, txt], i) => {
          if (i >= d.items.length) {
            s.remove(`Text ${num}`);
            s.remove(`Text ${txt}`);
            return;
          }
          s.setBox(`Text ${num}`, { w: 70 });
          s.setText(`Text ${txt}`, d.items[i].text);
        });
      },
    },
    {
      id: "pricing",
      source: 5,
      purpose: "Investment: three pricing options; the middle one is shown as recommended.",
      schema: {
        heading: str(40, 'e.g. "Three ways to start"'),
        options: list(3, 3, {
          name: str(24, "option name; the middle one is the recommended plan"),
          price: str(7, 'price, e.g. "$196"'),
          unit: str(28, 'what the price is per, e.g. "per person per day"'),
          detail: str(56, "what you get"),
        }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 1", d.heading);
        const names = [[3, 4, 5, 6], [8, 9, 10, 11], [13, 14, 15, 16]];
        d.options.forEach((o: any, i: number) => {
          const [n, p, u, t] = names[i];
          s.setText(`Text ${n}`, i === 1 && !/recommend/i.test(o.name) ? `${o.name} · recommended` : o.name);
          s.fitOneLine(`Text ${p}`, o.price, 0.6);
          s.setText(`Text ${u}`, o.unit);
          s.setText(`Text ${t}`, o.detail);
        });
      },
    },
    {
      id: "proof",
      source: 6,
      purpose: "Why us: two proof points and a client quote.",
      schema: {
        label: str(30, 'e.g. "Why AeroClean", using your company name'),
        stats: list(2, 2, {
          value: str(8, 'the number, e.g. "42,000"'),
          label: str(44, "what it shows"),
        }),
        quote: str(110, "a client testimonial"),
        attribution: str(44, "who said it, role and company"),
      },
      apply: (s, d) => {
        s.setText("Text 0", d.label);
        const names = [[1, 2], [3, 4]];
        d.stats.forEach((st: any, i: number) => {
          s.fitOneLine(`Text ${names[i][0]}`, st.value, 0.6);
          s.setText(`Text ${names[i][1]}`, st.label);
        });
        s.fitBlock("Text 7", d.quote);
        s.setText("Text 8", d.attribution);
      },
    },
    {
      id: "next",
      source: 7,
      purpose: "Next steps: four dated steps and the contact details.",
      schema: {
        heading: str(24, 'e.g. "Next steps"'),
        steps: list(4, 4, {
          date: str(12, 'short date, e.g. "10 Nov"'),
          text: str(36, "what happens"),
        }),
        contact: str(52, "name and email"),
        phone: str(18, "phone number"),
      },
      apply: (s, d) => {
        s.fitOneLine("Text 0", d.heading, 0.6);
        const names = [[2, 3], [5, 6], [8, 9], [11, 12]];
        d.steps.forEach((st: any, i: number) => {
          s.setText(`Text ${names[i][0]}`, st.date);
          s.setText(`Text ${names[i][1]}`, st.text);
        });
        s.setText("Text 13", d.contact);
        s.setBox("Text 13", { w: 760 });
        s.setText("Text 14", d.phone);
        s.setBox("Text 14", { x: 1000, w: 371 });
        s.setAlign("Text 14", "r");
      },
    },
  ],
};
