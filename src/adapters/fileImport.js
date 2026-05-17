import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { parseBookFile } from "../core/bookParser";

export async function importBookFromBrowserFile(file) {
  // Privacy: this file is processed locally in the browser and is never uploaded.
  return parseBookFile(file, { pdfWorkerSrc: pdfWorkerUrl });
}
