import type { LTWHP, Page } from "../types.js";

import optimizeClientRects from "./optimize-client-rects";

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
  return 0;
};

const getAllSpansInRange = (
  range: Range,
  pages: Page[]
): { node: HTMLElement; pageNumber: number }[] => {
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

  const spans = [{ node: firstNode, pageNumber: pages[0].number }];
  let currentNode = firstNode;
  let pageIndex = 0;
  let currentPage = pages[0];
  if (firstNode === lastNode) return spans;

  do {
    if (!currentNode.nextElementSibling) {
      // The PDF.js structure is span < div.TextLayer < div.page
      pageIndex++;
      currentPage = pages[pageIndex];
      const nextPageTextLayer = currentPage.node.querySelector(".textLayer");
      currentNode = nextPageTextLayer?.firstChild as HTMLElement;
    } else {
      currentNode = currentNode.nextElementSibling as HTMLElement;
    }
    if (currentNode.nodeName === "SPAN")
      spans.push({ node: currentNode, pageNumber: currentPage.number });
  } while (currentNode !== lastNode);

  return spans;
};

const fromPxToNumber = (px: string) => Number(px.replace("px", "") || 0);

type LeftAndWidthBounds = {
  left: number;
  width: number;
};
interface Options {
  initialValues: LeftAndWidthBounds;
  scale: number;
}

/**
 * the width and left would be different in 3 cases:
 * 1) there is only one span, causing it to be first and last at the same time, we should adjust width and left
 * 2) the first span which the selection might not include all of it's contents, we adjust width and left of it.
 * 3) the last span which the selection might not include all of it's contents, we adjust width of it.
 * */
const calcWidthAndLeftBounds = (
  spans: { node: HTMLElement; pageNumber: number }[],
  span: HTMLElement,
  range: Range,
  { initialValues, scale }: Options
): LeftAndWidthBounds => {
  const bounds = {
    left: initialValues.left,
    width: initialValues.width,
  };
  const spanIndex = spans.findIndex((s) => s.node == span);
  if (spanIndex === 0 && spanIndex === spans.length - 1) {
    const selectedTextWidth =
      measureText(span, range.startOffset, range.endOffset) * scale;
    const endTextWidth = measureText(span, range.endOffset) * scale;
    bounds.left = bounds.left + bounds.width - selectedTextWidth - endTextWidth;
    bounds.width = selectedTextWidth;
  } else if (spanIndex === 0) {
    const selectedTextWidth = measureText(span, range.startOffset) * scale;
    bounds.left = bounds.left + bounds.width - selectedTextWidth;
    bounds.width = selectedTextWidth;
  } else if (spanIndex === spans.length - 1) {
    bounds.width = measureText(span, 0, range.endOffset) * scale;
  }

  return bounds;
};

const getClientRects = (
  range: Range,
  pages: Page[],
  shouldOptimize: boolean = true
): Array<LTWHP> => {
  const rects: LTWHP[] = [];
  const spans = getAllSpansInRange(range, pages);

  for (const { node: span, pageNumber } of spans) {
    const styles = getComputedStyle(span);

    // PDF.js applies a scaleX that isn't automatically aplied to styles.width, we need to adjust that.
    const spanScaleX = new WebKitCSSMatrix(styles.transform).a;
    let initialWidth = spanScaleX * fromPxToNumber(styles.width);
    let initialLeft = fromPxToNumber(styles.left);

    const { width, left } = calcWidthAndLeftBounds(spans, span, range, {
      initialValues: { width: initialWidth, left: initialLeft },
      scale: spanScaleX,
    });

    const highlightedRect = {
      top: fromPxToNumber(styles.top),
      left: left,
      width: width,
      height: fromPxToNumber(styles.height),
      pageNumber: pageNumber,
    } as LTWHP;
    rects.push(highlightedRect);
  }

  return shouldOptimize ? optimizeClientRects(rects) : rects;
};

export default getClientRects;
