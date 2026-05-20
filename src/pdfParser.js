const TOC_DOTS_RE = /\.{4,}\s*\d{1,4}\s*$/;
const TOC_NUMBER_RE = /^(.+?)\s+(\d{1,4})$/;
const LIST_RE = /^((?:\d+(?:\.\d+)*[\.)])|(?:[a-zA-Z][\.)])|[-*\u2022\u2013])\s+(.+)$/;
const HEADING_WORD_RE = /\b(CAP[IÍ]TULO|INTRODUCCI[OÓ]N|RESUMEN|TEMA|UNIDAD|BLOQUE|ANEXO|CONCLUSI[OÓ]N|OBJETIVOS?)\b/i;

function readFileAsArrayBuffer(file) {
  // Privacy: PDF bytes are read from the local File object and passed directly to PDF.js in this browser.
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer el PDF."));
    reader.readAsArrayBuffer(file);
  });
}

function normalizeText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function signature(text) {
  return normalizeText(text).toLowerCase().replace(/\d+/g, "#");
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 12;
  return sorted[Math.floor(sorted.length / 2)];
}

function uppercaseRatio(text) {
  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (!letters.length) return 0;
  const uppercase = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "");
  return uppercase.length / letters.length;
}

function getRunStyle(item, styles) {
  const fontName = `${styles?.[item.fontName]?.fontFamily ?? ""} ${item.fontName ?? ""}`;
  return {
    fontName,
    bold: /(bold|black|heavy|semibold|demibold|700|800|900)/i.test(fontName),
    italic: /(italic|oblique)/i.test(fontName)
  };
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function runText(run) {
  return run.text;
}

function lineToRuns(line) {
  return line.runs.map(({ fontSize, x, y, width, height, fontName, ...run }) => run);
}

function lineText(line) {
  return normalizeText(line.text);
}

export async function parsePdfToReadableBook(file, { workerSrc } = {}) {
  const pdfjsLib = await import("pdfjs-dist");
  if (workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  const buffer = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const nativeToc = await extractNativeToc(pdf);
  const pages = await extractPdfPages(pdf, pdfjsLib);
  const groupedLines = groupItemsIntoLines(pages);
  const classifiedLines = classifyPdfLines(groupedLines);
  const { lines: noTocLines, toc, tocPages } = extractToc(classifiedLines);
  const cleanLines = removePdfNoise(noTocLines);
  const mergedLines = mergeParagraphLines(cleanLines);
  const blocks = normalizeListBlocks(buildReadingBlocks(mergedLines));
  const finalToc = nativeToc.length ? nativeToc : toc;
  const metrics = buildMetrics({
    groupedLines,
    classifiedLines,
    cleanLines,
    mergedLines,
    blocks,
    toc: finalToc,
    tocPages
  });

  if (!blocks.some((block) => blockToText(block))) {
    throw new Error("Este PDF no contiene texto seleccionable. Si es un escaneo, primero necesita OCR.");
  }

  if (import.meta.env?.DEV) {
    console.debug("[Papel Vivo] PDF reflow metrics", metrics);
  }

  // TODO: para PDFs grandes conviene migrar los bloques parseados de localStorage a IndexedDB.
  return {
    type: "pdf",
    title: file.name.replace(/\.pdf$/i, ""),
    toc: finalToc,
    blocks,
    originalPageCount: pdf.numPages,
    parsedAt: new Date().toISOString(),
    metrics
  };
}

async function extractNativeToc(pdf) {
  if (typeof pdf.getOutline !== "function") return [];
  const outline = await pdf.getOutline();
  if (!outline?.length) return [];

  const entries = [];
  const visit = async (items, level = 1) => {
    for (const item of items) {
      entries.push({
        title: normalizeText(item.title),
        page: await resolveOutlinePage(pdf, item.dest),
        level
      });
      if (item.items?.length) {
        await visit(item.items, level + 1);
      }
    }
  };

  await visit(outline);
  return entries.filter((entry) => entry.title);
}

async function resolveOutlinePage(pdf, dest) {
  try {
    const resolved = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
    const ref = Array.isArray(resolved) ? resolved[0] : null;
    if (!ref) return null;
    return (await pdf.getPageIndex(ref)) + 1;
  } catch {
    return null;
  }
}

export async function extractPdfPages(pdf, pdfjsLib) {
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const annotations = await page.getAnnotations();
    const links = annotations
      .filter((annotation) => annotation.subtype === "Link" && (annotation.url || annotation.unsafeUrl))
      .map((annotation) => {
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect);
        return {
          href: annotation.url || annotation.unsafeUrl,
          rect: {
            left: Math.min(x1, x2),
            right: Math.max(x1, x2),
            top: Math.min(y1, y2),
            bottom: Math.max(y1, y2)
          }
        };
      });

    const items = content.items
      .filter((item) => "str" in item && normalizeText(item.str))
      .map((item) => {
        const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontSize = Math.max(Math.abs(transform[3]), item.height ?? 0, 8);
        const width = Math.max(item.width ?? 0, normalizeText(item.str).length * fontSize * 0.38);
        const height = Math.max(item.height ?? fontSize, fontSize);
        const rect = {
          left: transform[4],
          right: transform[4] + width,
          top: transform[5] - height * 0.9,
          bottom: transform[5] + height * 0.25
        };
        const link = links.find((candidate) => overlaps(rect, candidate.rect));

        return {
          text: normalizeText(item.str),
          page: pageNumber,
          x: transform[4],
          y: transform[5],
          width,
          height,
          fontSize,
          ...getRunStyle(item, content.styles),
          href: link?.href
        };
      });

    pages.push({
      page: pageNumber,
      width: viewport.width,
      height: viewport.height,
      items
    });
  }

  return pages;
}

export function groupItemsIntoLines(pages) {
  const lines = [];

  pages.forEach((page) => {
    const pageLines = [];
    page.items
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((item) => {
        const existing = pageLines.find(
          (line) => Math.abs(line.y - item.y) <= Math.max(item.fontSize * 0.45, 4)
        );
        const run = { ...item, text: `${item.text} ` };

        if (existing) {
          existing.runs.push(run);
          existing.y = (existing.y + item.y) / 2;
          existing.x = Math.min(existing.x, item.x);
          existing.width = Math.max(existing.width, item.x + item.width - existing.x);
          existing.height = Math.max(existing.height, item.height);
          return;
        }

        pageLines.push({
          id: `${page.page}:${pageLines.length + 1}`,
          text: item.text,
          page: page.page,
          pageHeight: page.height,
          pageWidth: page.width,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          fontName: item.fontName,
          runs: [run],
          kind: "raw"
        });
      });

    pageLines
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((line, index, ordered) => {
        line.id = `${line.page}:${index + 1}`;
        line.runs.sort((a, b) => a.x - b.x);
        line.text = normalizeText(line.runs.map(runText).join(""));
        line.fontSize = median(line.runs.map((run) => run.fontSize));
        line.fontName = line.runs.map((run) => run.fontName).filter(Boolean).join(" ");
        line.width = Math.max(...line.runs.map((run) => run.x + run.width)) - line.x;
        line.height = Math.max(...line.runs.map((run) => run.height));
        line.gapBefore = index === 0 ? Infinity : Math.max(0, line.y - ordered[index - 1].y);
        lines.push(line);
      });
  });

  return lines;
}

export function classifyPdfLines(lines) {
  const stats = getDocumentStats(lines);
  const tableLineIds = detectTableLineIds(lines, stats);
  const classified = lines.map((line, index) => {
    const text = lineText(line);
    const context = {
      previous: lines[index - 1] ?? null,
      next: lines[index + 1] ?? null
    };
    const isToc = isTocLine(text);
    const isPageNumber = isPageNumberLine(line);
    const isList = LIST_RE.test(text);
    const isTableLike = tableLineIds.has(line.id);
    const headingScore = calculateHeadingScore(line, context, stats);
    let kind = "paragraph";

    if (isToc) kind = "toc";
    else if (isPageNumber) kind = "page-number";
    else if (isTableLike) kind = "table";
    else if (isList) kind = "list";
    else if (headingScore >= 5) kind = "heading";
    else if (isQuoteLine(line, stats)) kind = "quote";

    const emphasis = kind === "paragraph" && isEmphasisParagraphLine(line, stats, headingScore);

    if (import.meta.env?.DEV && lineHasBold(line) && (headingScore >= 2 || emphasis || kind === "heading")) {
      console.debug("[Papel Vivo] PDF bold line", {
        text: text.slice(0, 140),
        fontSize: line.fontSize,
        fontName: line.fontName,
        headingScore,
        finalType: kind,
        emphasis
      });
    }

    return { ...line, kind, headingScore, emphasis };
  });

  return markRepeatedHeaderFooters(classified);
}

export function removePdfNoise(lines) {
  return lines.filter((line) => !["toc", "page-number", "header-footer", "empty"].includes(line.kind));
}

export function extractToc(lines) {
  const byPage = new Map();
  lines.forEach((line) => {
    if (!byPage.has(line.page)) byPage.set(line.page, []);
    byPage.get(line.page).push(line);
  });

  const tocPages = new Set();
  byPage.forEach((pageLines, page) => {
    const tocCount = pageLines.filter((line) => line.kind === "toc").length;
    if (tocCount >= 3 || tocCount / Math.max(pageLines.length, 1) > 0.35) {
      tocPages.add(page);
    }
  });

  const toc = [];
  const linesWithoutTocPages = lines.filter((line) => {
    if (line.kind === "toc" || tocPages.has(line.page)) {
      const entry = parseTocEntry(line);
      if (entry) toc.push(entry);
      return false;
    }
    return true;
  });

  return { lines: linesWithoutTocPages, toc, tocPages: tocPages.size };
}

export function mergeParagraphLines(lines) {
  const merged = [];

  lines.forEach((line) => {
    const previous = merged[merged.length - 1];
    if (canMergeParagraph(previous, line)) {
      previous.text = joinParagraphText(previous.text, line.text);
      previous.runs.push({ text: " " }, ...line.runs);
      previous.width = Math.max(previous.width, line.width);
      previous.height += line.height;
      previous.pageEnd = line.page;
      previous.emphasis = Boolean(previous.emphasis && line.emphasis);
      previous.sourceLineIds = [...(previous.sourceLineIds ?? [previous.id]), line.id].filter(Boolean);
      return;
    }

    merged.push({ ...line, pageStart: line.page, pageEnd: line.page, sourceLineIds: [line.id].filter(Boolean) });
  });

  return merged;
}

export function buildReadingBlocks(lines) {
  const blocks = [];
  let tableRun = false;
  const baseFontSize = median(lines.map((candidate) => candidate.fontSize));

  const flushTableWarning = () => {
    if (!tableRun) return;
    blocks.push({
      type: "table-warning",
      text: "Esta pagina puede contener una tabla o contenido maquetado. Revisala en la vista PDF original.",
      pageStart: null,
      pageEnd: null,
      sourceLineIds: []
    });
    tableRun = false;
  };

  lines.forEach((line) => {
    if (line.kind === "table") {
      tableRun = true;
      return;
    }

    flushTableWarning();

    if (line.kind === "heading") {
      blocks.push({
        type: "heading",
        level: line.fontSize >= baseFontSize * 1.55 ? 1 : 2,
        text: line.text,
        runs: lineToRuns(line),
        pageStart: line.pageStart ?? line.page,
        pageEnd: line.pageEnd ?? line.page,
        sourceLineIds: line.sourceLineIds ?? [line.id].filter(Boolean)
      });
      return;
    }

    if (line.kind === "list") {
      const ordered = /^(\d|[a-zA-Z][\.)])/.test(line.text);
      const previous = blocks[blocks.length - 1];
      const itemRuns = stripListMarker(lineToRuns(line));
      const item = { text: itemRuns.map(runText).join(""), runs: itemRuns };
      if (previous?.type === "list" && previous.ordered === ordered) {
        previous.items.push(item);
        previous.pageEnd = line.pageEnd ?? line.page;
        previous.sourceLineIds.push(...(line.sourceLineIds ?? [line.id]).filter(Boolean));
      } else {
        blocks.push({
          type: "list",
          ordered,
          items: [item],
          pageStart: line.pageStart ?? line.page,
          pageEnd: line.pageEnd ?? line.page,
          sourceLineIds: line.sourceLineIds ?? [line.id].filter(Boolean)
        });
      }
      return;
    }

    if (line.kind === "quote") {
      blocks.push({
        type: "quote",
        text: line.text,
        runs: lineToRuns(line),
        pageStart: line.pageStart ?? line.page,
        pageEnd: line.pageEnd ?? line.page,
        sourceLineIds: line.sourceLineIds ?? [line.id].filter(Boolean)
      });
      return;
    }

    if (line.runs.some((run) => run.href) && line.text.length < 160) {
      blocks.push({
        type: "link",
        text: line.text,
        href: line.runs.find((run) => run.href)?.href ?? null,
        runs: lineToRuns(line),
        pageStart: line.pageStart ?? line.page,
        pageEnd: line.pageEnd ?? line.page,
        sourceLineIds: line.sourceLineIds ?? [line.id].filter(Boolean)
      });
      return;
    }

    blocks.push({
      type: "paragraph",
      text: line.text,
      emphasis: Boolean(line.emphasis),
      runs: lineToRuns(line),
      pageStart: line.pageStart ?? line.page,
      pageEnd: line.pageEnd ?? line.page,
      sourceLineIds: line.sourceLineIds ?? [line.id].filter(Boolean)
    });
  });

  flushTableWarning();
  return blocks;
}

function isTocLine(text) {
  if (TOC_DOTS_RE.test(text)) return true;
  if (/\.{2,}/.test(text) && /\d{1,4}\s*$/.test(text)) return true;
  if (uppercaseRatio(text) > 0.72 && text.length > 30 && (text.match(/\b\d{1,4}\b/g) ?? []).length <= 1 && TOC_NUMBER_RE.test(text)) return true;
  if (/^\d+(?:\.\d+)*\.?\s+.+\s+\.{3,}\s*\d{1,4}$/.test(text)) return true;
  return false;
}

function parseTocEntry(line) {
  const text = lineText(line);
  const match = text.match(/^(.+?)\s*\.{3,}\s*(\d{1,4})$/) ?? text.match(/^(.+?)\s+(\d{1,4})$/);
  if (!match) return null;
  return {
    title: normalizeText(match[1]).replace(/\.+$/, ""),
    page: Number(match[2]),
    sourcePage: line.page
  };
}

function isPageNumberLine(line) {
  const text = lineText(line);
  const nearEdge = line.y < line.pageHeight * 0.07 || line.y > line.pageHeight * 0.93;
  if (!nearEdge) return false;
  return /^\d{1,4}$/.test(text) || /^[ivxlcdm]{1,8}$/i.test(text) || /^(\d{1,4}\s+){1,2}\d{1,4}$/.test(text);
}

function calculateHeadingScore(line, context, stats) {
  const text = lineText(line);
  if (!text || isTocLine(text) || isPageNumberLine(line) || /\.{3,}/.test(text)) return -10;

  const words = text.split(/\s+/).filter(Boolean);
  const fontRatio = line.fontSize / Math.max(stats.baseFontSize, 1);
  const gapBefore = Number.isFinite(line.gapBefore) ? line.gapBefore : stats.medianGap * 2.2;
  const gapAfter = context.next ? context.next.gapBefore : stats.medianGap;
  const upperRatio = uppercaseRatio(text);
  const bold = lineHasBold(line);
  const hasSectionNumber = /^\d+(?:\.\d+){1,4}\.?\s+\S/.test(text);
  const hasSingleNumberPrefix = /^\d+[\.)]\s+\S/.test(text);
  const hasHeadingWord = HEADING_WORD_RE.test(text);
  const startsLowercase = /^[a-záéíóúüñ]/.test(text);
  const sentenceLike = isNaturalSentenceLike(text);
  const betweenParagraphs = looksBetweenParagraphs(line, context, stats);
  let score = 0;

  if (fontRatio >= 1.55) score += 4;
  else if (fontRatio >= 1.35) score += 3;
  else if (fontRatio >= 1.2) score += 1;

  if (gapBefore > stats.medianGap * 1.85 || line.gapBefore === Infinity) score += 2;
  else if (gapBefore > stats.medianGap * 1.35) score += 1;

  if (gapAfter > stats.medianGap * 1.45) score += 1;
  if (upperRatio > 0.76 && text.length <= 95) score += 2;
  else if (upperRatio > 0.62 && text.length <= 70) score += 1;
  if (hasHeadingWord && text.length <= 95) score += 2;
  if (hasSectionNumber) score += 2;
  if (bold) score += 1;

  if (text.length > 130) score -= 3;
  else if (text.length > 95) score -= 1;
  if (words.length > 15) score -= 2;
  if (words.length > 22) score -= 2;
  if (startsLowercase) score -= 3;
  if (/[,;]$/.test(text)) score -= 2;
  if (sentenceLike) score -= 3;
  if (fontRatio < 1.14 && bold) score -= 2;
  if (fontRatio < 1.08 && !hasHeadingWord && !hasSectionNumber && upperRatio < 0.72) score -= 2;
  if (hasSingleNumberPrefix && !hasSectionNumber) score -= 3;
  if (context.previous && LIST_RE.test(lineText(context.previous))) score -= 3;
  if (betweenParagraphs) score -= 3;

  return score;
}

function isHeadingLine(line, context, stats) {
  return calculateHeadingScore(line, context, stats) >= 5;
}

function isEmphasisParagraphLine(line, stats, headingScore) {
  const text = lineText(line);
  if (!text || !lineHasBold(line) || headingScore >= 5 || LIST_RE.test(text)) return false;
  if (line.fontSize > stats.baseFontSize * 1.18) return false;
  if (text.length > 150) return false;
  return true;
}

function lineHasBold(line) {
  return /bold|black|heavy|semibold|demibold|700|800|900/i.test(line.fontName ?? "") || line.runs.some((run) => run.bold);
}

function isNaturalSentenceLike(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 7) return false;
  const hasSentencePunctuation = /[,.!?;:]/.test(text);
  const lowerRatio = text.replace(/[^a-záéíóúüñ]/g, "").length / Math.max(text.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "").length, 1);
  return hasSentencePunctuation || lowerRatio > 0.55;
}

function looksBetweenParagraphs(line, context, stats) {
  const previous = context.previous;
  const next = context.next;
  if (!previous || !next) return false;
  const sameFont = Math.abs(previous.fontSize - line.fontSize) <= Math.max(1.5, stats.baseFontSize * 0.12)
    && Math.abs(next.fontSize - line.fontSize) <= Math.max(1.5, stats.baseFontSize * 0.12);
  const sameIndent = Math.abs(previous.x - line.x) <= stats.indentTolerance
    && Math.abs(next.x - line.x) <= stats.indentTolerance;
  const normalGap = line.gapBefore < stats.medianGap * 1.7 && next.gapBefore < stats.medianGap * 1.7;
  return sameFont && sameIndent && normalGap && isNaturalSentenceLike(lineText(line));
}

function markRepeatedHeaderFooters(lines) {
  const counts = new Map();
  const pageCount = new Set(lines.map((line) => line.page)).size;

  lines.forEach((line) => {
    const text = lineText(line);
    const nearEdge = line.y < line.pageHeight * 0.07 || line.y > line.pageHeight * 0.93;
    if (!nearEdge || text.length > 95 || text.length < 2 || line.kind === "toc") return;
    const key = signature(text);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const threshold = Math.max(2, Math.ceil(pageCount * 0.25));
  return lines.map((line) => {
    const key = signature(line.text);
    const nearEdge = line.y < line.pageHeight * 0.07 || line.y > line.pageHeight * 0.93;
    if (nearEdge && counts.get(key) >= threshold && line.text.length < 95) {
      return { ...line, kind: "header-footer" };
    }
    return line;
  });
}

function isTableLikeLine(line) {
  return getTableLineSignals(line).strong;
}

function detectTableLineIds(lines, stats) {
  const ids = new Set();
  const byPage = new Map();

  lines.forEach((line) => {
    if (!byPage.has(line.page)) byPage.set(line.page, []);
    byPage.get(line.page).push(line);
  });

  byPage.forEach((pageLines) => {
    const ordered = pageLines.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    for (let index = 0; index < ordered.length; index += 1) {
      const region = ordered.slice(index, index + 5);
      const confidence = calculateTableConfidence(region, stats);
      if (confidence >= 8) {
        region.forEach((line) => {
          if (getTableLineSignals(line).strong) ids.add(line.id);
        });
      }
    }
  });

  return ids;
}

function calculateTableConfidence(region, stats) {
  const candidates = region.filter((line) => getTableLineSignals(line).strong);
  if (candidates.length < 3) return 0;

  const allText = candidates.map(lineText).join(" ");
  const xBuckets = candidates.flatMap((line) => getTableLineSignals(line).xBuckets);
  const repeatedXBuckets = countRepeatedValues(xBuckets, 3);
  const shortCellRows = candidates.filter((line) => getTableLineSignals(line).shortCellRatio >= 0.7).length;
  const numericRows = candidates.filter((line) => getTableLineSignals(line).numberCount >= 2).length;
  const naturalSentences = candidates.filter((line) => isNaturalSentence(line.text)).length;
  const similarStart = countRepeatedValues(candidates.map((line) => Math.round(line.x / 12) * 12), 3);
  const compactVertical = median(candidates.map((line) => line.gapBefore).filter(Number.isFinite)) <= stats.medianGap * 1.35;

  let score = 0;
  if (candidates.length >= 3) score += 2;
  if (repeatedXBuckets >= 3) score += 3;
  if (shortCellRows >= 3) score += 2;
  if (numericRows >= 2) score += 1;
  if (similarStart >= 3) score += 1;
  if (compactVertical) score += 1;
  score -= naturalSentences * 2;
  if (allText.length > 260 && naturalSentences >= 2) score -= 3;

  return score;
}

function getTableLineSignals(line) {
  const text = lineText(line);
  const runs = line.runs.map((run) => ({ ...run, cleanText: normalizeText(run.text) })).filter((run) => run.cleanText);
  const xBuckets = runs.map((run) => Math.round(run.x / 30) * 30);
  const uniqueXBuckets = new Set(xBuckets);
  const numberCount = (text.match(/\b\d+(?:[,.]\d+)?\b/g) ?? []).length;
  const shortCellRatio = runs.length ? runs.filter((run) => run.cleanText.length <= 14).length / runs.length : 0;
  const punctuationNatural = /[,.!?;:]\s+\p{L}/u.test(text) || /\b(de|la|el|que|y|en|con|para|por|una|un)\b/i.test(text);
  const strong =
    runs.length >= 5 &&
    uniqueXBuckets.size >= 4 &&
    shortCellRatio >= 0.65 &&
    text.length <= 180 &&
    !punctuationNatural;

  return {
    strong,
    xBuckets,
    numberCount,
    shortCellRatio
  };
}

function countRepeatedValues(values, minCount) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.values()].filter((count) => count >= minCount).length;
}

function isNaturalSentence(text) {
  const clean = lineText({ text });
  if (clean.length > 95 && /[,.!?;:]/.test(clean)) return true;
  if (/\b(de|la|el|que|y|en|con|para|por|una|un|del|las|los|se|es|al)\b/i.test(clean) && clean.length > 55) return true;
  if (/^[a-záéíóúüñ]/.test(clean)) return true;
  return false;
}

function canMergeParagraph(previous, line) {
  if (!previous || previous.kind !== "paragraph" || line.kind !== "paragraph") return false;
  if (previous.page !== line.page) return false;
  const verticalLimit = Math.max(previous.fontSize * 1.8, previous.gapBefore * 1.35, 18);
  if (Math.abs(previous.fontSize - line.fontSize) > Math.max(2, previous.fontSize * 0.16)) return false;
  if (Math.abs(previous.x - line.x) > Math.max(34, previous.fontSize * 2.2) && line.x < previous.x + 18) return false;
  if (line.gapBefore > verticalLimit) return false;
  if (/[.!?:;]$/.test(previous.text) && line.gapBefore > Math.max(previous.fontSize * 1.35, 18)) return false;
  return true;
}

function joinParagraphText(left, right) {
  const cleanLeft = normalizeText(left);
  const cleanRight = normalizeText(right);
  if (cleanLeft.endsWith("-")) {
    return `${cleanLeft.slice(0, -1)}${cleanRight}`;
  }
  return `${cleanLeft} ${cleanRight}`;
}

function stripListMarker(runs) {
  if (!runs.length) return runs;
  const joined = runs.map(runText).join("");
  const match = joined.match(LIST_RE);
  if (!match) return runs;
  return [{ ...runs[0], text: match[2].trim() }];
}

export function normalizeListBlocks(blocks) {
  const normalized = [];
  let openList = null;
  let mergeNextParagraph = false;

  const flushList = () => {
    if (!openList) return;
    normalized.push(openList);
    openList = null;
  };

  blocks.forEach((block, index) => {
    const next = blocks[index + 1];

    if (block.type === "table-warning") {
      const previous = normalized[normalized.length - 1];
      if (openList && (next?.type === "list" || next?.type === "paragraph")) return;
      if (previous?.type === "table-warning") return;
      if (isWarningBetweenParagraphs(previous, next)) {
        mergeNextParagraph = true;
        return;
      }
      flushList();
      normalized.push(block);
      return;
    }

    if (block.type === "list") {
      const normalizedList = normalizeListBlock(block);

      if (openList && openList.ordered === normalizedList.ordered) {
        openList.items.push(...normalizedList.items);
        openList.pageEnd = normalizedList.pageEnd ?? openList.pageEnd;
        openList.sourceLineIds.push(...(normalizedList.sourceLineIds ?? []));
        return;
      }

      flushList();
      openList = normalizedList;
      return;
    }

    if (block.type === "paragraph" && openList && isListContinuationBlock(block, openList, next)) {
      appendParagraphToListItem(openList, block);
      return;
    }

    flushList();

    if (block.type === "paragraph" && mergeNextParagraph && normalized[normalized.length - 1]?.type === "paragraph") {
      appendParagraphBlock(normalized[normalized.length - 1], block);
      mergeNextParagraph = false;
      return;
    }

    mergeNextParagraph = false;
    normalized.push(block);
  });

  flushList();
  return normalized;
}

function isWarningBetweenParagraphs(previous, next) {
  if (previous?.type !== "paragraph" || next?.type !== "paragraph") return false;
  const previousText = blockToText(previous);
  const nextText = blockToText(next);
  if (!previousText || !nextText) return false;
  if (/[-,;:]$/.test(previousText.trim())) return true;
  if (/^[a-záéíóúüñ]/.test(nextText.trim())) return true;
  if (previousText.length > 60 && nextText.length > 40) return true;
  return false;
}

function normalizeListBlock(block) {
  const items = (block.items ?? [])
    .map((item) => {
      const text = normalizeText(item.text ?? item.runs?.map(runText).join("") ?? "");
      const marker = text.match(LIST_RE);
      const cleanText = marker ? marker[2].trim() : text;
      return {
        text: cleanText,
        runs: item.runs?.length ? stripListMarker(item.runs) : [{ text: cleanText }]
      };
    })
    .filter((item) => item.text);

  return { ...block, items };
}

function isListContinuationBlock(block, listBlock, next) {
  const text = blockToText(block).trim();
  if (!text) return false;
  if (next?.type === "list") return true;
  if (/^[a-záéíóúüñ]/.test(text)) return true;
  const lastItem = listBlock.items[listBlock.items.length - 1];
  const lastText = lastItem?.text ?? lastItem?.runs?.map(runText).join("") ?? "";
  return /[,;:\-–]$/.test(lastText.trim());
}

function appendParagraphToListItem(listBlock, paragraphBlock) {
  const item = listBlock.items[listBlock.items.length - 1];
  if (!item) return;
  const addition = blockToText(paragraphBlock).trim();
  item.text = `${item.text ?? item.runs.map(runText).join("").trim()} ${addition}`.trim();
  item.runs = [...(item.runs ?? []), { text: " " }, ...(paragraphBlock.runs ?? [{ text: addition }])];
  listBlock.pageEnd = paragraphBlock.pageEnd ?? listBlock.pageEnd;
  listBlock.sourceLineIds = [...(listBlock.sourceLineIds ?? []), ...(paragraphBlock.sourceLineIds ?? [])];
}

function appendParagraphBlock(target, source) {
  const addition = blockToText(source).trim();
  target.text = `${blockToText(target).trim()} ${addition}`.trim();
  target.runs = [...(target.runs ?? []), { text: " " }, ...(source.runs ?? [{ text: addition }])];
  target.pageEnd = source.pageEnd ?? target.pageEnd;
  target.sourceLineIds = [...(target.sourceLineIds ?? []), ...(source.sourceLineIds ?? [])];
}

function blockToText(block) {
  if (block.type === "list") {
    return block.items.map((item) => item.runs.map(runText).join("")).join(" ");
  }
  if (block.text) return block.text;
  return (block.runs ?? []).map(runText).join("");
}

function isQuoteLine(line, stats) {
  const text = lineText(line);
  if (text.length < 55 || text.length > 220) return false;
  const indented = line.x > stats.bodyIndent + stats.indentTolerance * 2.4;
  const separated = line.gapBefore > stats.medianGap * 1.6;
  const styled = /italic|oblique/i.test(line.fontName ?? "") || line.runs.some((run) => run.italic);
  return indented && (separated || styled);
}

function getDocumentStats(lines) {
  const bodyCandidates = lines.filter((line) => line.text.length > 20 && !isTocLine(line.text) && !isPageNumberLine(line));
  const baseFontSize = median(bodyCandidates.map((line) => line.fontSize));
  const medianGap = median(bodyCandidates.map((line) => line.gapBefore).filter(Number.isFinite));
  const bodyIndent = median(bodyCandidates.map((line) => line.x));
  const averageWidth = median(bodyCandidates.map((line) => line.width));

  return {
    baseFontSize,
    medianGap: medianGap || baseFontSize * 1.2,
    bodyIndent,
    averageWidth,
    indentTolerance: Math.max(24, baseFontSize * 1.8)
  };
}

function buildMetrics({ groupedLines, classifiedLines, cleanLines, mergedLines, blocks, toc, tocPages }) {
  return {
    rawLines: groupedLines.length,
    cleanLines: cleanLines.length,
    mergedParagraphs: blocks.filter((block) => block.type === "paragraph").length,
    removedArtifacts: groupedLines.length - cleanLines.length,
    headersFootersRemoved: classifiedLines.filter((line) => line.kind === "header-footer").length,
    pageNumbersRemoved: classifiedLines.filter((line) => line.kind === "page-number").length,
    linesMerged: Math.max(0, cleanLines.length - mergedLines.length),
    tocEntries: toc.length,
    tableWarnings: blocks.filter((block) => block.type === "table-warning").length,
    tocPages
  };
}
