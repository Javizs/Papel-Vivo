import * as electronStorage from "../adapters/electronStorage";
import * as webStorage from "../adapters/webStorage";

const isElectron = Boolean(globalThis.window?.electronAPI);
const storage = isElectron ? electronStorage : webStorage;

export const {
  deleteBookLocal,
  loadAppState,
  loadBooksLocal,
  loadReadingProgress,
  saveAppState,
  saveBookLocal,
  saveReadingProgress
} = storage;
