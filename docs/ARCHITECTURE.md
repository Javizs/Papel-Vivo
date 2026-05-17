# Arquitectura

Papel Vivo combina una interfaz React con Vite y una envoltura Electron para escritorio.

## Superficies

- Web: se ejecuta desde Vite y procesa archivos seleccionados en el navegador.
- Escritorio: Electron abre la misma aplicacion con una ventana nativa.

## Directorios principales

- `src/main.jsx`: interfaz principal, landing y lector.
- `src/styles.css`: estilos globales, landing, lector y responsive.
- `src/core/`: logica compartida para parser y almacenamiento.
- `src/adapters/`: adaptadores para importacion y almacenamiento local.
- `electron/main.cjs`: proceso principal de Electron.
- `public/`: iconos, manifest y assets publicos.

## Almacenamiento

La version web usa almacenamiento local del navegador para biblioteca, ajustes, favoritos y progreso. Este comportamiento puede evolucionar en el futuro para soportar bibliotecas grandes con almacenamiento local mas robusto.

## Limites actuales

- No hay backend.
- No hay cuentas de usuario.
- No hay sincronizacion en nube.
- No hay OCR.
- No hay soporte EPUB todavia.
