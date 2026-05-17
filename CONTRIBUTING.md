# Contribuir a Papel Vivo

Papel Vivo esta en desarrollo activo. Esta guia deja el proyecto preparado para futuras contribuciones cuando el repositorio sea publico.

## Instalacion

```bash
npm install
```

## Desarrollo web

```bash
npm run dev
```

## Desarrollo escritorio

```bash
npm run start
```

## Build

```bash
npm run build
```

## Normas basicas

- No subir libros, PDFs, EPUBs ni documentos privados.
- No commitear `.env` ni secretos.
- No subir `node_modules/`, `dist/` ni instaladores generados.
- Mantener los cambios acotados a la funcionalidad que se este tocando.
- No prometer funciones que no existan todavia, como OCR, EPUB, nube o APK.
- Abrir issues para bugs y mejoras cuando el repositorio este publicado.

## Antes de proponer cambios

- Ejecutar `npm run build`.
- Probar la version web.
- Si el cambio afecta escritorio, probar Electron con `npm run start`.
- Verificar que la importacion PDF/TXT/Markdown no se rompe.
