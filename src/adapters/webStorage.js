export const STORAGE_KEY = "appreader-state-v1";
const PROGRESS_KEY = "appreader-reading-progress-v1";

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadAppState() {
  return readJson(STORAGE_KEY, {});
}

export function saveAppState(state) {
  writeJson(STORAGE_KEY, state);
}

export function saveBookLocal(book) {
  // Privacy: books are stored in this browser profile only, never on a server.
  // TODO: move large parsed books to IndexedDB before public web deployment.
  const state = loadAppState();
  const books = [book, ...(state.books ?? []).filter((item) => item.id !== book.id)];
  saveAppState({ ...state, books });
}

export function loadBooksLocal() {
  return loadAppState().books ?? [];
}

export function deleteBookLocal(bookId) {
  const state = loadAppState();
  saveAppState({ ...state, books: (state.books ?? []).filter((book) => book.id !== bookId) });
}

export function saveReadingProgress(bookId, progress) {
  if (!bookId) return;
  const progressByBook = readJson(PROGRESS_KEY, {});
  writeJson(PROGRESS_KEY, { ...progressByBook, [bookId]: progress });
}

export function loadReadingProgress(bookId) {
  if (!bookId) return 0;
  return readJson(PROGRESS_KEY, {})[bookId] ?? 0;
}
