import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { describe, expect, it } from "vite-plus/test";

import { chatMathFromMarkdown, chatMathSyntax, mathKind } from "./markdownMath.ts";
import { markdownMathRanges, parseMarkdownWithMath } from "./markdownMath.ts";

function parse(markdown: string) {
  return fromMarkdown(markdown, {
    extensions: [chatMathSyntax],
    mdastExtensions: [chatMathFromMarkdown],
  });
}

function collect(node: Nodes, out: Nodes[] = []): Nodes[] {
  out.push(node);
  if ("children" in node) for (const child of node.children) collect(child, out);
  return out;
}

/** Formulas as `[kind, tex]`, in document order. */
function formulas(markdown: string) {
  return collect(parse(markdown)).flatMap((node) => {
    if (node.type === "math") return [["display", node.value]];
    if (node.type !== "inlineMath") return [];
    const className = node.data?.hProperties?.className;
    return [[mathKind(Array.isArray(className) ? className.join(" ") : undefined), node.value]];
  });
}

function text(markdown: string) {
  return collect(parse(markdown))
    .flatMap((node) => (node.type === "text" ? [node.value] : []))
    .join("");
}

describe("chat math parsing", () => {
  it("only exposes closed explicit math fences to editors and native rendering", () => {
    expect(markdownMathRanges("```math\nx^2")).toEqual([]);
    expect(markdownMathRanges("```math\nx^2\n```")[0]?.tex).toBe("x^2");
    expect(markdownMathRanges("> ```math\n> x^2\n> ```")[0]?.tex).toBe("x^2");
  });
  it("reads the four delimiters models emit", () => {
    expect(formulas("Inline $x^2$ and \\(y_1\\), display $$a+b$$ and \\[c\\].")).toEqual([
      ["inline", "x^2"],
      ["inline", "y_1"],
      ["display", "a+b"],
      ["display", "c"],
    ]);
  });

  it("reads display blocks on their own lines", () => {
    expect(formulas("$$\n\\frac{a}{b}\n$$")).toEqual([["display", "\\frac{a}{b}"]]);
    expect(
      formulas("Where\n\\[\n\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}\n\\]\nholds."),
    ).toEqual([["display", "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}"]]);
  });

  it("keeps block syntax inside display blocks as TeX", () => {
    expect(formulas("\\[\nx\n- y\n# z\n\\]\nafter")).toEqual([["display", "x\n- y\n# z"]]);
    expect(formulas("> $$\n> x\n> $$")).toEqual([["display", "x"]]);
    // Same-line content is not a fence; it stays one formula.
    expect(formulas("$$x^2\n+y^2$$")).toEqual([["display", "x^2\n+y^2"]]);
    expect(text("$$E=mc^2")).toBe("$$E=mc^2");
  });

  it("keeps prices, shell variables, and skill tokens as prose", () => {
    for (const prose of [
      "It costs $5 and $10.",
      "Budget $5-$10 per seat, or $20,000-$30,000 a year.",
      "Plans are $5/$10 monthly.",
      "Run $browser then $deploy on it.",
      "Set $HOME before running.",
    ]) {
      expect(formulas(prose), prose).toEqual([]);
      expect(text(prose), prose).toBe(prose);
    }
  });

  it("leaves code, escapes, links, and citations alone", () => {
    for (const [markdown, rendered] of [
      ["Use `$x$` in code.", "Use  in code."],
      ["It costs $5 and $10, and `$HOME` stays code.", "It costs $5 and $10, and  stays code."],
      ["Export $PATH, then `$HOME`.", "Export $PATH, then ."],
      ["\\(a `\\)` b", "(a  b"],
      [
        "Set $TOKEN, then open [users](https://graph.microsoft.com/v1.0/users?$select=id).",
        "Set $TOKEN, then open users.",
      ],
      [
        "Set $TOKEN, then open <https://graph.microsoft.com/v1.0/users?$select=id>.",
        "Set $TOKEN, then open https://graph.microsoft.com/v1.0/users?$select=id.",
      ],
      ["```\n$x$ \\(y\\)\n```", ""],
      ["Escaped \\$x\\$ stays.", "Escaped $x$ stays."],
      ["Escaped \\\\(x\\\\) stays.", "Escaped \\(x\\) stays."],
      ["See [docs](https://example.com/\\(a\\)) here.", "See docs here."],
      ["As shown in \\[1\\] and \\[2, 3\\].", "As shown in [1] and [2, 3]."],
    ] as const) {
      expect(formulas(markdown), markdown).toEqual([]);
      expect(text(markdown), markdown).toBe(rendered);
    }
  });

  it("starts a formula right after an escaped dollar", () => {
    expect(formulas("Pay \\$$x$ now.")).toEqual([["inline", "x"]]);
  });

  it("keeps TeX escapes inside formulas", () => {
    expect(formulas("Cost $a\\$b$ and \\(\\left(x\\right)\\).")).toEqual([
      ["inline", "a\\$b"],
      ["inline", "\\left(x\\right)"],
    ]);
  });

  it("keeps source offsets of the original message", () => {
    const markdown = "- [ ] check \\(x\\)\n- [x] then $y$";
    const offsets = collect(parse(markdown)).flatMap((node) =>
      node.type === "inlineMath" || node.type === "listItem"
        ? [[node.type, node.position?.start.offset]]
        : [],
    );
    expect(offsets).toEqual([
      ["listItem", 0],
      ["inlineMath", markdown.indexOf("\\(")],
      ["listItem", markdown.indexOf("- [x]")],
      ["inlineMath", markdown.indexOf("$y$")],
    ]);
  });

  it("shows unfinished formulas as text while a response streams", () => {
    const message = "Energy \\(E = mc^2\\) and $$\\sum_i x_i$$ done.";
    for (let end = 0; end <= message.length; end++) {
      expect(() => parse(message.slice(0, end))).not.toThrow();
    }
    expect(text("Energy \\(E = mc")).toBe("Energy (E = mc");
    expect(formulas("$$\nx^2")).toEqual([]);
    expect(formulas("\\[\nx^2\n- y")).toEqual([]);
    expect(formulas(message)).toEqual([
      ["inline", "E = mc^2"],
      ["display", "\\sum_i x_i"],
    ]);
  });
});

describe("math in GFM tables", () => {
  it.each(["\\(\\frac{1}{|x|}\\)", "$$|x|$$", "$|x|$", "\\[|x|\\]"])(
    "keeps pipes inside %s in one cell and preserves source offsets",
    (formula) => {
      const source = `| Name | Value |\n| --- | --- |\n| x | ${formula} |\n\n- [ ] next`;
      const tree = parseMarkdownWithMath(source);
      const table = tree.children[0];
      expect(table?.type).toBe("table");
      if (table?.type !== "table") throw new Error("Missing table");
      expect(table.children.map((row) => row.children.length)).toEqual([2, 2]);
      expect(markdownMathRanges(source)).toEqual([
        expect.objectContaining({ source: formula, start: source.indexOf(formula) }),
      ]);
      const checkbox = collect(tree).find((node) => node.type === "listItem");
      expect(checkbox?.position?.start.offset).toBe(source.indexOf("- [ ]"));
    },
  );

  it("uses GFM pipe escaping inside formulas without changing math outside tables", () => {
    const source = "| Formula |\n| --- |\n| \\(\\|x\\|\\) |\n\n\\(\\|x\\|\\)";
    expect(markdownMathRanges(source).map((formula) => formula.tex)).toEqual(["|x|", "\\|x\\|"]);
  });

  it("leaves code, URLs, incomplete math, and private-use text unchanged", () => {
    const source =
      "| Value | Other |\n| --- | --- |\n| `\\(a\\|b\\)` | \\(x|y\\) |\n\n\uE000\n\n[link](https://example.com/$x|y$)\n\nUnclosed \\(x|y";
    const tree = parseMarkdownWithMath(source);
    expect(markdownMathRanges(source).map((formula) => formula.tex)).toEqual(["x|y"]);
    expect(JSON.stringify(tree)).toContain("https://example.com/$x|y$");
    expect(collect(tree).find((node) => node.type === "inlineCode")).toMatchObject({
      value: "\\(a|b\\)",
    });
    expect(JSON.stringify(tree)).toContain("\uE000");
  });

  it("keeps a display equation's equality line out of Markdown headings", () => {
    const source = "\\[\na\n=\nb\n\\]";
    expect(parseMarkdownWithMath(source).children).toEqual([
      expect.objectContaining({ type: "math", value: "a\n=\nb" }),
    ]);
  });
});
