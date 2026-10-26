import type { DeckFileTemplate } from "./document.deckFile.schema.js";
import { list, str } from "./document.deckFile.helpers.js";

/** Training Deck (frontend/Templates/PPTX Templates/Training Deck.pptx). */
export const TRAINING_DECK: DeckFileTemplate = {
  key: "training-deck",
  file: "training-deck.pptx",
  label: "Training Deck",
  fontMap: { Lexend: "Verdana" },
  dropOrder: ["mistakes", "idea", "exercise", "recap", "objectives", "steps"],
  guidance:
    "One module of a hands-on training course, friendly and practical: the module title, learning objectives, one key idea with a worked example, a step-by-step procedure, common mistakes with fixes, a short exercise, and a recap. Content must come from the user's material; if they gave none and the request is clearly a sample or example, invent accurate, plausible content. Never use real people's names.",
  slides: [
    {
      id: "cover",
      source: 1,
      purpose: "Opening slide: course, module, title, trainer, duration.",
      schema: {
        course: str(28, "course or academy name"),
        module: str(16, 'e.g. "Module 2 of 5"'),
        title: str(40, "the module title, what the learner will do"),
        subtitle: str(70, "who it is for and the format"),
        trainer: str(18, "trainer name"),
        duration: str(16, 'e.g. "40 minutes"'),
        bring: str(18, "what to bring"),
      },
      apply: (s, d) => {
        s.setText("Text 0", d.course);
        s.setBox("Text 0", { w: 700 });
        s.fitOneLine("Text 2", d.module, 0.6);
        s.fitBlock("Text 3", d.title);
        s.setText("Text 4", d.subtitle);
        s.setRuns("Text 5", ["Trainer ", `· ${d.trainer}`]);
        s.setBox("Text 5", { w: 340 });
        s.setRuns("Text 6", ["Time ", `· ${d.duration}`]);
        s.setBox("Text 6", { x: 460, w: 280 });
        s.setRuns("Text 7", ["Bring ", `· ${d.bring}`]);
        s.setBox("Text 7", { x: 770, w: 520 });
      },
    },
    {
      id: "objectives",
      source: 2,
      purpose: "Learning objectives: what the learner will be able to do, each starting with a verb.",
      schema: {
        heading: str(32, 'e.g. "You will be able to"'),
        objectives: list(3, 4, { text: str(44, "a learning objective starting with a verb") }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 1", d.heading);
        [5, 9, 13, 17].forEach((n, i) => {
          if (i >= d.objectives.length) return s.remove(`Text ${n}`);
          s.fitBlock(`Text ${n}`, d.objectives[i].text, 0.55, 1.2);
        });
        if (d.objectives.length < 4) {
          ["Shape 14", "Shape 15", "Text 16"].forEach((n) => s.remove(n));
        }
      },
    },
    {
      id: "idea",
      source: 3,
      purpose: "The key idea explained in plain words, with a small worked example.",
      schema: {
        heading: str(40, "the key idea as a sentence"),
        explanation: str(90, "one or two plain sentences"),
        exampleTitle: str(28, 'e.g. "Example: sambar masala"'),
        rows: list(2, 2, {
          label: str(18, "line item"),
          value: str(8, "amount"),
        }),
        totalLabel: str(18, "the result line label"),
        totalValue: str(8, "the result"),
      },
      apply: (s, d) => {
        s.fitBlock("Text 1", d.heading);
        s.setText("Text 2", d.explanation);
        s.setText("Text 4", d.exampleTitle);
        const names = [[5, 6], [7, 8]];
        d.rows.forEach((r: any, i: number) => {
          s.setText(`Text ${names[i][0]}`, r.label);
          s.setBox(`Text ${names[i][0]}`, { w: 280 });
          s.setText(`Text ${names[i][1]}`, r.value);
          s.setBox(`Text ${names[i][1]}`, { x: 1100, w: 208 });
          s.setAlign(`Text ${names[i][1]}`, "r");
        });
        s.setBox("Text 10", { w: 330 });
        s.fitOneLine("Text 10", d.totalLabel, 0.62);
        s.setText("Text 11", d.totalValue);
        s.setBox("Text 11", { x: 1140, w: 172 });
        s.setAlign("Text 11", "r");
      },
    },
    {
      id: "steps",
      source: 4,
      purpose: "Step by step: the procedure as exactly five numbered steps.",
      schema: {
        heading: str(30, 'e.g. "Make a bill"'),
        steps: list(5, 5, { text: str(28, "one short step") }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 1", d.heading);
        const texts = [4, 7, 10, 13, 16];
        d.steps.forEach((st: any, i: number) => {
          const name = `Text ${texts[i]}`;
          s.setText(name, st.text);
          // Steps sit at the bottom of their card: size the box to the text.
          const lines = Math.min(4, Math.max(1, Math.ceil((st.text.length * 14.5) / 190)));
          const h = lines * 37;
          s.setBox(name, { y: 701 - h, h });
        });
      },
    },
    {
      id: "mistakes",
      source: 5,
      purpose: "Watch out: three common mistakes, each with its fix.",
      schema: {
        heading: str(32, 'e.g. "Three common mistakes"'),
        mistakes: list(3, 3, {
          wrong: str(36, "the mistake"),
          fix: str(40, "how to fix or avoid it"),
        }),
      },
      apply: (s, d) => {
        s.fitBlock("Text 1", d.heading);
        const names = [[3, 5], [7, 9], [12, 14]];
        d.mistakes.forEach((m: any, i: number) => {
          s.setText(`Text ${names[i][0]}`, m.wrong);
          s.setText(`Text ${names[i][1]}`, m.fix);
        });
      },
    },
    {
      id: "exercise",
      source: 6,
      purpose: "Your turn: a short practice exercise with a scenario and a worksheet card.",
      schema: {
        label: str(30, 'e.g. "Your turn - 10 minutes"'),
        heading: str(24, "the exercise name"),
        instructions: str(120, "what to do, two sentences"),
        cardTitle: str(24, 'e.g. "Shopping list"'),
        lines: list(3, 3, { text: str(32, "one line of the worksheet") }),
        check: str(36, "how to check the answer"),
      },
      apply: (s, d) => {
        s.setText("Text 0", d.label);
        s.fitBlock("Text 1", d.heading);
        s.fitBlock("Text 2", d.instructions, 0.55, 1.25);
        s.setText("Text 4", d.cardTitle);
        [5, 6, 7].forEach((n, i) => s.setText(`Text ${n}`, d.lines[i].text));
        s.setText("Text 9", d.check);
      },
    },
    {
      id: "recap",
      source: 7,
      purpose: "Recap: three takeaways and what the next module covers.",
      schema: {
        heading: str(14, 'e.g. "Recap"'),
        takeaways: list(3, 3, { text: str(40, "a key takeaway") }),
        next: str(46, 'e.g. "Next: Module 3 - Tracking stock"'),
        link: str(36, "where to learn more"),
      },
      apply: (s, d) => {
        s.fitOneLine("Text 0", d.heading, 0.6);
        [3, 6, 9].forEach((n, i) => s.fitBlock(`Text ${n}`, d.takeaways[i].text, 0.55, 1.2));
        s.setText("Text 11", d.next);
        s.setBox("Text 11", { w: 640 });
        s.setText("Text 12", d.link);
        s.setBox("Text 12", { x: 800, w: 546 });
        s.setAlign("Text 12", "r");
      },
    },
  ],
};
