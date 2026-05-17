# Privacidad en Papel Vivo

Papel Vivo esta disenado con un enfoque local-first: la app intenta que la lectura y la gestion de documentos ocurran en el propio dispositivo del usuario.

## Procesamiento local

En la version web, los archivos seleccionados se procesan en el navegador. La app no necesita subir libros a un servidor para convertir PDFs, TXT o Markdown en lectura dentro de Papel Vivo.

No hay un backend de subida de libros para convertir documentos.

## Datos guardados

La biblioteca, los favoritos, los ajustes y el progreso de lectura se guardan localmente. En la version web actual se usa almacenamiento local del navegador.

En la version de escritorio, Electron reutiliza el comportamiento local de la aplicacion para mantener la experiencia dentro del entorno del usuario.

## Eliminacion de libros

Eliminar un libro de Papel Vivo lo quita de la biblioteca de la app, pero no borra el archivo original del dispositivo.

## Datos del navegador

Si el usuario borra los datos del navegador, cambia de perfil o usa herramientas de limpieza, puede perder la biblioteca, favoritos, ajustes y progreso guardados localmente.

## Limitaciones actuales

- Papel Vivo no ofrece sincronizacion en la nube.
- Papel Vivo no incluye cuentas de usuario.
- Papel Vivo no promete cifrado propio de biblioteca.
- Papel Vivo no incluye OCR para PDFs escaneados.
- Papel Vivo no ha pasado una auditoria formal de seguridad.

## Mejoras futuras

El proyecto puede evolucionar hacia almacenamiento local mas robusto, mejores controles de exportacion y una gestion mas clara de copias de seguridad locales.
