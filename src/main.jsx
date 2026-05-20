import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { blockText, SUPPORTED_FILE_ACCEPT, textToBlocks } from "./core/bookParser";
import {
  loadAppState,
  loadBookNotes,
  loadReadingProgress,
  saveAppState,
  saveBookNotes,
  saveReadingProgress
} from "./core/storage";
import { importBookFromBrowserFile } from "./adapters/fileImport";
import {
  AlignJustify,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileUp,
  Github,
  Home,
  Minus,
  Moon,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Search,
  Settings,
  Star,
  StickyNote,
  SunMedium,
  Trash2,
  Type,
  X
} from "lucide-react";
import "./styles.css";

const BRAND_NAME = "Papel Vivo";
const BRAND_SLUG = "papel-vivo";
const BRAND_ICON_SRC = "/brand/papel-vivo-icon.png";
const GITHUB_REPO_URL = "https://github.com/Javizs/Papel-Vivo";
const APP_TARGET = getAppTarget();

const CURRENT_MANUAL_TEXT = `Papel Vivo

Lector local de PDFs para leer, estudiar y retomar documentos sin subirlos a ningun servidor.

Bienvenido a Papel Vivo. Esta aplicacion permite abrir documentos PDF directamente desde tu dispositivo y leerlos desde el navegador. Los archivos no se suben a ningun servidor: la lectura, el progreso, las notas y los puntos guardados se gestionan de forma local.

Como empezar

1. Pulsa el boton para importar o abrir un PDF.
2. Elige un archivo desde tu dispositivo.
3. Usa la biblioteca lateral para volver a documentos recientes.
4. Cambia entre modo paginado y modo flujo segun prefieras leer pagina a pagina o de forma continua.

Modos de lectura

El modo paginado organiza el documento en paginas de lectura y permite avanzar con botones o gestos horizontales. El modo flujo une el contenido en una lectura continua para desplazarte verticalmente.

Herramientas de lectura

- Usa los botones de anterior y siguiente para moverte entre paginas.
- Ajusta el tamano de letra, altura de linea, ancho de pagina y brillo desde los ajustes.
- Cambia el filtro visual para leer en modo calido, papel, tinta o noche.
- Usa las opciones de densidad para una lectura mas compacta o mas aireada.

Punto de lectura guardado

Pulsa el icono de marcador para guardar el punto exacto en el que te has quedado. Papel Vivo muestra una confirmacion visual y deja una marca discreta. Al volver a abrir el documento, la app intentara continuar desde ese punto.

Buscar dentro del PDF

La lupa del lector abre el buscador interno del documento. Es distinto del buscador de biblioteca: sirve para encontrar palabras o frases dentro del PDF abierto. Los resultados muestran la pagina y un fragmento de contexto; al pulsarlos, Papel Vivo te lleva a esa zona.

Notas por pagina

El icono de nota adhesiva permite crear notas asociadas a la pagina actual. Puedes verlas, editarlas o eliminarlas desde el panel de notas o desde el icono que aparece en la lectura. Las notas se sincronizan entre modo paginado y modo flujo porque pertenecen al libro y a la pagina, no al modo de lectura.

Iconos importantes

- La estrella marca un libro como favorito en la biblioteca.
- El marcador guarda tu punto de lectura manual.
- La nota adhesiva guarda una anotacion de pagina.

Privacidad

Papel Vivo esta pensado como una herramienta local-first. Tus PDFs no se envian a servidores externos. El progreso, ajustes, favoritos, notas y marcas de lectura se guardan en el navegador del dispositivo.

Papel Vivo todavia es un prototipo en evolucion, pero su objetivo es ofrecer una experiencia de lectura comoda, privada y sencilla para estudiar o consultar documentos.`;

const DEFAULT_BOOKS = [
  {
    id: "sample",
    title: "Papel Vivo - guía de inicio",
    author: BRAND_NAME,
    blocks: textToBlocks(CURRENT_MANUAL_TEXT),
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
const SWIPE_PAGE_THRESHOLD = 80;
const SWIPE_PAGE_COOLDOWN_MS = 420;
const MODE_RESTORE_FRAME_DELAY = 2;
const NO_SWIPE_SELECTOR = "button, a, input, textarea, select, [role='button'], .no-swipe";
const VISUAL_SETTING_KEYS = ["filter", "fontSize", "lineHeight", "pageWidth", "brightness", "density"];
const SAVE_POINT_FEEDBACK_MS = 1100;
const AUTO_SAVE_DELAY_MS = 1200;
const FLOW_PROGRESS_MIN_DELTA = 0.003;
const SEARCH_HIGHLIGHT_MS = 1800;
const MAX_SEARCH_RESULTS = 80;

function getAppTarget() {
  const configuredTarget = import.meta.env?.VITE_APP_TARGET;
  const queryTarget =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("target") : null;
  const target = queryTarget || configuredTarget || "web";
  return ["desktop", "android"].includes(target) ? target : "web";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getScrollableProgressRatio(element) {
  if (!element) return 0;
  const scrollableDistance = element.scrollHeight - element.clientHeight;
  if (scrollableDistance <= 0) return 0;
  return clamp(element.scrollTop / scrollableDistance, 0, 1);
}

function getProgressPage(progress) {
  return typeof progress === "number" ? progress : progress?.currentPage ?? progress?.page ?? 0;
}

function getProgressRatio(progress) {
  if (typeof progress === "number") return 0;
  if (typeof progress?.flowScrollRatio === "number") return progress.flowScrollRatio;
  if (typeof progress?.percentageRead === "number") return progress.percentageRead / 100;
  if (typeof progress?.percent === "number") return progress.percent / 100;
  return 0;
}

function getVisualSettingsSnapshot(settings) {
  return VISUAL_SETTING_KEYS.reduce((snapshot, key) => ({ ...snapshot, [key]: settings[key] }), {});
}

function getManualReadingPoint(progress) {
  return typeof progress === "object" && progress?.savedReadingPoint ? progress.savedReadingPoint : null;
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getBlockPageNumber(block) {
  const page = block?.pageStart ?? block?.pageEnd;
  return Number.isFinite(page) ? Math.max(1, page) : 1;
}

function createSearchExcerpt(text, query) {
  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(query);
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  const start = Math.max(0, matchIndex - 54);
  const end = Math.min(text.length, Math.max(matchIndex, 0) + query.length + 74);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function buildDocumentSearchIndex(blocks) {
  return blocks
    .map((block, index) => {
      const text = blockText(block).replace(/\s+/g, " ").trim();
      return {
        blockIndex: index,
        page: getBlockPageNumber(block),
        text,
        normalizedText: normalizeSearchText(text)
      };
    })
    .filter((entry) => entry.text);
}

function searchDocumentIndex(index, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return index
    .filter((entry) => entry.normalizedText.includes(normalizedQuery))
    .slice(0, MAX_SEARCH_RESULTS)
    .map((entry) => ({
      ...entry,
      excerpt: createSearchExcerpt(entry.text, query)
    }));
}

function createNoteId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBookNotes(rawNotes, bookId) {
  return (Array.isArray(rawNotes) ? rawNotes : [])
    .filter((note) => note?.text)
    .map((note) => {
      const { mode, ...rest } = note;
      const legacyPage = Number.isFinite(note.page) ? note.page : 0;
      const page = note.schemaVersion >= 2 ? Math.max(1, legacyPage) : Math.max(1, legacyPage + 1);
      return {
        ...rest,
        id: note.id ?? createNoteId(),
        bookId: note.bookId ?? bookId,
        page,
        text: String(note.text),
        createdAt: note.createdAt ?? Date.now(),
        updatedAt: note.updatedAt ?? note.createdAt ?? Date.now(),
        schemaVersion: 2
      };
    });
}

function getPreferredReadingProgress(progress) {
  const savedReadingPoint = getManualReadingPoint(progress);
  if (!savedReadingPoint) return progress;

  return {
    ...(typeof progress === "object" && progress ? progress : {}),
    currentPage: savedReadingPoint.page,
    percentageRead: savedReadingPoint.percent,
    readingMode: savedReadingPoint.mode,
    flowScrollTop: savedReadingPoint.flowScroll,
    flowScrollRatio: savedReadingPoint.flowScrollRatio,
    visualSettings: savedReadingPoint.visualSettings ?? progress?.visualSettings,
    savedReadingPoint
  };
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
  const startInReader = APP_TARGET === "desktop" || APP_TARGET === "android";
  const [hasEnteredApp, setHasEnteredApp] = useState(startInReader);
  const [isEnteringApp, setIsEnteringApp] = useState(false);

  function enterApp() {
    setIsEnteringApp(true);
    window.setTimeout(() => setHasEnteredApp(true), ENTRY_ANIMATION_MS);
  }

  function returnHome() {
    if (startInReader) return;
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
      title: "Lectura más cómoda",
      text: "Convierte documentos largos en una lectura con ancho controlado, buen espaciado y una superficie tipo papel."
    },
    {
      title: "Filtros visuales",
      text: "Cambia entre estilos cálidos, papel, tinta o noche para adaptar la pantalla a la sesión."
    },
    {
      title: "Biblioteca local",
      text: "Mantiene tus libros y progreso en el almacenamiento local disponible del navegador o de la app."
    },
    {
      title: "PDF, TXT y Markdown",
      text: "Admite apuntes, libros técnicos y textos largos en formatos habituales para estudiar en navegador y escritorio."
    },
    {
      title: "Ajustes finos",
      text: "Modifica tamaño de letra, ancho de página, brillo, densidad y modo paginado o de flujo."
    }
  ];

  const steps = [
    {
      title: "Elige un archivo",
      text: "Selecciona un archivo PDF, TXT o Markdown desde tu equipo."
    },
    {
      title: `${BRAND_NAME} lo prepara`,
      text: "La app convierte el documento en bloques de lectura más limpios para pantalla."
    },
    {
      title: "Ajusta la lectura",
      text: "Cambia filtros, tamaño, densidad, brillo y modo de lectura según el momento."
    },
    {
      title: "Continúa después",
      text: "Guarda el progreso en tu biblioteca local para retomar la sesión cuando quieras."
    }
  ];

  const currentBenefits = [
    {
      title: "Lectura local de PDFs",
      text: "Abre PDFs desde tu dispositivo y leelos en navegador con modo paginado o flujo continuo."
    },
    {
      title: "Privacidad local-first",
      text: "Tus archivos no se suben a servidores. La biblioteca, progreso y notas se guardan localmente."
    },
    {
      title: "Punto guardado",
      text: "Marca con el icono de marcador el punto exacto al que quieres volver en tu lectura."
    },
    {
      title: "Busqueda interna",
      text: "Busca palabras o frases dentro del PDF abierto y salta directamente a la pagina encontrada."
    },
    {
      title: "Notas por pagina",
      text: "Crea, consulta, edita y elimina notas asociadas a paginas, visibles en paginado y flujo."
    },
    {
      title: "Ajustes visuales",
      text: "Modifica filtro, densidad, tamano de letra, ancho de pagina y brillo para leer con comodidad."
    }
  ];

  const currentSteps = [
    {
      title: "Importa un PDF",
      text: "Selecciona un documento local desde tu dispositivo. Papel Vivo lo prepara en el navegador."
    },
    {
      title: "Elige como leer",
      text: "Usa modo paginado para avanzar por paginas o modo flujo para desplazarte de forma continua."
    },
    {
      title: "Ajusta y busca",
      text: "Cambia filtros, densidad, tamano, ancho y brillo, y busca texto dentro del documento abierto."
    },
    {
      title: "Guarda y anota",
      text: "Marca tu punto de lectura, guarda favoritos y crea notas por pagina sin salir del navegador."
    }
  ];

  const faqs = [
    {
      question: `¿Qué es ${BRAND_NAME}?`,
      answer: `${BRAND_NAME} es un lector web y de escritorio para convertir PDF, TXT y Markdown en una experiencia de lectura más cómoda.`
    },
    {
      question: `¿Qué formatos admite ${BRAND_NAME}?`,
      answer: "Admite PDF con texto seleccionable, archivos TXT y documentos Markdown."
    },
    {
      question: `¿Puedo usar ${BRAND_NAME} para estudiar apuntes en PDF?`,
      answer: "Sí. Está pensado para leer apuntes y documentos largos con filtros visuales, notas y ajustes de lectura."
    },
    {
      question: "¿Mis archivos se suben a internet?",
      answer: "No. La versión web procesa los archivos seleccionados en el navegador. La app no necesita enviarlos a un servidor para convertirlos en lectura."
    },
    {
      question: "¿Puedo eliminar un libro sin borrar el archivo original?",
      answer: `Sí. Eliminar un libro de la biblioteca borra la entrada local de ${BRAND_NAME}, no el archivo original de tu dispositivo.`
    },
    {
      question: "¿Funciona en navegador y escritorio?",
      answer: `Sí. ${BRAND_NAME} tiene versión web y versión de escritorio con Electron.`
    },
    {
      question: "¿Tiene OCR para PDFs escaneados?",
      answer: "Todavía no. Los PDFs escaneados o basados en imagen pueden requerir OCR en una fase futura."
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
      <header className="landing-header" aria-label="Navegación principal">
        <a className="landing-brand" href="#inicio" aria-label={`${BRAND_NAME} inicio`}>
          <img className="brand-icon landing-brand-icon" src={BRAND_ICON_SRC} alt="" width="34" height="34" />
          <span>{BRAND_NAME}</span>
        </a>
        <nav className="landing-nav" aria-label="Secciones">
          <a href="#como-funciona" onClick={(event) => scrollToSection(event, "como-funciona")}>Cómo funciona</a>
          <a href="#formatos" onClick={(event) => scrollToSection(event, "formatos")}>Formatos</a>
          <a href="#preguntas" onClick={(event) => scrollToSection(event, "preguntas")}>Preguntas frecuentes</a>
          <button type="button" onClick={onEnter} disabled={isExiting}>Entrar</button>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <h1 id="landing-title">Lee, busca y anota tus PDFs sin subirlos</h1>
          <p className="landing-subtitle">
            Papel Vivo es un lector local para PDFs con modo paginado y flujo, busqueda dentro del documento,
            notas por pagina, punto de lectura guardado y ajustes visuales para estudiar con comodidad.
          </p>
          <div className="landing-actions">
            <button className="landing-primary" type="button" onClick={onEnter} disabled={isExiting}>
              Entrar a {BRAND_NAME}
              <ChevronRight size={22} />
            </button>
            <a className="landing-secondary" href="#como-funciona" onClick={(event) => scrollToSection(event, "como-funciona")}>
              Ver cómo funciona
            </a>
            <a className="landing-secondary landing-github-link" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
              <Github size={19} />
              Repositorio y descargas
            </a>
          </div>
          <p className="landing-trust-note">Los archivos se procesan en tu navegador. Consulta el codigo fuente y, cuando esten listas, las versiones descargables para escritorio y Android desde el repositorio del proyecto.</p>
        </div>

        <div className="landing-preview" aria-hidden="true">
          <div className="reader-card">
            <span>Lectura actual</span>
            <strong>Página limpia, filtro cálido y texto ajustable</strong>
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
          <h2 id="intro-title">Qué es {BRAND_NAME}</h2>
          <p>
            {BRAND_NAME} es un lector PDF, TXT y Markdown para web y escritorio. Está pensado para estudiantes,
            apuntes técnicos, libros personales y lectura larga en distintos dispositivos.
          </p>
        </div>
      </section>

      <section className="landing-section landing-benefits" id="formatos" aria-labelledby="benefits-title">
        <div className="section-heading">
          <h2 id="benefits-title">Por qué usar {BRAND_NAME}</h2>
          <p>Una interfaz sobria para leer documentos con menos fatiga visual y más control sobre la página.</p>
        </div>
        <div className="benefit-grid">
          {currentBenefits.map((benefit) => (
            <article key={benefit.title} className="landing-benefit">
              <h3>{benefit.title}</h3>
              <p>{benefit.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-steps" id="como-funciona" aria-labelledby="steps-title">
        <div className="section-heading">
          <h2 id="steps-title">Cómo funciona</h2>
          <p>Un flujo corto para pasar de archivo local a lectura ajustable sin cambiar tu forma de estudiar.</p>
        </div>
        <div className="steps-list">
          {currentSteps.map((step, index) => (
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
          {BRAND_NAME} no necesita subir tus documentos para leerlos. La importación se realiza desde el navegador y la
          biblioteca se guarda en el almacenamiento local disponible. Si borras los datos del navegador, también puedes
          perder la biblioteca guardada ahí.
        </p>
      </section>

      <section className="landing-section landing-faq" id="preguntas" aria-labelledby="faq-title">
        <div className="section-heading">
          <h2 id="faq-title">Preguntas frecuentes</h2>
          <p>Respuestas breves y verificables sobre formatos, lectura, privacidad y límites actuales.</p>
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
        <h2 id="final-cta-title">Abre el lector y prepara tu próxima sesión de lectura</h2>
        <p>Lee tus apuntes, libros técnicos y documentos largos con una interfaz privada, tranquila y ajustable para web y escritorio.</p>
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
  const initialProgress = useMemo(() => loadReadingProgress(initial.activeBookId ?? "sample"), [initial.activeBookId]);
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
    showLibrary: initial.settings?.showLibrary ?? !prefersCompactReader,
    showSettings: initial.settings?.showSettings ?? !prefersCompactReader
  });
  const fileInputRef = useRef(null);
  const stageRef = useRef(null);
  const pageSurfaceRef = useRef(null);
  const readerViewportRef = useRef(null);
  const contentRef = useRef(null);
  const pendingModeRestoreRef = useRef(null);
  const lastPaginatedPageCountRef = useRef(1);
  const swipeRef = useRef(null);
  const lastSwipePageTurnRef = useRef(0);
  const saveFeedbackTimerRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const lastAutoSaveSignatureRef = useRef("");
  const searchTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const lastFlowProgressRatioRef = useRef(0);
  const [layout, setLayout] = useState({ pageCount: 1, columnStep: 0, columnWidth: 0 });
  const [flowProgressRatio, setFlowProgressRatio] = useState(0);
  const [restoreRequestId, setRestoreRequestId] = useState(0);
  const [activeProgress, setActiveProgress] = useState(initialProgress);
  const [manualReadingPoint, setManualReadingPoint] = useState(() => getManualReadingPoint(initialProgress));
  const [saveFeedbackVisible, setSaveFeedbackVisible] = useState(false);
  const [activeReaderTool, setActiveReaderTool] = useState(null);
  const [documentSearchQuery, setDocumentSearchQuery] = useState("");
  const [documentSearchResults, setDocumentSearchResults] = useState([]);
  const [documentSearchStatus, setDocumentSearchStatus] = useState("");
  const [documentSearchBusy, setDocumentSearchBusy] = useState(false);
  const [highlightedBlockIndex, setHighlightedBlockIndex] = useState(null);
  const [currentDocumentPage, setCurrentDocumentPage] = useState(1);
  const [notes, setNotes] = useState(() =>
    normalizeBookNotes(loadBookNotes(initial.activeBookId ?? "sample"), initial.activeBookId ?? "sample")
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [selectedNoteId, setSelectedNoteId] = useState(null);

  const activeBook = useMemo(
    () => books.find((book) => book.id === activeBookId) ?? books[0] ?? EMPTY_BOOK,
    [activeBookId, books]
  );
  const hasActiveBook = Boolean(activeBook?.id);
  const deleteCandidate = books.find((book) => book.id === deleteCandidateId) ?? null;
  const activeBlocks = useMemo(
    () => normalizeReaderBlocks(activeBook.blocks ?? textToBlocks(activeBook.text ?? CURRENT_MANUAL_TEXT)),
    [activeBook.blocks, activeBook.text]
  );
  const documentSearchIndex = useMemo(() => buildDocumentSearchIndex(activeBlocks), [activeBlocks]);
  const pageCount = settings.readingMode === "paginated" ? layout.pageCount : 1;
  const currentPage = settings.readingMode === "paginated" ? clamp(page, 0, pageCount - 1) : 0;
  const progress =
    settings.readingMode === "paginated"
      ? Math.round(((currentPage + 1) / pageCount) * 100)
      : Math.round(flowProgressRatio * 100);
  const persistedPage =
    settings.readingMode === "paginated"
      ? currentPage
      : Math.round(flowProgressRatio * Math.max(lastPaginatedPageCountRef.current - 1, 0));
  const filteredBooks = useMemo(
    () => books.filter((book) => `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase())),
    [books, query]
  );
  const effectiveReadingPoint = manualReadingPoint?.bookId === activeBookId ? manualReadingPoint : getManualReadingPoint(activeProgress);
  const isManualPointOnCurrentPage =
    effectiveReadingPoint?.mode === "paginated" && settings.readingMode === "paginated" && effectiveReadingPoint.page === currentPage;
  const flowPointOffset =
    effectiveReadingPoint?.mode === "flow" && settings.readingMode === "flow"
      ? effectiveReadingPoint.flowMarkerOffset ?? effectiveReadingPoint.flowScroll ?? 0
      : null;
  const notesForCurrentBook = useMemo(
    () => notes.filter((note) => note.bookId === activeBookId),
    [activeBookId, notes]
  );
  const notesOnCurrentPage = notesForCurrentBook.filter((note) => note.page === currentDocumentPage);
  const selectedNote = notesForCurrentBook.find((note) => note.id === selectedNoteId) ?? null;
  const blockIndexByDocumentPage = useMemo(() => {
    const indexByPage = new Map();
    activeBlocks.forEach((block, index) => {
      const start = block?.pageStart ?? block?.pageEnd ?? 1;
      const end = block?.pageEnd ?? start;
      for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
        if (!indexByPage.has(pageNumber)) indexByPage.set(pageNumber, index);
      }
    });
    return indexByPage;
  }, [activeBlocks]);
  const noteMarkersByBlock = useMemo(() => {
    const markers = new Map();
    notesForCurrentBook.forEach((note) => {
      const blockIndex = blockIndexByDocumentPage.get(note.page);
      if (typeof blockIndex !== "number") return;
      markers.set(blockIndex, [...(markers.get(blockIndex) ?? []), note]);
    });
    return markers;
  }, [blockIndexByDocumentPage, notesForCurrentBook]);
  const hasSavedProgress =
    hasActiveBook &&
    (Boolean(effectiveReadingPoint) ||
      getProgressPage(activeProgress) > 0 ||
      getProgressRatio(activeProgress) > 0 ||
      Boolean(activeProgress?.lastReadAt));

  useEffect(() => {
    const flowScrollRatio = getScrollableProgressRatio(stageRef.current);
    const readingProgress = {
      ...(typeof activeProgress === "object" && activeProgress ? activeProgress : {}),
      currentPage: persistedPage,
      percentageRead: progress,
      readingMode: settings.readingMode,
      flowScrollTop: settings.readingMode === "flow" ? stageRef.current?.scrollTop ?? 0 : activeProgress?.flowScrollTop ?? 0,
      flowScrollRatio: settings.readingMode === "flow" ? flowScrollRatio : activeProgress?.flowScrollRatio ?? 0,
      visualSettings: getVisualSettingsSnapshot(settings),
      lastReadAt: new Date().toISOString()
    };

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      const saveSignature = JSON.stringify({
        activeBookId,
        persistedPage,
        progress,
        readingMode: settings.readingMode,
        flowScrollTop: readingProgress.flowScrollTop,
        flowScrollRatio: readingProgress.flowScrollRatio,
        visualSettings: readingProgress.visualSettings,
        booksUpdatedAt: books.map((book) => `${book.id}:${book.isFavorite ? 1 : 0}`).join("|")
      });
      if (saveSignature === lastAutoSaveSignatureRef.current) return;
      lastAutoSaveSignatureRef.current = saveSignature;
      saveAppState({ books, activeBookId, page: persistedPage, settings });
      saveReadingProgress(activeBookId, readingProgress);
      setActiveProgress(readingProgress);
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [books, activeBookId, persistedPage, progress, settings, flowProgressRatio]);

  useEffect(() => {
    const savedProgress = loadReadingProgress(activeBookId);
    const savedReadingPoint = getManualReadingPoint(savedProgress);
    const loadedNotes = loadBookNotes(activeBookId);
    const normalizedNotes = normalizeBookNotes(loadedNotes, activeBookId);
    setActiveProgress(savedProgress);
    setManualReadingPoint(savedReadingPoint);
    lastAutoSaveSignatureRef.current = "";
    setNotes(normalizedNotes);
    if (JSON.stringify(loadedNotes) !== JSON.stringify(normalizedNotes)) {
      saveBookNotes(activeBookId, normalizedNotes);
    }
    setNoteDraft("");
    setEditingNoteId(null);
    setSelectedNoteId(null);
    setDocumentSearchResults([]);
    setDocumentSearchStatus("");
    setHighlightedBlockIndex(null);

    if (savedReadingPoint) {
      applyBookProgress(activeBookId, savedProgress);
      setImportStatus({
        busy: false,
        message: `Punto de lectura guardado detectado. Continuando en la página ${savedReadingPoint.page + 1}.`
      });
      return;
    }

    if (savedProgress?.lastReadAt) {
      applyBookProgress(activeBookId, savedProgress);
      setImportStatus({ busy: false, message: "Progreso guardado detectado. Continuando desde la última lectura." });
    }
  }, [activeBookId]);

  useEffect(
    () => () => {
      if (saveFeedbackTimerRef.current) {
        window.clearTimeout(saveFeedbackTimerRef.current);
      }
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (settings.readingMode === "paginated") {
      lastPaginatedPageCountRef.current = pageCount;
    }
  }, [pageCount, settings.readingMode]);

  useEffect(() => {
    if (pendingModeRestoreRef.current?.mode === "paginated") return;
    setPage((value) => clamp(value, 0, pageCount - 1));
  }, [pageCount]);

  useLayoutEffect(() => {
    let frame = requestAnimationFrame(() => {
      setCurrentDocumentPage(detectCurrentDocumentPage());
    });
    return () => cancelAnimationFrame(frame);
  }, [activeBlocks, currentPage, flowProgressRatio, layout.columnStep, layout.columnWidth, settings.readingMode]);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    lastFlowProgressRatioRef.current = 0;
    setFlowProgressRatio(0);
  }, [activeBookId]);

  useEffect(() => {
    if (settings.readingMode !== "flow") return undefined;

    const stage = stageRef.current;
    if (!stage) return undefined;
    let frame = 0;

    const updateFlowProgress = () => {
      const nextRatio = getScrollableProgressRatio(stage);
      const isEdge = nextRatio === 0 || nextRatio === 1;
      if (!isEdge && Math.abs(nextRatio - lastFlowProgressRatioRef.current) < FLOW_PROGRESS_MIN_DELTA) return;

      lastFlowProgressRatioRef.current = nextRatio;
      setFlowProgressRatio(nextRatio);
    };
    const scheduleFlowProgressUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateFlowProgress);
    };

    updateFlowProgress();
    stage.addEventListener("scroll", scheduleFlowProgressUpdate, { passive: true });
    window.addEventListener("resize", scheduleFlowProgressUpdate);

    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener("scroll", scheduleFlowProgressUpdate);
      window.removeEventListener("resize", scheduleFlowProgressUpdate);
    };
  }, [activeBookId, settings.readingMode, settings.density, settings.fontSize, settings.lineHeight, settings.pageWidth]);

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
        const columnWidth = Math.max(1, surface.clientWidth);
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
    settings.showSettings
  ]);

  useLayoutEffect(() => {
    const restore = pendingModeRestoreRef.current;
    if (!restore || restore.mode !== settings.readingMode) return undefined;
    if (settings.readingMode === "paginated" && !layout.columnStep) return undefined;

    let frame = 0;
    const runAfterRender = (remainingFrames) => {
      frame = requestAnimationFrame(() => {
        if (remainingFrames > 0) {
          runAfterRender(remainingFrames - 1);
          return;
        }

        const ratio = clamp(restore.ratio, 0, 1);
        // Both reading modes use the same 0..1 document ratio, then restore to page or scroll.
        if (settings.readingMode === "flow") {
          const stage = stageRef.current;
          const scrollableDistance = stage ? stage.scrollHeight - stage.clientHeight : 0;
          const top =
            typeof restore.scrollTop === "number" ? restore.scrollTop : scrollableDistance * ratio;
          stage?.scrollTo({ top, left: 0, behavior: "auto" });
          const restoredRatio = getScrollableProgressRatio(stage);
          lastFlowProgressRatioRef.current = restoredRatio;
          setFlowProgressRatio(restoredRatio);
        } else {
          const targetPage =
            typeof restore.page === "number"
              ? restore.page
              : Math.round(ratio * Math.max(layout.pageCount - 1, 0));
          setPage(clamp(targetPage, 0, layout.pageCount - 1));
          stageRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }

        pendingModeRestoreRef.current = null;
      });
    };

    runAfterRender(MODE_RESTORE_FRAME_DELAY);
    return () => cancelAnimationFrame(frame);
  }, [layout.columnStep, layout.pageCount, restoreRequestId, settings.readingMode]);

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function getCurrentReadingRatio(mode = settings.readingMode) {
    if (mode === "flow") {
      return getScrollableProgressRatio(stageRef.current);
    }

    const count = Math.max(pageCount, 1);
    if (count <= 1) return 0;
    return clamp(currentPage / (count - 1), 0, 1);
  }

  function getBlockIndexForDocumentPage(documentPage) {
    return blockIndexByDocumentPage.get(documentPage) ?? 0;
  }

  function detectCurrentDocumentPage() {
    const surface = pageSurfaceRef.current;
    const stage = stageRef.current;
    if (!surface || !activeBlocks.length) return 1;

    if (settings.readingMode === "flow") {
      const stageTop = stage?.scrollTop ?? 0;
      const targetY = stageTop + Math.max(24, (stage?.clientHeight ?? 0) * 0.22);
      const blocks = Array.from(surface.querySelectorAll("[data-block-index]"));
      const visibleBlock = blocks.find((element) => element.offsetTop + element.offsetHeight >= targetY) ?? blocks[0];
      const index = Number(visibleBlock?.getAttribute("data-block-index") ?? 0);
      return getBlockPageNumber(activeBlocks[index]);
    }

    if (!layout.columnStep) return getBlockPageNumber(activeBlocks[0]);
    const targetLeft = currentPage * layout.columnStep + Math.max(8, layout.columnWidth * 0.18);
    const blocks = Array.from(surface.querySelectorAll("[data-block-index]"));
    const visibleBlock =
      blocks.find((element) => element.offsetLeft + element.offsetWidth >= targetLeft) ??
      blocks.reduce((closest, element) => {
        if (!closest) return element;
        return Math.abs(element.offsetLeft - targetLeft) < Math.abs(closest.offsetLeft - targetLeft) ? element : closest;
      }, null);
    const index = Number(visibleBlock?.getAttribute("data-block-index") ?? 0);
    return getBlockPageNumber(activeBlocks[index]);
  }

  function changeReadingMode(mode) {
    if (mode === settings.readingMode) return;
    pendingModeRestoreRef.current = {
      mode,
      ratio: getCurrentReadingRatio()
    };
    setRestoreRequestId((value) => value + 1);
    setSettings((current) => ({ ...current, readingMode: mode }));
  }

  function applyBookProgress(bookId, progress = loadReadingProgress(bookId)) {
    const preferredProgress = getPreferredReadingProgress(progress);
    const savedPage = getProgressPage(preferredProgress);
    const savedMode =
      typeof preferredProgress === "object" && preferredProgress?.readingMode
        ? preferredProgress.readingMode
        : settings.readingMode;
    const savedRatio = getProgressRatio(preferredProgress);

    if (savedMode === "flow") {
      pendingModeRestoreRef.current = {
        mode: "flow",
        ratio: savedRatio,
        scrollTop: preferredProgress?.flowScrollTop
      };
      lastFlowProgressRatioRef.current = savedRatio;
      setFlowProgressRatio(savedRatio);
    } else {
      pendingModeRestoreRef.current = {
        mode: "paginated",
        page: savedPage,
        ratio: savedRatio
      };
      stageRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    setRestoreRequestId((value) => value + 1);
    if (savedMode === "flow" || layout.columnStep) {
      setPage(savedPage);
    }
    setSettings((current) => ({
      ...current,
      ...(preferredProgress?.visualSettings ?? {}),
      readingMode: savedMode
    }));
  }

  function createCurrentReadingPoint() {
    const stage = stageRef.current;
    const pageSurface = pageSurfaceRef.current;
    const flowScrollTop = stage?.scrollTop ?? 0;
    const flowMarkerOffset =
      settings.readingMode === "flow"
        ? Math.max(0, flowScrollTop - (pageSurface?.offsetTop ?? 0) + Math.min(stage?.clientHeight ?? 0, 140))
        : null;

    return {
      bookId: activeBookId,
      page: persistedPage,
      mode: settings.readingMode,
      percent: progress,
      flowScroll: settings.readingMode === "flow" ? flowScrollTop : 0,
      flowScrollRatio: settings.readingMode === "flow" ? getScrollableProgressRatio(stage) : 0,
      flowMarkerOffset,
      visualSettings: getVisualSettingsSnapshot(settings),
      createdAt: Date.now()
    };
  }

  function saveReadingPoint() {
    if (!hasActiveBook) return;

    const savedReadingPoint = createCurrentReadingPoint();
    const existingProgress = loadReadingProgress(activeBookId);
    const progressRecord = typeof existingProgress === "object" && existingProgress ? existingProgress : {};

    const nextProgress = {
      ...progressRecord,
      currentPage: persistedPage,
      percentageRead: progress,
      readingMode: settings.readingMode,
      flowScrollTop: savedReadingPoint.flowScroll,
      flowScrollRatio: savedReadingPoint.flowScrollRatio,
      visualSettings: savedReadingPoint.visualSettings,
      savedReadingPoint,
      lastReadAt: new Date().toISOString()
    };

    saveReadingProgress(activeBookId, nextProgress);

    setActiveProgress(nextProgress);
    setManualReadingPoint(savedReadingPoint);
    setSaveFeedbackVisible(true);
    setImportStatus({ busy: false, message: "Punto de lectura guardado." });

    if (saveFeedbackTimerRef.current) {
      window.clearTimeout(saveFeedbackTimerRef.current);
    }

    saveFeedbackTimerRef.current = window.setTimeout(() => {
      setSaveFeedbackVisible(false);
    }, SAVE_POINT_FEEDBACK_MS);
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
    const savedProgress = loadReadingProgress(id);
    setActiveBookId(id);
    applyBookProgress(id, savedProgress);
    if (savedProgress?.lastReadAt) {
      setImportStatus({ busy: false, message: "Progreso guardado detectado. Continuando desde la última lectura." });
    }
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

  function highlightBlock(blockIndex) {
    setHighlightedBlockIndex(blockIndex);
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedBlockIndex(null);
    }, SEARCH_HIGHLIGHT_MS);
  }

  function navigateToBlock(blockIndex) {
    const targetSelector = `[data-block-index="${blockIndex}"]`;

    if (settings.readingMode === "flow") {
      pageSurfaceRef.current
        ?.querySelector(targetSelector)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightBlock(blockIndex);
      return;
    }

    requestAnimationFrame(() => {
      const element = pageSurfaceRef.current?.querySelector(targetSelector);
      if (!element || !layout.columnStep) return;
      setPage(clamp(Math.floor(element.offsetLeft / layout.columnStep), 0, pageCount - 1));
      highlightBlock(blockIndex);
    });
  }

  function runDocumentSearch(event) {
    event?.preventDefault();
    const searchTerm = documentSearchQuery.trim();

    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
    }

    if (!searchTerm) {
      setDocumentSearchResults([]);
      setDocumentSearchStatus("Escribe una palabra o frase para buscar en este documento.");
      return;
    }

    if (!documentSearchIndex.length) {
      setDocumentSearchResults([]);
      setDocumentSearchStatus("Este PDF no contiene texto seleccionable. La busqueda puede no funcionar.");
      return;
    }

    setDocumentSearchBusy(true);
    setDocumentSearchStatus("Buscando en el documento...");
    searchTimerRef.current = window.setTimeout(() => {
      const results = searchDocumentIndex(documentSearchIndex, searchTerm);
      setDocumentSearchResults(results);
      setDocumentSearchStatus(
        results.length
          ? `${results.length} resultado${results.length === 1 ? "" : "s"} encontrado${results.length === 1 ? "" : "s"}.`
          : "No se encontraron coincidencias en este documento."
      );
      setDocumentSearchBusy(false);
    }, 80);
  }

  function toggleReaderTool(tool) {
    setActiveReaderTool((current) => (current === tool ? null : tool));
  }

  function persistNotes(nextNotes) {
    setNotes(nextNotes);
    saveBookNotes(activeBookId, nextNotes);
  }

  function startCurrentPageNote() {
    setActiveReaderTool("notes");
    setEditingNoteId(null);
    setNoteDraft("");
  }

  function saveCurrentNote(event) {
    event?.preventDefault();
    if (!hasActiveBook) return;

    const text = noteDraft.trim();
    if (!text) return;

    const readingPoint = createCurrentReadingPoint();
    const now = Date.now();
    const nextNotes = editingNoteId
      ? notesForCurrentBook.map((note) =>
          note.id === editingNoteId
            ? {
                ...note,
                text,
                updatedAt: now
              }
            : note
        )
      : [
          {
            id: createNoteId(),
            bookId: activeBookId,
            page: currentDocumentPage,
            text,
            percent: progress,
            flowScroll: readingPoint.flowScroll,
            flowScrollRatio: readingPoint.flowScrollRatio,
            flowMarkerOffset: readingPoint.flowMarkerOffset,
            createdAt: now,
            updatedAt: now,
            schemaVersion: 2
          },
          ...notesForCurrentBook
        ];

    persistNotes(nextNotes);
    setEditingNoteId(null);
    setNoteDraft("");
    setSelectedNoteId(null);
    setImportStatus({ busy: false, message: "Nota guardada en esta pagina." });
  }

  function editNote(note) {
    setActiveReaderTool("notes");
    setEditingNoteId(note.id);
    setNoteDraft(note.text);
    setSelectedNoteId(null);
  }

  function deleteNote(noteId) {
    const nextNotes = notesForCurrentBook.filter((note) => note.id !== noteId);
    persistNotes(nextNotes);
    if (editingNoteId === noteId) {
      setEditingNoteId(null);
      setNoteDraft("");
    }
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
    }
  }

  function goToNote(note) {
    const blockIndex = getBlockIndexForDocumentPage(note.page);

    if (settings.readingMode === "flow") {
      navigateToBlock(blockIndex);
      return;
    }

    navigateToBlock(blockIndex);
  }

  function openNotePopover(noteId) {
    setSelectedNoteId(noteId);
  }

  function closeNotePopover() {
    setSelectedNoteId(null);
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportStatus({ busy: true, message: `Importando ${file.name}...` });

    try {
      const nextBook = await importBookFromBrowserFile(file);
      const normalizedBook = normalizeBookRecord(nextBook);
      const savedProgress = loadReadingProgress(normalizedBook.id);

      setBooks((current) => [normalizedBook, ...current.filter((book) => book.id !== normalizedBook.id)]);
      setActiveBookId(normalizedBook.id);
      applyBookProgress(normalizedBook.id, savedProgress);
      if (isCompactReaderViewport()) {
        closeLibraryPanel();
      }
      setImportStatus({
        busy: false,
        message: savedProgress?.lastReadAt
          ? `${nextBook.title} importado. Progreso guardado detectado; continuando desde la última lectura.`
          : `${nextBook.title} importado.`
      });
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

  function handleReaderPointerDown(event) {
    if (settings.readingMode !== "paginated" || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest(NO_SWIPE_SELECTOR)) return;

    swipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now()
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleReaderPointerUp(event) {
    const swipe = swipeRef.current;
    swipeRef.current = null;

    if (!swipe || swipe.pointerId !== event.pointerId || settings.readingMode !== "paginated") return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (Date.now() - lastSwipePageTurnRef.current < SWIPE_PAGE_COOLDOWN_MS) return;

    const selectedText = window.getSelection?.().toString().trim();
    if (selectedText) return;

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX < SWIPE_PAGE_THRESHOLD || absY > absX) return;

    if (deltaX < 0) {
      nextPage();
    } else {
      previousPage();
    }

    lastSwipePageTurnRef.current = Date.now();
  }

  function handleReaderPointerCancel(event) {
    if (swipeRef.current?.pointerId === event.pointerId) {
      swipeRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }

  return (
    <main className={`app ${FILTERS[settings.filter].className}`}>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={SUPPORTED_FILE_ACCEPT}
        onChange={handleImport}
      />

      {settings.showLibrary ? (
        <button
          className="library-backdrop no-swipe"
          type="button"
          aria-label="Cerrar biblioteca"
          onClick={closeLibraryPanel}
        />
      ) : null}

      <aside className={`library no-swipe ${settings.showLibrary ? "" : "is-hidden"}`} aria-label="Biblioteca">
        <div className="brand">
          <img className="brand-icon sidebar-brand-icon" src={BRAND_ICON_SRC} alt="" width="42" height="42" />
          <div>
            <strong>{BRAND_NAME}</strong>
            <span>Lector local</span>
          </div>
          {APP_TARGET === "web" ? (
            <button
              className="home-link"
              type="button"
              onClick={onReturnHome}
              aria-label="Volver a la página principal"
              title="Volver al inicio"
            >
              <Home size={15} />
              Inicio
            </button>
          ) : null}
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
          Tus libros se procesan localmente en tu dispositivo. No se suben a ningún servidor.
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
          <nav className="toc-panel" aria-label="Índice del PDF">
            <strong>Índice detectado</strong>
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
        <header className="reader-toolbar no-swipe">
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
            <small>{progress}% leído{hasSavedProgress ? " · progreso guardado" : ""}</small>
          </div>
          <div className="toolbar-actions">
            <button
              className={`icon-button document-search-button ${activeReaderTool === "search" ? "is-active" : ""}`}
              title="Buscar en el documento"
              aria-label="Buscar en el documento"
              onClick={() => toggleReaderTool("search")}
              disabled={!hasActiveBook}
            >
              <Search size={18} />
            </button>
            <button
              className={`icon-button note-tool-button ${notesOnCurrentPage.length ? "has-note" : ""} ${activeReaderTool === "notes" ? "is-active" : ""}`}
              title="Notas de esta pagina"
              aria-label="Notas de esta pagina"
              onClick={startCurrentPageNote}
              disabled={!hasActiveBook}
            >
              <StickyNote size={18} fill={notesOnCurrentPage.length ? "currentColor" : "none"} />
            </button>
            <button
              className={`icon-button save-point-button ${effectiveReadingPoint ? "has-saved-point" : ""}`}
              title="Guardar punto de lectura"
              aria-label="Guardar punto de lectura"
              onClick={saveReadingPoint}
              disabled={!hasActiveBook}
            >
              <Bookmark size={18} fill={effectiveReadingPoint ? "currentColor" : "none"} />
            </button>
            <button
              className={`icon-button favorite-button ${activeBook.isFavorite ? "is-active" : ""}`}
              title={activeBook.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              aria-label={activeBook.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              onClick={() => toggleFavoriteBook(activeBook.id)}
              disabled={!hasActiveBook}
            >
              <Star size={18} fill={activeBook.isFavorite ? "currentColor" : "none"} />
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

        {activeReaderTool ? (
          <section className="reader-tool-panel no-swipe" aria-label={activeReaderTool === "search" ? "Buscar en el documento" : "Notas del documento"}>
            <div className="reader-tool-heading">
              <strong>{activeReaderTool === "search" ? "Buscar en el documento" : "Notas del documento"}</strong>
              <button
                className="tool-close"
                type="button"
                onClick={() => setActiveReaderTool(null)}
                aria-label="Cerrar panel"
              >
                <X size={16} />
              </button>
            </div>

            {activeReaderTool === "search" ? (
              <div className="document-search-panel">
                <form className="document-search-form" onSubmit={runDocumentSearch}>
                  <label>
                    <span className="sr-only">Buscar texto dentro del documento</span>
                    <input
                      value={documentSearchQuery}
                      onChange={(event) => setDocumentSearchQuery(event.target.value)}
                      placeholder="Palabra o frase"
                    />
                  </label>
                  <button className="wide-button" type="submit" disabled={documentSearchBusy}>
                    <Search size={16} />
                    {documentSearchBusy ? "Buscando..." : "Buscar"}
                  </button>
                </form>
                {documentSearchStatus ? <p className="tool-status">{documentSearchStatus}</p> : null}
                <div className="document-search-results">
                  {documentSearchResults.map((result) => (
                    <button
                      key={`${result.blockIndex}-${result.page}`}
                      className="document-search-result"
                      type="button"
                      onClick={() => navigateToBlock(result.blockIndex)}
                    >
                      <span>Pagina {result.page}</span>
                      <mark>{documentSearchQuery.trim()}</mark>
                      <small>{result.excerpt}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="notes-panel">
                <form className="note-editor" onSubmit={saveCurrentNote}>
                  <label>
                    <span>{editingNoteId ? "Editar nota" : `Nota en la pagina ${currentDocumentPage}`}</span>
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Escribe una nota para esta pagina"
                      rows={4}
                    />
                  </label>
                  <div className="note-actions">
                    <button className="wide-button note-save-button" type="submit" disabled={!noteDraft.trim()}>
                      <Check size={16} />
                      Guardar nota
                    </button>
                    {editingNoteId ? (
                      <button
                        className="wide-button secondary"
                        type="button"
                        onClick={() => {
                          setEditingNoteId(null);
                          setNoteDraft("");
                        }}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </form>

                <div className="notes-list">
                  {notesForCurrentBook.length ? (
                    notesForCurrentBook.map((note) => (
                      <article key={note.id} className="note-row">
                        <button type="button" className="note-jump" onClick={() => goToNote(note)}>
                          <StickyNote size={16} fill="currentColor" />
                          <span>Pagina {note.page}</span>
                          <small>{note.text}</small>
                        </button>
                        <div className="note-row-actions">
                          <button type="button" onClick={() => editNote(note)}>Editar</button>
                          <button type="button" onClick={() => deleteNote(note.id)}>Eliminar</button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="empty-tool-state">No hay notas en este documento.</p>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : null}

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
          <div
            className="page-surface"
            ref={pageSurfaceRef}
            onPointerDown={handleReaderPointerDown}
            onPointerUp={handleReaderPointerUp}
            onPointerCancel={handleReaderPointerCancel}
          >
            {saveFeedbackVisible ? (
              <div className="save-point-feedback" aria-label="Punto de lectura guardado" aria-live="polite">
                <Bookmark size={76} fill="currentColor" />
              </div>
            ) : null}
            {isManualPointOnCurrentPage ? (
              <div className="saved-page-ribbon" aria-label="Punto de lectura guardado">
                <Bookmark size={15} fill="currentColor" />
              </div>
            ) : null}
            {flowPointOffset !== null ? (
              <div
                className="saved-flow-marker"
                style={{ top: `${Math.max(0, flowPointOffset)}px` }}
                aria-label="Punto de lectura guardado"
              >
                <Bookmark size={15} fill="currentColor" />
              </div>
            ) : null}
            {settings.readingMode === "paginated" && notesOnCurrentPage.length ? (
              <button
                className="note-page-pin no-swipe"
                type="button"
                aria-label="Ver nota de esta pagina"
                onClick={() => openNotePopover(notesOnCurrentPage[0].id)}
              >
                <StickyNote size={15} fill="currentColor" />
              </button>
            ) : null}
            <div className="reader-viewport" ref={readerViewportRef}>
              <div className="reader-content" ref={contentRef}>
                {activeBlocks.map((block, index) => (
                  <React.Fragment key={`${index}-${blockText(block).slice(0, 16)}`}>
                    {settings.readingMode === "flow"
                      ? (noteMarkersByBlock.get(index) ?? []).map((note) => (
                          <button
                            key={note.id}
                            className="note-flow-marker no-swipe"
                            type="button"
                            aria-label={`Ver nota de la pagina ${note.page}`}
                            onClick={() => openNotePopover(note.id)}
                          >
                            <StickyNote size={15} fill="currentColor" />
                          </button>
                        ))
                      : null}
                    <ReaderBlock
                      block={block}
                      index={index}
                      highlighted={highlightedBlockIndex === index}
                    />
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </article>

        {selectedNote ? (
          <>
            <button
              className="note-popover-backdrop no-swipe"
              type="button"
              aria-label="Cerrar nota"
              onClick={closeNotePopover}
            />
            <section className="note-popover no-swipe" role="dialog" aria-label="Nota guardada">
              <div className="note-popover-heading">
                <StickyNote size={17} fill="currentColor" />
                <strong>Pagina {selectedNote.page}</strong>
                <button type="button" onClick={closeNotePopover} aria-label="Cerrar nota">
                  <X size={15} />
                </button>
              </div>
              <p>{selectedNote.text}</p>
              <div className="note-popover-actions">
                <button type="button" onClick={() => editNote(selectedNote)}>Editar</button>
                <button type="button" onClick={() => deleteNote(selectedNote.id)}>Eliminar</button>
              </div>
            </section>
          </>
        ) : null}

        <footer className="page-controls no-swipe">
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

      <aside className={`settings-panel no-swipe ${settings.showSettings ? "" : "is-hidden"}`} aria-label="Ajustes de lectura">
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
                onClick={() => changeReadingMode("paginated")}
              >
                Paginado
              </button>
              <button
                className={settings.readingMode === "flow" ? "is-selected" : ""}
                onClick={() => changeReadingMode("flow")}
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
                  label="Tamaño de letra"
                  value={settings.fontSize}
                  min={16}
                  max={30}
                  step={1}
                  unit="px"
                  onChange={(value) => updateSetting("fontSize", value)}
                />
                <Slider
                  icon={<AlignJustify size={16} />}
                  label="Altura de línea"
                  value={settings.lineHeight}
                  min={1.35}
                  max={2}
                  step={0.05}
                  unit="x"
                  onChange={(value) => updateSetting("lineHeight", value)}
                />
                <Slider
                  icon={<Minus size={16} />}
                  label="Ancho de página"
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
        <div className="dialog-backdrop no-swipe" role="presentation">
          <section className="confirm-dialog no-swipe" role="dialog" aria-modal="true" aria-labelledby="delete-book-title">
            <h2 id="delete-book-title">Eliminar libro</h2>
            <p>
              ¿Seguro que quieres eliminar este libro de {BRAND_NAME}? El archivo original no se borrará.
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

function ReaderBlock({ block, index, highlighted = false }) {
  const highlightClass = highlighted ? " search-highlight" : "";
  const blockProps = { "data-block-index": index };

  if (block.type === "heading") {
    const Heading = block.level === 1 ? "h1" : "h2";
    return (
      <Heading className={highlighted ? "search-highlight" : undefined} {...blockProps}>
        <ReaderRuns runs={block.runs} />
      </Heading>
    );
  }

  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List className={highlighted ? "search-highlight" : undefined} {...blockProps}>
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
      <blockquote className={highlighted ? "search-highlight" : undefined} {...blockProps}>
        <ReaderRuns runs={block.runs} />
      </blockquote>
    );
  }

  if (block.type === "link") {
    return (
      <p className={`link-block${highlightClass}`} {...blockProps}>
        <ReaderRuns runs={block.runs} />
      </p>
    );
  }

  if (block.type === "table-warning") {
    return <aside className={`table-warning${highlightClass}`} {...blockProps}>{block.text}</aside>;
  }

  const paragraphClassName = `${block.emphasis ? "reader-paragraph reader-paragraph--emphasis" : "reader-paragraph"}${highlightClass}`;

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
