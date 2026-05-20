# Despliegue web en Hostinger

La version web publica de Papel Vivo se despliega como sitio estatico. Se sube el contenido de `dist/`, no la carpeta completa del proyecto.

## Build local

```bash
npm install
npm run build:web
```

La build final queda en:

```text
dist/
```

## Subida manual a Hostinger hPanel

1. Ejecutar `npm run build:web`.
2. Abrir Hostinger hPanel.
3. Ir a File Manager.
4. Entrar en `public_html`.
5. Subir el contenido de `dist/`.
6. Comprobar la web en el dominio configurado.

`dist/index.html` debe quedar directamente dentro de `public_html`, no dentro de `public_html/dist`.

## Alternativa FTP/SFTP

Si se usa FTP o SFTP, subir igualmente el contenido de `dist/` al directorio publico del dominio, normalmente `public_html`.

## Comprobaciones despues de subir

- La landing carga primero en la version web.
- Los botones de entrada abren el lector.
- Favicon, manifest, CSS y JS cargan sin errores 404.
- La importacion de PDF, TXT o Markdown sigue siendo local.
- No se suben instaladores, APKs, codigo fuente ni archivos privados al hosting.
