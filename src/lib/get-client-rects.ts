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
    console.log(el.textContent?.substring(startOffset, endOffset));
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
  spans: HTMLElement[],
  span: HTMLElement,
  range: Range,
  { initialValues, scale }: Options
): LeftAndWidthBounds => {
  const bounds = {
    left: initialValues.left,
    width: initialValues.width,
  };
  if (spans.indexOf(span) === 0 && spans.indexOf(span) === spans.length - 1) {
    const selectedTextWidth =
      measureText(span, range.startOffset, range.endOffset) * scale;
    const endTextWidth = measureText(span, range.endOffset) * scale;
    bounds.left = bounds.left + bounds.width - selectedTextWidth - endTextWidth;
    bounds.width = selectedTextWidth;
  } else if (spans.indexOf(span) === 0) {
    const selectedTextWidth = measureText(span, range.startOffset) * scale;
    bounds.left = bounds.left + bounds.width - selectedTextWidth;
    bounds.width = selectedTextWidth;
  } else if (spans.indexOf(span) === spans.length - 1) {
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
  const spans = getAllSpansInRange(range);

  for (const span of spans) {
    for (const page of pages) {
      const styles = getComputedStyle(span);

      // PDF.js applies a scaleX that it's no automatically aplied to styles.width, we need to adjust that.
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
        pageNumber: page.number,
      } as LTWHP;
      rects.push(highlightedRect);
    }
  }

  return shouldOptimize ? optimizeClientRects(rects) : rects;
};

export default getClientRects;
