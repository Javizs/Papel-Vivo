# Papel Vivo

Papel Vivo es un lector web y de escritorio para PDF, TXT y Markdown, pensado para convertir documentos en una experiencia de lectura mas comoda, limpia y ajustable.

El proyecto combina una version web local-first con una version de escritorio basada en Electron. Su objetivo es facilitar lectura larga, estudio y revision de documentos personales sin depender de subir archivos a un servidor.

## Caracteristicas principales

- Importacion local de PDF, TXT y Markdown.
- Parser PDF con conversion a lectura fluida.
- Filtros visuales para reducir fatiga visual.
- Modo paginado y modo flujo.
- Ajustes de tamano de texto, altura de linea, ancho de pagina, brillo y densidad.
- Biblioteca local.
- Favoritos.
- Progreso de lectura por libro.
- Eliminacion de libros de Papel Vivo sin borrar el archivo original.
- Diseno responsive para web y escritorio.
- Version web local-first.
- Version de escritorio con Electron.

## Privacidad

Papel Vivo esta disenado con enfoque local-first. En la version web, los archivos seleccionados se procesan en el navegador y la app no necesita subir libros a un servidor para convertirlos en lectura.

La biblioteca, los favoritos, los ajustes y el progreso se guardan en el almacenamiento local disponible de la app. En la version web actual se usa almacenamiento local del navegador. Si el usuario borra los datos del navegador, puede perder la biblioteca y el progreso guardados localmente.

Eliminar un libro de Papel Vivo solo lo elimina de la biblioteca de la app; no borra el archivo original del dispositivo.

## Tecnologias

- React
- Vite
- Electron
- JavaScript
- CSS
- pdfjs-dist
- localStorage para estado local en la version web

## Instalacion local

```bash
npm install
```

Version web:

```bash
npm run dev
```

Version web usando el alias explicito:

```bash
npm run dev:web
```

Version escritorio Electron:

```bash
npm run start
```

Build web:

```bash
npm run build
```

## Scripts disponibles

| Script | Funcion |
| --- | --- |
| `npm run dev` | Inicia Vite en `127.0.0.1` para desarrollo web. |
| `npm run dev:web` | Alias de desarrollo web con Vite. |
| `npm run electron` | Abre Electron usando la configuracion actual. |
| `npm run start` | Inicia Vite y Electron juntos. |
| `npm run start:electron` | Alias para iniciar Vite y Electron juntos. |
| `npm run build` | Genera la build de produccion con Vite en `dist/`. |
| `npm run build:web` | Alias de build web. |
| `npm run preview` | Sirve la build localmente con Vite Preview. |

## Estructura del proyecto

```text
src/        Codigo React, estilos, parser y adaptadores de almacenamiento.
electron/   Entrada principal de Electron.
public/     Iconos, favicon, manifest y assets publicos.
docs/       Documentacion auxiliar del proyecto.
dist/       Build generada localmente; no se versiona.
```

## Estado del proyecto

Papel Vivo esta en fase de desarrollo activo. La version web y la version escritorio funcionan como base, pero todavia hay mejoras pendientes en formatos, empaquetado, accesibilidad y experiencia movil.

## Roadmap resumido

- Soporte EPUB.
- OCR para PDFs escaneados.
- Notas y subrayado.
- Exportacion de notas.
- Lectura en voz alta.
- Instalador Windows.
- APK Android futura.
- Mejoras de accesibilidad.
- Mejoras del parser PDF.

## Capturas

Las capturas limpias se anadiran antes de publicar el repositorio:

- `docs/screenshots/landing.png`
- `docs/screenshots/reader.png`
- `docs/screenshots/mobile.png`

## Licencia

Distribuido bajo licencia MIT. Consulta `LICENSE`.
