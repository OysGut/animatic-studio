import { alignBlockLines, type NewAnnotation, type Page, type ProjectState } from "@/core";

/** Resolve DOM selection through the existing screenplay line alignment (including wrapped lines). */
export function selectedNoteTarget(root: HTMLElement, state: ProjectState, pages: readonly Page[]): Omit<NewAnnotation, "annotationId" | "text" | "authorName"> | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const lineOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-line]");
  const first = lineOf(range.startContainer), last = lineOf(range.endContainer);
  const blockId = first?.dataset["block"];
  if (!first || !last || !blockId || last.dataset["block"] !== blockId) return null;
  const block = state.blocks[blockId];
  if (!block) return null;
  const lines = pages.flatMap((page) => page.lines.map((line, index) => ({ key: `${page.number}:${index}`, line })).filter((item) => item.line.blockId === blockId));
  const aligned = alignBlockLines(block.text, lines.map((item) => item.line.text));
  const column = (line: HTMLElement, node: Node, offset: number) => {
    const prefix = document.createRange(); prefix.setStart(line, 0); prefix.setEnd(node, offset); return prefix.toString().length;
  };
  const offsetAt = (line: HTMLElement, col: number, end: boolean) => {
    const row = aligned[lines.findIndex((item) => item.key === line.dataset["line"])];
    if (!row?.length) return -1;
    if (end) return col <= 0 ? row[0] ?? -1 : (row[Math.min(col, row.length) - 1] ?? -2) + 1;
    return col >= row.length ? (row[row.length - 1] ?? -2) + 1 : row[Math.max(0, col)] ?? -1;
  };
  let start = offsetAt(first, column(first, range.startContainer, range.startOffset), false);
  let end = offsetAt(last, column(last, range.endContainer, range.endOffset), true);
  while (start < end && /\s/.test(block.text[start] ?? "")) start++;
  while (end > start && /\s/.test(block.text[end - 1] ?? "")) end--;
  if (start < 0 || end <= start) return null;
  end = Math.min(end, start + 5000);
  return { blockId: block.id, variantId: null, start, end, quote: block.text.slice(start, end) };
}