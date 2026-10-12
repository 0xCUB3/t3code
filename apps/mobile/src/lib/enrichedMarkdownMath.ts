import type { Root } from "mdast";
import {
  markdownMathRanges,
  mayContainMath,
  parseMarkdownWithMath,
} from "@t3tools/shared/markdownMath";

/** MD4C accepts dollar delimiters. Keep its native layout and rendering, while
 * sharing the web parser's delimiter, currency, code, and unfinished-math rules. */
export function enrichedMarkdownWithMath(source: string): string {
  if (!mayContainMath(source)) return source;
  const tree = parseMarkdownWithMath(source);
  const edits = markdownMathRanges(source, tree).map((range) => ({
    start: range.start,
    end: range.end,
    value:
      range.display && !range.inTable
        ? `$$${range.tex}$$`
        : `$${range.tex.replace(/\s*\n\s*/g, " ")}$`,
  }));
  const visit = (node: Root | Root["children"][number]) => {
    if (node.type === "text") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      for (let index = start; index < end; index++) {
        if (source[index] !== "$") continue;
        let slashes = 0;
        for (let before = index - 1; before >= start && source[before] === "\\"; before--)
          slashes++;
        if (slashes % 2 === 0) edits.push({ start: index, end: index + 1, value: "\\$" });
      }
    } else if ("children" in node) node.children.forEach(visit);
  };
  visit(tree);
  edits.sort((a, b) => a.start - b.start);
  let result = "";
  let offset = 0;
  for (const edit of edits) {
    if (edit.start < offset) continue;
    result += source.slice(offset, edit.start) + edit.value;
    offset = edit.end;
  }
  return result + source.slice(offset);
}
