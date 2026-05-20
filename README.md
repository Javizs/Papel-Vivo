# Papel Vivo

Papel Vivo es una app React + Vite local-first para leer documentos PDF, TXT y Markdown con una experiencia mas comoda, ajustable y privada.

El proyecto incluye version web con landing, version de escritorio para Windows con Electron, instalador Windows, version portable Windows y version Android con Capacitor. La version web esta pensada para publicarse como sitio estatico y las versiones descargables se distribuiran desde GitHub Releases.

## Enlaces

- Demo web en Hostinger: pendiente de publicar.
- GitHub Releases: disponible en la seccion Releases cuando se publique la primera beta.
- Instalador Windows: disponible en la seccion Releases cuando se publique la primera beta.
- Windows Portable: disponible en la seccion Releases cuando se publique la primera beta.
- APK Android: disponible en la seccion Releases cuando se publique la primera beta.

## Capturas

Las capturas limpias se anadiran antes o durante la publicacion:

- `docs/screenshots/landing.png`
- `docs/screenshots/reader.png`
- `docs/screenshots/mobile.png`

## Funciones principales

- Importacion local de PDF, TXT y Markdown.
- Lector con modo paginado y modo flujo.
- Ajustes visuales de lectura: tamano de texto, altura de linea, ancho de pagina, brillo y densidad.
- Biblioteca local.
- Favoritos.
- Punto de lectura guardado.
- Buscador interno.
- Notas por pagina.
- Eliminacion de libros de la biblioteca sin borrar el archivo original.
- Version web local-first con landing inicial.
- Version Windows con Electron que entra directamente al lector.
- Version Android con Capacitor que entra directamente al lector.

## Privacidad y enfoque local-first

Papel Vivo no requiere subir documentos a un servidor para leerlos. En la version web, los archivos seleccionados se procesan en el navegador. La biblioteca, favoritos, ajustes, notas y progreso se guardan en el almacenamiento local disponible para la app.

Si se borran los datos del navegador o de la aplicacion, se puede perder la biblioteca y el progreso guardados localmente. Eliminar un libro desde Papel Vivo solo lo elimina de la biblioteca de la app; no borra el archivo original del dispositivo.

## Tecnologias

- React
- Vite
- Electron
- Capacitor
- JavaScript
- CSS
- pdfjs-dist

## Desarrollo web

Instalar dependencias:

```bash
npm install
```

Iniciar la version web en desarrollo:

```bash
npm run dev:web
```

Generar build web:

```bash
npm run build:web
```

La build web queda en `dist/`. Para Hostinger se sube el contenido de `dist/`, no la carpeta completa del proyecto. Consulta [docs/deploy-hostinger.md](docs/deploy-hostinger.md).

## Escritorio Windows

La version de escritorio usa Electron y arranca directamente en el lector mediante el modo `desktop`.

Iniciar Electron en desarrollo:

```bash
npm run desktop:dev
```

Generar build de escritorio:

```bash
npm run build:desktop
```

Generar instalador Windows y version portable:

```bash
npm run desktop:dist
```

Los artefactos originales se generan en `release/`. Para publicar en GitHub Releases se preparan copias con nombres limpios en `release-upload/`.

Aviso: Windows puede mostrar SmartScreen porque Papel Vivo no esta firmado digitalmente todavia.

## Android

La version Android usa Capacitor y arranca directamente en el lector mediante el modo `android`.

Sincronizar proyecto Android:

```bash
npm run android:sync
```

Abrir en Android Studio:

```bash
npm run android:open
```

Generar APK debug:

```bash
npm run android:debug
```

Generar APK release:

```bash
npm run android:release
```

La APK release se genera en `android/app/build/outputs/apk/release/`. Para publicar en GitHub Releases se prepara una copia en `release-upload/`.

Aviso: Android puede pedir permitir instalacion desde fuentes externas porque la APK se distribuye fuera de Google Play.

## Firma Android y secretos

La keystore Android real no debe subirse nunca al repositorio. Tampoco debe subirse `android/keystore.properties`, porque contiene contrasenas locales de firma.

Archivos protegidos por `.gitignore`:

- `*.jks`
- `*.keystore`
- `android/keystore.properties`
- `android/local.properties`
- `local.properties`

El archivo versionable para documentar la configuracion es:

```text
android/keystore.properties.example
```

Ejemplo local:

```properties
storeFile=../papelvivo-release-key.jks
storePassword=CAMBIAR_ESTO
keyAlias=papelvivo
keyPassword=CAMBIAR_ESTO
```

## Publicacion de artefactos

Los ejecutables y APKs no se versionan en Git. Para GitHub Releases, preparar:

- `release-upload/PapelVivo-0.1.0-Windows-Setup-x64.exe`
- `release-upload/PapelVivo-0.1.0-Windows-Portable-x64.exe`
- `release-upload/PapelVivo-0.1.0-Android.apk`

Notas de release:

- [docs/releases/v0.1.0-beta.md](docs/releases/v0.1.0-beta.md)

## Despliegue web en Hostinger

Opcion principal:

1. Ejecutar `npm run build:web`.
2. Abrir Hostinger hPanel.
3. Ir a File Manager.
4. Entrar en `public_html`.
5. Subir el contenido de `dist/`.
6. Comprobar la web en el dominio.

No subir el proyecto completo a `public_html`: no hacen falta `src/`, `node_modules/`, `electron/`, `android/`, instaladores ni APKs.

## Scripts disponibles

| Script | Funcion |
| --- | --- |
| `npm run dev` | Inicia Vite en `127.0.0.1` para desarrollo web. |
| `npm run dev:web` | Alias de desarrollo web con Vite. |
| `npm run dev:desktop` | Inicia Vite en modo escritorio. |
| `npm run desktop:dev` | Inicia Vite en modo escritorio y abre Electron. |
| `npm run build` | Genera la build de produccion con Vite en `dist/`. |
| `npm run build:web` | Genera la build web. |
| `npm run build:desktop` | Genera la build para Electron. |
| `npm run desktop:dist` | Genera instalador NSIS y portable Windows en `release/`. |
| `npm run build:android` | Genera la build para Capacitor Android. |
| `npm run android:sync` | Genera build Android, actualiza iconos y sincroniza Capacitor. |
| `npm run android:debug` | Genera APK debug. |
| `npm run android:release` | Genera APK release firmada localmente. |
| `npm run preview` | Sirve la build localmente con Vite Preview. |

## Estructura

```text
src/        Codigo React, estilos, parser y adaptadores.
electron/   Entrada principal de Electron.
public/     Iconos, manifest y assets publicos.
build/      Icono Windows versionable.
android/    Proyecto nativo Android, sin builds generados.
docs/       Documentacion auxiliar y notas de release.
dist/       Build web generada localmente; no se versiona.
release/    Artefactos generados localmente; no se versiona.
release-upload/ Artefactos renombrados para GitHub Releases; no se versiona.
```

## Estado

Papel Vivo esta en beta. La version web, Windows y Android estan preparadas para pruebas y publicacion inicial, con mejoras pendientes en formatos, accesibilidad y distribucion.

## Licencia

Distribuido bajo licencia MIT. Consulta [LICENSE](LICENSE).
