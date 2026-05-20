export const STORAGE_KEY = "papel-vivo-state-v1";
const PROGRESS_KEY = "papel-vivo-reading-progress-v1";
const NOTES_KEY = "papel-vivo-notes-v1";
const LEGACY_STORAGE_KEY = "appreader-state-v1";
const LEGACY_PROGRESS_KEY = "appreader-reading-progress-v1";

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
  const state = readJson(STORAGE_KEY, null);
  if (state) return state;
  return readJson(LEGACY_STORAGE_KEY, {});
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
  const progressByBook = readJson(PROGRESS_KEY, null) ?? readJson(LEGACY_PROGRESS_KEY, {});
  const existing = progressByBook[bookId];
  const normalizedProgress =
    typeof progress === "number"
      ? {
          currentPage: progress,
          percentageRead: 0,
          readingMode: "paginated",
          lastReadAt: new Date().toISOString()
        }
      : {
          ...(typeof existing === "object" && existing ? existing : {}),
          ...progress,
          lastReadAt: progress?.lastReadAt ?? new Date().toISOString()
        };

  writeJson(PROGRESS_KEY, { ...progressByBook, [bookId]: normalizedProgress });
}

export function loadReadingProgress(bookId) {
  if (!bookId) return 0;
  const progressByBook = readJson(PROGRESS_KEY, null) ?? readJson(LEGACY_PROGRESS_KEY, {});
  return progressByBook[bookId] ?? 0;
}

export function loadBookNotes(bookId) {
  if (!bookId) return [];
  const notesByBook = readJson(NOTES_KEY, {});
  return Array.isArray(notesByBook[bookId]) ? notesByBook[bookId] : [];
}

export function saveBookNotes(bookId, notes) {
  if (!bookId) return;
  const notesByBook = readJson(NOTES_KEY, {});
  writeJson(NOTES_KEY, { ...notesByBook, [bookId]: Array.isArray(notes) ? notes : [] });
}
