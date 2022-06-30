import type { LTWHP, Page } from "../types.js";

import optimizeClientRects from "./optimize-client-rects";

const isClientRectInsidePageRect = (clientRect: DOMRect, pageRect: DOMRect) => {
  if (clientRect.top < pageRect.top) {
    return false;
  }
  if (clientRect.bottom > pageRect.bottom) {
    return false;
  }
  if (clientRect.right > pageRect.right) {
    return false;
  }
  if (clientRect.left < pageRect.left) {
    return false;
  }

  return true;
};


const measureText = (
  el: HTMLElement,
  startOffset: number = 0,
  endOffset?: number
) => {
  // The temporary canvas is used to measure text length in the DOM.
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (ctx) {
    ctx.font = `${el.style.fontSize} ${el.style.fontFamily}`;
    const { width } = ctx.measureText(
      el.textContent?.substring(startOffset, endOffset) || ""
    );
    return width;
  }
  document.removeChild(canvas);
  return 0;
};

const getAllSpansInRange = (range: Range): HTMLElement[] => {
  const firstNode = (
    range.startContainer.nodeName === "SPAN"
      ? range.startContainer
      : range.startContainer.parentNode
  ) as HTMLElement;
  const lastNode = (
    range.endContainer.nodeName === "SPAN"
      ? range.endContainer
      : range.endContainer.parentNode
  ) as HTMLElement;

  const spans = [firstNode];
  let currentNode = firstNode;

  if (firstNode === lastNode) return spans;

  do {
    if (!currentNode.nextElementSibling) {
      // The PDF.js structure is span < div.TextLayer < div.page
      const nextPage =
        currentNode.parentNode?.parentNode?.nextSibling?.lastChild;
      currentNode = nextPage?.firstChild as HTMLElement;
    } else {
      currentNode = currentNode.nextElementSibling as HTMLElement;
    }
    if (currentNode.nodeName === "SPAN") spans.push(currentNode);
  } while (currentNode !== lastNode);

  return spans;
};

const getClientRects = (
  range: Range,
  pages: Page[],
  shouldOptimize: boolean = true
): Array<LTWHP> => {
  const rects: LTWHP[] = [];
  const spans = getAllSpansInRange(range);

  for (const span of spans) {
    for (const page of pages) {
      const pageRect = page.node.getBoundingClientRect();
      const clientRect = span.getBoundingClientRect();
      if (isClientRectInsidePageRect(clientRect, pageRect)) {
        const measuredWidth = measureText(span, 0);
        // span width might differ from the measured one, so we adjust with the correct proportion.
        const widthTransformFix = clientRect.width / measuredWidth;
        let width = clientRect.width;
        let left = clientRect.left;

        // first and last spans might have an offset, which is calculated by the range offset
        if (spans.indexOf(span) === 0) {
          const selectedTextWidth =
            measureText(span, range.startOffset) * widthTransformFix;
          left = left + width - selectedTextWidth;
          width = selectedTextWidth;
        }

        if (spans.indexOf(span) === spans.length - 1) {
          width = measureText(span, 0, range.endOffset) * widthTransformFix;
        }

        const highlightedRect = {
          top: clientRect.top + page.node.scrollTop - pageRect.top,
          left: left + page.node.scrollLeft - pageRect.left,
          width: width,
          height: clientRect.height,
          pageNumber: page.number,
        } as LTWHP;
        rects.push(highlightedRect);
      }
    }
  }

  return shouldOptimize ? optimizeClientRects(rects) : rects;
};

export default getClientRects;
