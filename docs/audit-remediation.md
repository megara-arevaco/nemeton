# Correcciones de la auditoría

Fecha: 2026-09-05. Cambios en el código y compilación local; no se ha sustituido la aplicación instalada en Windows.

| Punto                            | Corrección                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arranque de Ludusavi             | Se elimina la precarga al iniciar. La caché disponible responde inmediatamente al usar el catálogo; la renovación se procesa en un trabajador con límite de memoria y tiempo. La descarga tiene un límite de 32 MiB y 30 segundos.                                                         |
| Restauración exacta              | Se preparan y verifican los archivos en directorios temporales antes de sustituir los actuales. Se conserva un registro de recuperación para deshacer sustituciones interrumpidas. La copia previa conserva la versión que se pretende restaurar aunque se alcance el límite de retención. |
| Colisiones de nombres            | Cada archivo tiene una entrada ZIP numerada; su nombre original se conserva en el manifiesto.                                                                                                                                                                                              |
| Escrituras concurrentes          | Biblioteca, configuración de partidas, ajustes y logros serializan las operaciones de lectura/modificación/escritura dentro del proceso. Las escrituras JSON usan temporales únicos y sustitución atómica.                                                                                 |
| Rutas de versiones               | Los identificadores se validan antes de acceder al disco. También se validan manifiestos, rutas de destino, tamaños y hashes.                                                                                                                                                              |
| Barreras Electron                | Sandbox activado y preload CJS, CSP, rechazo de nuevas ventanas y navegación, validación del documento y frame emisor de IPC, argumentos validados con esquemas compartidos.                                                                                                               |
| Dependencias                     | Electron actualizado a 44.2.0. Auditoría completa de dependencias sin avisos conocidos en la fecha de validación.                                                                                                                                                                          |
| Memoria de partidas              | Creación y lectura de ZIP por flujos. Los datos de cada copia se preparan en disco para que el hash corresponda con los bytes archivados. Límites de tamaño expandido, cantidad de archivos y manifiesto. Se mantienen lectores de ZIP y copias antiguas basadas en blobs.                 |
| Interfaz                         | Ajustes, estadísticas, partidas y modales se cargan bajo demanda. Colección memorizada, contenido fuera de vista diferido y eliminación del desenfoque de cada tarjeta. No se ha introducido virtualización del DOM.                                                                       |
| Trabajo periódico y organización | Git solo se consulta en desarrollo, con timeout. Los historiales idénticos no se reescriben. Se separan manejadores IPC, sesiones, detección de partidas, archivos ZIP, restauración y retención.                                                                                          |

## Mediciones aisladas en WSL

- Catálogo público, 53.090 juegos: la implementación anterior procesaba el YAML en unos 37,2 segundos; el nuevo trabajador completó el procesamiento y la transferencia en unos 1,5 segundos. El intervalo de comprobación del hilo principal tuvo un hueco máximo de 103 ms, incluyendo la preparación y transferencia de datos.
- Copia de prueba de 64 MiB: unos 530 ms; RSS inicial de 94 MiB y pico de 144 MiB en el proceso de prueba.
- Son mediciones individuales, no percentiles de una batería ni medidas del instalador de Windows. El trabajador usa hasta 512 MiB de heap; este límite no equivale al RSS total del proceso.

## Verificación

- 43 pruebas individuales pasan: 20 del núcleo y 23 de escritorio. Incluyen concurrencia, restauración de datos dañados, rutas maliciosas, colisiones, ZIP antiguos, límites de descompresión y recuperación de sustituciones interrumpidas.
- Tipos, lint, formato de los archivos modificados y compilación pasan.
- Arranque de Electron con un perfil temporal: preload e IPC funcionan con sandbox activado.

Los registros `performance.log` y `performance.log.previous`, en el directorio de datos de Electron, guardan fases de arranque, CPU, memoria y retraso del bucle de eventos. Se rotan al superar aproximadamente 1 MiB. No contienen claves ni rutas de partidas.

La restauración necesita espacio temporal en el mismo volumen que las partidas. El registro permite recuperar interrupciones del proceso; no constituye una garantía frente a fallos físicos de almacenamiento. Queda por validar esta compilación instalada en Windows y con las carpetas de sincronización reales.
