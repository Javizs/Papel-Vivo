import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { blockText, SUPPORTED_FILE_ACCEPT, textToBlocks } from "./core/bookParser";
import { loadAppState, loadReadingProgress, saveAppState, saveReadingProgress } from "./core/storage";
import { importBookFromBrowserFile } from "./adapters/fileImport";
import {
  AlignJustify,
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileUp,
  Focus,
  Home,
  Minus,
  Moon,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Search,
  Settings,
  Star,
  SunMedium,
  Trash2,
  Type,
  X
} from "lucide-react";
import "./styles.css";

const BRAND_NAME = "Papel Vivo";
const BRAND_SLUG = "papel-vivo";
const BRAND_ICON_SRC = "/brand/papel-vivo-icon.png";

const SAMPLE_TEXT = `Capitulo 1

La lectura en pantalla no deberia sentirse como una pelea contra el brillo. Una buena aplicacion de lectura reduce el ruido, respeta el ritmo del texto y permite ajustar cada detalle sin interrumpir la concentracion.

Papel Vivo esta pensada para sesiones largas: fondo calido, tipografia amplia, ancho de linea controlado y un filtro visual suave que ayuda a que la pantalla resulte menos agresiva. Puedes importar un archivo de texto, ajustar la pagina y continuar donde lo dejaste.

Cuando el entorno cambia, tambien cambia la lectura. De dia puede ser util un papel claro con contraste limpio. Por la noche, un modo tinta reduce la luminosidad y conserva la legibilidad. La idea es sencilla: que la pantalla se comporte como un lector dedicado, sin obligarte a comprar otro dispositivo.

Este texto de muestra sirve para probar espaciado, margen, tamanos y filtros. Importa tu propio archivo .txt o .md para empezar a leer con tus preferencias guardadas localmente.`;

const DEFAULT_BOOKS = [
  {
    id: "sample",
    title: "Lectura comoda en pantalla",
    author: BRAND_NAME,
    blocks: textToBlocks(SAMPLE_TEXT),
    progress: 0
  }
];

const EMPTY_BOOK = {
  id: null,
  title: "Sin libro seleccionado",
  author: "Importa o selecciona un libro",
  blocks: textToBlocks("Importa un libro desde la biblioteca para empezar a leer."),
  toc: []
};

const FILTERS = {
  warm: { name: "Calido", className: "filter-warm" },
  paper: { name: "Papel", className: "filter-paper" },
  ink: { name: "Tinta", className: "filter-ink" },
  night: { name: "Noche", className: "filter-night" }
};

const DENSITIES = {
  compact: { name: "Compacta", className: "reader-density-compact" },
  normal: { name: "Normal", className: "reader-density-normal" },
  airy: { name: "Aireada", className: "reader-density-airy" }
};

const LIST_PREFIX_RE = /^((?:\d+(?:\.\d+)*[\.)])|(?:[a-zA-Z][\.)])|[-*\u2022\u2013])\s+/;
const ENTRY_ANIMATION_MS = 560;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function loadState() {
  return loadAppState();
}

function normalizeReaderBlocks(blocks) {
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
      if (previous?.type === "paragraph" && next?.type === "paragraph") {
        mergeNextParagraph = true;
        return;
      }
      flushList();
      normalized.push(block);
      return;
    }

    if (block.type === "list") {
      const cleaned = cleanListBlock(block);

      if (openList && openList.ordered === cleaned.ordered) {
        openList.items.push(...cleaned.items);
        openList.pageEnd = cleaned.pageEnd ?? openList.pageEnd;
        openList.sourceLineIds = [...(openList.sourceLineIds ?? []), ...(cleaned.sourceLineIds ?? [])];
        return;
      }

      flushList();
      openList = cleaned;
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

  if (import.meta.env?.DEV) {
    debugListNormalization(blocks, normalized);
  }

  return normalized;
}

function cleanListBlock(block) {
  return {
    ...block,
    items: (block.items ?? [])
      .map((item) => {
        const text = item.text ?? item.runs?.map((run) => run.text).join("") ?? "";
        const cleanText = text.replace(LIST_PREFIX_RE, "").trim();
        return {
          text: cleanText,
          runs: item.runs?.length ? cleanRunsListPrefix(item.runs) : [{ text: cleanText }]
        };
      })
      .filter((item) => item.text)
  };
}

function cleanRunsListPrefix(runs) {
  const joined = runs.map((run) => run.text).join("");
  const cleanText = joined.replace(LIST_PREFIX_RE, "").trim();
  return [{ ...runs[0], text: cleanText }];
}

function isListContinuationBlock(block, listBlock, next) {
  const text = blockText(block).trim();
  if (!text) return false;
  if (next?.type === "list") return true;
  if (/^[a-záéíóúüñ]/.test(text)) return true;
  const lastItem = listBlock.items[listBlock.items.length - 1];
  const lastText = lastItem?.text ?? lastItem?.runs?.map((run) => run.text).join("") ?? "";
  return /[,;:\-–]$/.test(lastText.trim());
}

function appendParagraphToListItem(listBlock, paragraphBlock) {
  const item = listBlock.items[listBlock.items.length - 1];
  if (!item) return;
  const addition = blockText(paragraphBlock).trim();
  item.text = `${item.text ?? item.runs.map((run) => run.text).join("").trim()} ${addition}`.trim();
  item.runs = [...(item.runs ?? []), { text: " " }, ...(paragraphBlock.runs ?? [{ text: addition }])];
  listBlock.pageEnd = paragraphBlock.pageEnd ?? listBlock.pageEnd;
  listBlock.sourceLineIds = [...(listBlock.sourceLineIds ?? []), ...(paragraphBlock.sourceLineIds ?? [])];
}

function appendParagraphBlock(target, source) {
  const addition = blockText(source).trim();
  target.text = `${blockText(target).trim()} ${addition}`.trim();
  target.runs = [...(target.runs ?? []), { text: " " }, ...(source.runs ?? [{ text: addition }])];
  target.pageEnd = source.pageEnd ?? target.pageEnd;
  target.sourceLineIds = [...(target.sourceLineIds ?? []), ...(source.sourceLineIds ?? [])];
}

function debugListNormalization(before, after) {
  const hasList = before.some((block) => block.type === "list") || after.some((block) => block.type === "list");
  if (!hasList) return;
  console.debug(`[${BRAND_NAME}] list normalization`, {
    before: before.map((block) => ({
      type: block.type,
      ordered: block.ordered,
      text: blockText(block).slice(0, 90),
      items: block.items?.map((item) => (item.text ?? item.runs?.map((run) => run.text).join("") ?? "").slice(0, 90))
    })),
    after: after.map((block) => ({
      type: block.type,
      ordered: block.ordered,
      text: blockText(block).slice(0, 90),
      items: block.items?.map((item) => (item.text ?? item.runs?.map((run) => run.text).join("") ?? "").slice(0, 90))
    }))
  });
}

function App() {
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [isEnteringApp, setIsEnteringApp] = useState(false);

  function enterApp() {
    setIsEnteringApp(true);
    window.setTimeout(() => setHasEnteredApp(true), ENTRY_ANIMATION_MS);
  }

  function returnHome() {
    setIsEnteringApp(false);
    setHasEnteredApp(false);
  }

  if (!hasEnteredApp) {
    return <LandingPage isExiting={isEnteringApp} onEnter={enterApp} />;
  }

  return (
    <div className="reader-entry">
      <ReaderApp onReturnHome={returnHome} />
    </div>
  );
}

function LandingPage({ isExiting, onEnter }) {
  const benefits = [
    {
      title: "Lectura mas comoda",
      text: "Convierte documentos largos en una lectura con ancho controlado, buen espaciado y una superficie tipo papel."
    },
    {
      title: "Filtros visuales",
      text: "Cambia entre estilos calidos, papel, tinta o noche para adaptar la pantalla a la sesion."
    },
    {
      title: "Modo foco",
      text: "Oculta paneles cuando necesitas dejar el documento en el centro y reducir distracciones."
    },
    {
      title: "Biblioteca local",
      text: "Mantiene tus libros y progreso en el almacenamiento local disponible del navegador o de la app."
    },
    {
      title: "PDF, TXT y Markdown",
      text: "Admite apuntes, libros tecnicos y textos largos en formatos habituales para estudiar en navegador y escritorio."
    },
    {
      title: "Ajustes finos",
      text: "Modifica tamano de letra, ancho de pagina, brillo, densidad y modo paginado o de flujo."
    }
  ];

  const steps = [
    {
      title: "Elige un archivo",
      text: "Selecciona un archivo PDF, TXT o Markdown desde tu equipo."
    },
    {
      title: `${BRAND_NAME} lo prepara`,
      text: "La app convierte el documento en bloques de lectura mas limpios para pantalla."
    },
    {
      title: "Ajusta la lectura",
      text: "Cambia filtros, tamano, densidad, brillo y modo de lectura segun el momento."
    },
    {
      title: "Continua despues",
      text: "Guarda el progreso en tu biblioteca local para retomar la sesion cuando quieras."
    }
  ];

  const faqs = [
    {
      question: `Que es ${BRAND_NAME}?`,
      answer: `${BRAND_NAME} es un lector web y de escritorio para convertir PDF, TXT y Markdown en una experiencia de lectura mas comoda.`
    },
    {
      question: `Que formatos admite ${BRAND_NAME}?`,
      answer: "Admite PDF con texto seleccionable, archivos TXT y documentos Markdown."
    },
    {
      question: `Puedo usar ${BRAND_NAME} para estudiar apuntes en PDF?`,
      answer: "Si. Esta pensado para leer apuntes y documentos largos con filtros visuales, modo foco y ajustes de lectura."
    },
    {
      question: "Mis archivos se suben a internet?",
      answer: "No. La version web procesa los archivos seleccionados en el navegador. La app no necesita enviarlos a un servidor para convertirlos en lectura."
    },
    {
      question: "Puedo eliminar un libro sin borrar el archivo original?",
      answer: `Si. Eliminar un libro de la biblioteca borra la entrada local de ${BRAND_NAME}, no el archivo original de tu dispositivo.`
    },
    {
      question: "Funciona en navegador y escritorio?",
      answer: `Si. ${BRAND_NAME} tiene version web y version de escritorio con Electron.`
    },
    {
      question: "Tiene OCR para PDFs escaneados?",
      answer: "Todavia no. Los PDFs escaneados o basados en imagen pueden requerir OCR en una fase futura."
    }
  ];

  function scrollToSection(event, id) {
    event.preventDefault();
    const target = document.getElementById(id);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  return (
    <main className={`landing-page ${isExiting ? "is-exiting" : ""}`}>
      <header className="landing-header" aria-label="Navegacion principal">
        <a className="landing-brand" href="#inicio" aria-label={`${BRAND_NAME} inicio`}>
          <img className="brand-icon landing-brand-icon" src={BRAND_ICON_SRC} alt="" width="34" height="34" />
          <span>{BRAND_NAME}</span>
        </a>
        <nav className="landing-nav" aria-label="Secciones">
          <a href="#como-funciona" onClick={(event) => scrollToSection(event, "como-funciona")}>Como funciona</a>
          <a href="#formatos" onClick={(event) => scrollToSection(event, "formatos")}>Formatos</a>
          <a href="#preguntas" onClick={(event) => scrollToSection(event, "preguntas")}>Preguntas frecuentes</a>
          <button type="button" onClick={onEnter} disabled={isExiting}>Entrar</button>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <h1 id="landing-title">Lee tus documentos con la comodidad del papel</h1>
          <p className="landing-subtitle">
            Convierte PDF, TXT y Markdown en una lectura comoda y ajustable desde el navegador o la app de escritorio,
            con filtros visuales y modo foco para estudiar durante mas tiempo.
          </p>
          <div className="landing-actions">
            <button className="landing-primary" type="button" onClick={onEnter} disabled={isExiting}>
              Entrar a {BRAND_NAME}
              <ChevronRight size={22} />
            </button>
            <a className="landing-secondary" href="#como-funciona" onClick={(event) => scrollToSection(event, "como-funciona")}>
              Ver como funciona
            </a>
          </div>
          <p className="landing-trust-note">Los archivos se procesan en tu navegador.</p>
        </div>

        <div className="landing-preview" aria-hidden="true">
          <div className="reader-card">
            <span>Lectura actual</span>
            <strong>Pagina limpia, filtro calido y texto ajustable</strong>
            <div className="preview-lines">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="shelf-line">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="landing-section landing-intro" aria-labelledby="intro-title">
        <div className="section-heading">
          <h2 id="intro-title">Que es {BRAND_NAME}</h2>
          <p>
            {BRAND_NAME} es un lector PDF, TXT y Markdown para web y escritorio. Esta pensado para estudiantes,
            apuntes tecnicos, libros personales y lectura larga en distintos dispositivos.
          </p>
        </div>
      </section>

      <section className="landing-section landing-benefits" id="formatos" aria-labelledby="benefits-title">
        <div className="section-heading">
          <h2 id="benefits-title">Por que usar {BRAND_NAME}</h2>
          <p>Una interfaz sobria para leer documentos con menos fatiga visual y mas control sobre la pagina.</p>
        </div>
        <div className="benefit-grid">
          {benefits.map((benefit) => (
            <article key={benefit.title} className="landing-benefit">
              <h3>{benefit.title}</h3>
              <p>{benefit.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-steps" id="como-funciona" aria-labelledby="steps-title">
        <div className="section-heading">
          <h2 id="steps-title">Como funciona</h2>
          <p>Un flujo corto para pasar de archivo local a lectura ajustable sin cambiar tu forma de estudiar.</p>
        </div>
        <div className="steps-list">
          {steps.map((step, index) => (
            <article key={step.title} className="step-row">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-privacy" id="privacidad" aria-labelledby="privacy-title">
        <h2 id="privacy-title">Privacidad local-first, sin dramatizar</h2>
        <p>
          {BRAND_NAME} no necesita subir tus documentos para leerlos. La importacion se realiza desde el navegador y la
          biblioteca se guarda en el almacenamiento local disponible. Si borras los datos del navegador, tambien puedes
          perder la biblioteca guardada ahi.
        </p>
      </section>

      <section className="landing-section landing-faq" id="preguntas" aria-labelledby="faq-title">
        <div className="section-heading">
          <h2 id="faq-title">Preguntas frecuentes</h2>
          <p>Respuestas breves y verificables sobre formatos, lectura, privacidad y limites actuales.</p>
        </div>
        <div className="faq-list">
          {faqs.map((faq) => (
            <article key={faq.question} className="faq-item">
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final-cta" aria-labelledby="final-cta-title">
        <h2 id="final-cta-title">Abre el lector y prepara tu proxima sesion de lectura</h2>
        <p>Lee tus apuntes, libros tecnicos y documentos largos con una interfaz privada, tranquila y ajustable para web y escritorio.</p>
        <button className="landing-primary" type="button" onClick={onEnter} disabled={isExiting}>
          Abrir lector
          <ChevronRight size={22} />
        </button>
      </section>
    </main>
  );
}

function normalizeBookRecord(book) {
  return { ...book, isFavorite: Boolean(book.isFavorite) };
}

function isCompactReaderViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
}

function ReaderApp({ onReturnHome }) {
  const initial = useMemo(loadState, []);
  const prefersCompactReader = isCompactReaderViewport();
  const [books, setBooks] = useState(() => (initial.books?.length ? initial.books : DEFAULT_BOOKS).map(normalizeBookRecord));
  const [activeBookId, setActiveBookId] = useState(initial.activeBookId ?? "sample");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(initial.page ?? 0);
  const [importStatus, setImportStatus] = useState({ busy: false, message: "" });
  const [deleteCandidateId, setDeleteCandidateId] = useState(null);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    filter: initial.settings?.filter ?? "warm",
    fontSize: initial.settings?.fontSize ?? 20,
    lineHeight: initial.settings?.lineHeight ?? 1.72,
    pageWidth: initial.settings?.pageWidth ?? 720,
    brightness: initial.settings?.brightness ?? 92,
    readingMode: initial.settings?.readingMode ?? "paginated",
    density: initial.settings?.density ?? "normal",
    focusMode: initial.settings?.focusMode ?? false,
    showLibrary: initial.settings?.showLibrary ?? !prefersCompactReader,
    showSettings: initial.settings?.showSettings ?? !prefersCompactReader
  });
  const fileInputRef = useRef(null);
  const stageRef = useRef(null);
  const pageSurfaceRef = useRef(null);
  const readerViewportRef = useRef(null);
  const contentRef = useRef(null);
  const [layout, setLayout] = useState({ pageCount: 1, columnStep: 0, columnWidth: 0 });

  const activeBook = books.find((book) => book.id === activeBookId) ?? books[0] ?? EMPTY_BOOK;
  const hasActiveBook = Boolean(activeBook?.id);
  const deleteCandidate = books.find((book) => book.id === deleteCandidateId) ?? null;
  const activeBlocks = useMemo(
    () => normalizeReaderBlocks(activeBook.blocks ?? textToBlocks(activeBook.text ?? SAMPLE_TEXT)),
    [activeBook.blocks, activeBook.text]
  );
  const pageCount = settings.readingMode === "paginated" ? layout.pageCount : 1;
  const currentPage = settings.readingMode === "paginated" ? clamp(page, 0, pageCount - 1) : 0;
  const progress = settings.readingMode === "paginated" ? Math.round(((currentPage + 1) / pageCount) * 100) : 100;
  const filteredBooks = books.filter((book) =>
    `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    saveAppState({ books, activeBookId, page: currentPage, settings });
    saveReadingProgress(activeBookId, currentPage);
  }, [books, activeBookId, currentPage, settings]);

  useEffect(() => {
    setPage((value) => clamp(value, 0, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeBookId, currentPage, settings.readingMode]);

  useEffect(() => {
    if (!settings.showSettings && !settings.showLibrary) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        if (settings.showSettings) {
          updateSetting("showSettings", false);
          return;
        }

        if (isCompactReaderViewport()) {
          updateSetting("showLibrary", false);
        }
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [settings.showLibrary, settings.showSettings]);

  useLayoutEffect(() => {
    if (settings.readingMode !== "paginated") {
      setLayout({ pageCount: 1, columnStep: 0, columnWidth: 0 });
      return undefined;
    }

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const surface = readerViewportRef.current;
        const content = contentRef.current;
        if (!surface || !content) return;

        const columnGap = Number.parseFloat(getComputedStyle(content).columnGap || "0") || 0;
        const columnWidth = Math.max(320, surface.clientWidth);
        const columnStep = columnWidth + columnGap;
        content.style.setProperty("--reader-column-width", `${columnWidth}px`);
        const count = Math.max(1, Math.ceil((content.scrollWidth + columnGap) / columnStep));
        setLayout((current) =>
          current.pageCount === count && current.columnStep === columnStep && current.columnWidth === columnWidth
            ? current
            : { pageCount: count, columnStep, columnWidth }
        );
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (readerViewportRef.current) observer.observe(readerViewportRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    window.addEventListener("resize", measure);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [
    activeBlocks,
    settings.readingMode,
    settings.density,
    settings.fontSize,
    settings.lineHeight,
    settings.pageWidth,
    settings.showLibrary,
    settings.showSettings,
    settings.focusMode
  ]);

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function toggleLibraryPanel() {
    setSettings((current) => {
      const showLibrary = !current.showLibrary;
      return {
        ...current,
        showLibrary,
        showSettings: showLibrary && isCompactReaderViewport() ? false : current.showSettings
      };
    });
  }

  function closeLibraryPanel() {
    updateSetting("showLibrary", false);
  }

  function toggleSettingsPanel() {
    setSettings((current) => {
      const showSettings = !current.showSettings;
      return {
        ...current,
        showSettings,
        showLibrary: showSettings && isCompactReaderViewport() ? false : current.showLibrary
      };
    });
  }

  function toggleFavoriteBook(bookId) {
    if (!bookId) return;
    setBooks((current) =>
      current.map((book) => (book.id === bookId ? { ...book, isFavorite: !book.isFavorite } : book))
    );
  }

  function openBook(id) {
    setActiveBookId(id);
    setPage(loadReadingProgress(id));
    if (isCompactReaderViewport()) {
      closeLibraryPanel();
    }
  }

  function requestDeleteBook(bookId) {
    if (!bookId) return;
    setDeleteCandidateId(bookId);
  }

  function cancelDeleteBook() {
    setDeleteCandidateId(null);
  }

  function confirmDeleteBook() {
    if (!deleteCandidateId) return;
    deleteBookFromLibrary(deleteCandidateId);
  }

  function deleteBookFromLibrary(bookId) {
    const nextBooks = books.filter((book) => book.id !== bookId);
    setBooks(nextBooks);

    if (activeBookId === bookId) {
      setActiveBookId(nextBooks[0]?.id ?? null);
      setPage(0);
    }

    setDeleteCandidateId(null);
    setImportStatus({ busy: false, message: `Libro eliminado de ${BRAND_NAME}. El archivo original no se ha borrado.` });
  }

  function goToTocEntry(entry) {
    const normalizedTitle = entry.title.toLowerCase().replace(/\s+/g, " ").slice(0, 48);
    const targetIndex = activeBlocks.findIndex((block) =>
      blockText(block).toLowerCase().replace(/\s+/g, " ").includes(normalizedTitle)
    );

    if (targetIndex >= 0) {
      if (settings.readingMode === "flow") {
        pageSurfaceRef.current
          ?.querySelector(`[data-block-index="${targetIndex}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      requestAnimationFrame(() => {
        const element = pageSurfaceRef.current?.querySelector(`[data-block-index="${targetIndex}"]`);
        if (!element || !layout.columnStep) return;
        setPage(clamp(Math.floor(element.offsetLeft / layout.columnStep), 0, pageCount - 1));
      });
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportStatus({ busy: true, message: `Importando ${file.name}...` });

    try {
      const nextBook = await importBookFromBrowserFile(file);
      const normalizedBook = normalizeBookRecord(nextBook);

      setBooks((current) => [normalizedBook, ...current]);
      setActiveBookId(normalizedBook.id);
      setPage(0);
      if (isCompactReaderViewport()) {
        closeLibraryPanel();
      }
      setImportStatus({ busy: false, message: `${nextBook.title} importado.` });
    } catch (error) {
      setImportStatus({
        busy: false,
        message: error instanceof Error ? error.message : "No se pudo importar el archivo."
      });
    } finally {
      event.target.value = "";
    }
  }

  function nextPage() {
    if (settings.readingMode === "flow") {
      stageRef.current?.scrollBy({ top: stageRef.current.clientHeight * 0.86, behavior: "smooth" });
      return;
    }
    setPage((value) => clamp(value + 1, 0, pageCount - 1));
  }

  function previousPage() {
    if (settings.readingMode === "flow") {
      stageRef.current?.scrollBy({ top: -stageRef.current.clientHeight * 0.86, behavior: "smooth" });
      return;
    }
    setPage((value) => clamp(value - 1, 0, pageCount - 1));
  }

  return (
    <main className={`app ${FILTERS[settings.filter].className} ${settings.focusMode ? "focus-mode" : ""}`}>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={SUPPORTED_FILE_ACCEPT}
        onChange={handleImport}
      />

      {settings.showLibrary ? (
        <button
          className="library-backdrop"
          type="button"
          aria-label="Cerrar biblioteca"
          onClick={closeLibraryPanel}
        />
      ) : null}

      <aside className={`library ${settings.showLibrary ? "" : "is-hidden"}`} aria-label="Biblioteca">
        <div className="brand">
          <img className="brand-icon sidebar-brand-icon" src={BRAND_ICON_SRC} alt="" width="42" height="42" />
          <div>
            <strong>{BRAND_NAME}</strong>
            <span>Lector local</span>
          </div>
          <button
            className="home-link"
            type="button"
            onClick={onReturnHome}
            aria-label="Volver a la pagina principal"
            title="Volver al inicio"
          >
            <Home size={15} />
            Inicio
          </button>
          <button
            className="library-close"
            type="button"
            onClick={closeLibraryPanel}
            aria-label="Cerrar biblioteca"
            title="Cerrar biblioteca"
          >
            <X size={17} />
          </button>
        </div>

        <button className="primary-button" onClick={() => fileInputRef.current?.click()} disabled={importStatus.busy}>
          <FileUp size={17} />
          {importStatus.busy ? "Importando..." : "Importar libro"}
        </button>

        <p className="privacy-note">
          Tus libros se procesan localmente en tu dispositivo. No se suben a ningun servidor.
        </p>

        {importStatus.message ? <p className="import-status">{importStatus.message}</p> : null}

        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en biblioteca" />
        </label>

        <div className="book-list">
          {filteredBooks.map((book) => (
            <div
              key={book.id}
              className={`book-row ${book.id === activeBookId ? "is-active" : ""}`}
            >
              <button className="book-select" onClick={() => openBook(book.id)}>
                <span className="book-title-line">
                  <span className="book-title">{book.title}</span>
                  {book.isFavorite ? (
                    <Star className="book-favorite-icon" size={14} aria-label="Libro favorito" fill="currentColor" />
                  ) : null}
                </span>
                <span className="book-author">{book.author}</span>
              </button>
              <button
                className="book-delete"
                aria-label={`Eliminar ${book.title} de ${BRAND_NAME}`}
                title={`Eliminar de ${BRAND_NAME}`}
                onClick={() => requestDeleteBook(book.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        {activeBook.toc?.length ? (
          <nav className="toc-panel" aria-label="Indice del PDF">
            <strong>Indice detectado</strong>
            {activeBook.toc.slice(0, 24).map((entry, index) => (
              <button key={`${entry.title}-${index}`} onClick={() => goToTocEntry(entry)}>
                <span>{entry.title}</span>
                <small>{entry.page}</small>
              </button>
            ))}
          </nav>
        ) : null}
      </aside>

      <section className="reader-shell" aria-label="Lector">
        <header className="reader-toolbar">
          <button
            className="icon-button"
            title={settings.showLibrary ? "Cerrar biblioteca" : "Abrir biblioteca"}
            aria-label={settings.showLibrary ? "Cerrar biblioteca" : "Abrir biblioteca"}
            onClick={toggleLibraryPanel}
          >
            <PanelLeftClose size={18} />
          </button>
          <div className="title-block">
            <span>{activeBook.title}</span>
            <small>{progress}% leido</small>
          </div>
          <div className="toolbar-actions">
            <button
              className={`icon-button favorite-button ${activeBook.isFavorite ? "is-active" : ""}`}
              title={activeBook.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              aria-label={activeBook.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              onClick={() => toggleFavoriteBook(activeBook.id)}
              disabled={!hasActiveBook}
            >
              <Bookmark size={18} fill={activeBook.isFavorite ? "currentColor" : "none"} />
            </button>
            <button
              className={`icon-button ${settings.focusMode ? "is-active" : ""}`}
              title="Modo foco"
              onClick={() => updateSetting("focusMode", !settings.focusMode)}
            >
              <Focus size={18} />
            </button>
            <button
              className="icon-button"
              title={settings.showSettings ? "Cerrar ajustes" : "Abrir ajustes"}
              aria-label={settings.showSettings ? "Cerrar ajustes" : "Abrir ajustes"}
              onClick={toggleSettingsPanel}
            >
              <PanelRightClose size={18} />
            </button>
          </div>
        </header>

        <article
          ref={stageRef}
          className={`reading-stage reader-mode-${settings.readingMode} ${DENSITIES[settings.density].className}`}
          style={{
            "--reader-width": `${settings.pageWidth}px`,
            "--reader-base-font": `${settings.fontSize}px`,
            "--reader-line": settings.lineHeight,
            "--reader-brightness": `${settings.brightness}%`,
            "--reader-page-offset": `${currentPage * layout.columnStep}px`
          }}
        >
          <div className="page-surface" ref={pageSurfaceRef}>
            <div className="reader-viewport" ref={readerViewportRef}>
              <div className="reader-content" ref={contentRef}>
                {activeBlocks.map((block, index) => (
                  <ReaderBlock
                    key={`${index}-${blockText(block).slice(0, 16)}`}
                    block={block}
                    index={index}
                  />
                ))}
              </div>
            </div>
          </div>
        </article>

        <footer className="page-controls">
          <button className="nav-button" onClick={previousPage} disabled={settings.readingMode === "paginated" && currentPage === 0}>
            <ChevronLeft size={18} />
            Anterior
          </button>
          <div className="progress-track" aria-label={`Progreso ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="page-count">
            {settings.readingMode === "paginated" ? `${currentPage + 1} / ${pageCount}` : "Flujo"}
          </span>
          <button className="nav-button" onClick={nextPage} disabled={settings.readingMode === "paginated" && currentPage === pageCount - 1}>
            Siguiente
            <ChevronRight size={18} />
          </button>
        </footer>
      </section>

      <aside className={`settings-panel ${settings.showSettings ? "" : "is-hidden"}`} aria-label="Ajustes de lectura">
        <div className="settings-drawer">
          <div className="panel-heading">
            <Settings size={18} />
            <strong>Ajustes</strong>
            <button
              className="settings-close"
              type="button"
              onClick={() => updateSetting("showSettings", false)}
              aria-label="Cerrar ajustes"
            >
              <X size={17} />
            </button>
          </div>

          <section className="control-group">
            <span className="control-label">
              <Eye size={16} />
              Filtro visual
            </span>
            <div className="segmented">
              {Object.entries(FILTERS).map(([key, value]) => (
                <button
                  key={key}
                  className={settings.filter === key ? "is-selected" : ""}
                  onClick={() => updateSetting("filter", key)}
                >
                  {value.name}
                </button>
              ))}
            </div>
          </section>

          <section className="control-group">
            <span className="control-label">
              <BookOpen size={16} />
              Modo de lectura
            </span>
            <div className="segmented">
              <button
                className={settings.readingMode === "paginated" ? "is-selected" : ""}
                onClick={() => updateSetting("readingMode", "paginated")}
              >
                Paginado
              </button>
              <button
                className={settings.readingMode === "flow" ? "is-selected" : ""}
                onClick={() => updateSetting("readingMode", "flow")}
              >
                Flujo
              </button>
            </div>
          </section>

          <section className="control-group">
            <span className="control-label">
              <AlignJustify size={16} />
              Densidad
            </span>
            <div className="segmented density-control">
              {Object.entries(DENSITIES).map(([key, value]) => (
                <button
                  key={key}
                  className={settings.density === key ? "is-selected" : ""}
                  onClick={() => updateSetting("density", key)}
                >
                  {value.name}
                </button>
              ))}
            </div>
          </section>

          <section className="advanced-settings">
            <button
              className="advanced-toggle"
              type="button"
              aria-expanded={advancedSettingsOpen}
              onClick={() => setAdvancedSettingsOpen((value) => !value)}
            >
              <span>Ajustes avanzados</span>
              <ChevronRight className={advancedSettingsOpen ? "is-open" : ""} size={17} />
            </button>

            {advancedSettingsOpen ? (
              <div className="advanced-settings-body">
                <Slider
                  icon={<Type size={16} />}
                  label="Tamano de letra"
                  value={settings.fontSize}
                  min={16}
                  max={30}
                  step={1}
                  unit="px"
                  onChange={(value) => updateSetting("fontSize", value)}
                />
                <Slider
                  icon={<AlignJustify size={16} />}
                  label="Altura de linea"
                  value={settings.lineHeight}
                  min={1.35}
                  max={2}
                  step={0.05}
                  unit="x"
                  onChange={(value) => updateSetting("lineHeight", value)}
                />
                <Slider
                  icon={<Minus size={16} />}
                  label="Ancho de pagina"
                  value={settings.pageWidth}
                  min={520}
                  max={920}
                  step={20}
                  unit="px"
                  onChange={(value) => updateSetting("pageWidth", value)}
                />
                <Slider
                  icon={settings.filter === "night" ? <Moon size={16} /> : <SunMedium size={16} />}
                  label="Brillo del papel"
                  value={settings.brightness}
                  min={70}
                  max={104}
                  step={1}
                  unit="%"
                  onChange={(value) => updateSetting("brightness", value)}
                />

                <section className="control-group">
                  <button className="wide-button" onClick={() => updateSetting("fontSize", clamp(settings.fontSize - 1, 16, 30))}>
                    <Minus size={16} />
                    Reducir texto
                  </button>
                  <button className="wide-button" onClick={() => updateSetting("fontSize", clamp(settings.fontSize + 1, 16, 30))}>
                    <Plus size={16} />
                    Ampliar texto
                  </button>
                </section>
              </div>
            ) : null}
          </section>
        </div>
      </aside>

      {deleteCandidate ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-book-title">
            <h2 id="delete-book-title">Eliminar libro</h2>
            <p>
              ¿Seguro que quieres eliminar este libro de {BRAND_NAME}? El archivo original no se borrara.
            </p>
            <strong>{deleteCandidate.title}</strong>
            <div className="dialog-actions">
              <button className="wide-button secondary" onClick={cancelDeleteBook}>
                Cancelar
              </button>
              <button className="wide-button danger" onClick={confirmDeleteBook}>
                Eliminar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Slider({ icon, label, value, min, max, step, unit, onChange }) {
  return (
    <label className="slider-control">
      <span className="control-label">
        {icon}
        {label}
        <output>{`${value}${unit}`}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ReaderBlock({ block, index }) {
  const blockProps = { "data-block-index": index };

  if (block.type === "heading") {
    const Heading = block.level === 1 ? "h1" : "h2";
    return (
      <Heading {...blockProps}>
        <ReaderRuns runs={block.runs} />
      </Heading>
    );
  }

  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List {...blockProps}>
        {block.items.map((item, index) => (
          <li key={`${index}-${item.runs.map((run) => run.text).join("").slice(0, 16)}`}>
            <ReaderRuns runs={item.runs} />
          </li>
        ))}
      </List>
    );
  }

  if (block.type === "quote") {
    return (
      <blockquote {...blockProps}>
        <ReaderRuns runs={block.runs} />
      </blockquote>
    );
  }

  if (block.type === "link") {
    return (
      <p className="link-block" {...blockProps}>
        <ReaderRuns runs={block.runs} />
      </p>
    );
  }

  if (block.type === "table-warning") {
    return <aside className="table-warning" {...blockProps}>{block.text}</aside>;
  }

  const paragraphClassName = block.emphasis ? "reader-paragraph reader-paragraph--emphasis" : "reader-paragraph";

  return (
    <p className={paragraphClassName} {...blockProps}>
      <ReaderRuns runs={block.runs} />
    </p>
  );
}

function ReaderRuns({ runs }) {
  return runs.map((run, index) => {
    let content = run.text;

    if (run.bold) {
      content = <strong>{content}</strong>;
    }

    if (run.italic) {
      content = <em>{content}</em>;
    }

    if (run.href) {
      return (
        <a key={`${index}-${run.text}`} href={run.href} target="_blank" rel="noreferrer">
          {content}
        </a>
      );
    }

    return <React.Fragment key={`${index}-${run.text}`}>{content}</React.Fragment>;
  });
}

createRoot(document.getElementById("root")).render(<App />);
