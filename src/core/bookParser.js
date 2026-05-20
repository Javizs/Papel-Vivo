import { parsePdfToReadableBook } from "./pdfParser";

export const SUPPORTED_EXTENSIONS = /\.(txt|md|pdf)$/i;
export const SUPPORTED_FILE_ACCEPT = ".txt,.md,.pdf,text/plain,text/markdown,application/pdf";

export function blockText(block) {
  if (block.type === "list") {
    return block.items.map((item) => item.runs.map((run) => run.text).join("")).join(" ");
  }

  if (block.text) {
    return block.text;
  }

  return (block.runs ?? []).map((run) => run.text).join("");
}

export function textToBlocks(text, fallbackText = "") {
  const normalized = String(text ?? "").trim() || fallbackText;
  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean);
  return paragraphs.map((paragraph, index) => ({
    type: index === 0 ? "heading" : "paragraph",
    level: index === 0 ? 1 : undefined,
    runs: [{ text: paragraph.replace(/\s+/g, " ").trim() }]
  }));
}

function createStableBookId(file) {
  const normalizedName = file.name.toLowerCase().trim().replace(/\s+/g, "-");
  return `local-${normalizedName}-${file.size}-${file.lastModified || 0}`;
}

export async function parseBookFile(file, { pdfWorkerSrc } = {}) {
  if (!SUPPORTED_EXTENSIONS.test(file.name)) {
    throw new Error("Formato no soportado. Usa archivos .txt, .md o .pdf.");
  }

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const parsedPdf = isPdf ? await parsePdfToReadableBook(file, { workerSrc: pdfWorkerSrc }) : null;
  const text = isPdf ? parsedPdf.blocks.map(blockText).join("\n\n") : (await file.text()).replace(/\r\n/g, "\n");
  const blocks = isPdf ? parsedPdf.blocks : textToBlocks(text);

  return {
    id: createStableBookId(file),
    title: parsedPdf?.title ?? file.name.replace(SUPPORTED_EXTENSIONS, ""),
    author: isPdf ? "PDF local" : "Archivo local",
    type: parsedPdf?.type ?? (file.name.toLowerCase().endsWith(".md") ? "md" : "txt"),
    sourceFile: {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified || null
    },
    toc: parsedPdf?.toc ?? [],
    originalPageCount: parsedPdf?.originalPageCount,
    parsedAt: parsedPdf?.parsedAt,
    metrics: parsedPdf?.metrics,
    text,
    blocks,
    progress: 0
  };
}
