# Despliegue en Hostinger

Este documento describe el despliegue manual de la version web de Papel Vivo. No incluye Electron, instaladores ni APK.

## 1. Instalar dependencias

```bash
npm install
```

## 2. Generar build web

```bash
npm run build:web
```

El resultado se genera en `dist/`.

## 3. Probar la build localmente

```bash
npm run preview
```

Abrir la URL que muestre Vite Preview y comprobar landing, entrada al lector, importacion local y navegacion basica.

## 4. Subir a Hostinger

Subir el contenido de `dist/` a `public_html`.

El archivo `index.html` debe quedar directamente dentro de `public_html`, no dentro de una subcarpeta adicional.

## 5. No subir

No subir:

- `node_modules/`
- `src/`
- `electron/`
- `.env`
- PDFs, EPUBs o libros privados
- Builds antiguas
- Instaladores
- Zips temporales que no sean el paquete final de despliegue

## 6. Comprobaciones despues de subir

- La landing carga correctamente.
- El favicon y manifest cargan sin 404.
- El boton de entrada abre el lector.
- Se puede seleccionar un PDF, TXT o Markdown desde el navegador.
- DevTools > Network no muestra subida de archivos al importar un documento.
- No hay errores de consola relevantes.
- No hay rutas locales absolutas en los assets publicados.
