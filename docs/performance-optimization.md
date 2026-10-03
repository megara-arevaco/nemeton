# Optimización de rendimiento

Fecha: 2026-10-02. Cambios aplicados al repositorio, comprobados en WSL y Electron con un perfil temporal.

## Cambios

- Biblioteca JSON con caché compartida y acotada, invalidada por cambios del archivo, e índice por juego. Las lecturas devuelven copias independientes. La importación de Steam agrupa sus cambios en una sola transacción.
- Actualizaciones incrementales por IPC con revisiones, recuperación cuando faltan eventos y rechazo de respuestas antiguas. Los cambios idénticos no generan publicaciones.
- Colección y barra lateral virtualizadas para más de 200 juegos, con navegación por teclado y ajuste al tamaño de ventana. La agrupación de estadísticas evita copiar repetidamente los historiales.
- Partidas en fases: estado inicial barato, descubrimiento y verificación posterior. La interfaz muestra «comprobando» hasta verificar los hashes. El hash no mantiene bloqueada la configuración; su resultado se descarta si cambian la configuración o la versión remota.
- Las copias idénticas evitan preparar archivos temporales. Las copias modificadas siguen verificando los bytes realmente archivados; la comprobación previa implica una lectura adicional en ese caso.
- Catálogos indexados, caché acotada de logros y lectura del catálogo Ludusavi en un trabajador. Publicación de índices completa, sin estados parciales durante la carga.
- Reintentos automáticos espaciados tras errores, consultas de logros adaptativas y minificación de JavaScript y CSS.
- Métricas acotadas de duración por operación: cantidad, errores, máximo, p50 y p95 de las últimas 256 muestras. Incluyen IPC y tiempos de disponibilidad de biblioteca y detalle en `performance.log`.

## Mediciones

El JavaScript del renderer pasa de aproximadamente 909 kB a 409 kB sin comprimir, incluyendo las nuevas funciones. Con 1.000 juegos, la comprobación de navegador monta 20 tarjetas y 12 filas de la barra lateral en el tamaño de ventana probado.

El benchmark sintético usa 1.000 juegos y hasta 50.000 sesiones. Ejecuta una primera lectura y calcula la mediana de siete lecturas posteriores, tras una de calentamiento:

```sh
corepack pnpm benchmark:performance
```

Con 50.000 sesiones, las ejecuciones locales dieron aproximadamente 4–9 ms para una lectura completa desde caché y 0,06–0,13 ms para buscar un juego. La primera lectura sigue leyendo, analizando y normalizando JSON: osciló aproximadamente entre 90 y 131 ms. Estas medidas no incluyen transferencia IPC, renderizado ni tiempos del instalador de Windows.

Se conserva JSON: la caché y las consultas por juego eliminan el análisis repetido del historial y mantienen la compatibilidad del almacenamiento. SQLite sigue siendo una opción si las mediciones reales muestran que las escrituras completas o la primera carga son el siguiente cuello de botella.

## Validación

- 69 pruebas: 24 del núcleo y 45 de escritorio. Cubren concurrencia, invalidación de caché, revisiones, verificación de partidas, cambios remotos y cálculo de ventanas virtuales.
- Tipos, lint, formato de los archivos afectados y compilación local.
- Navegador con 1.000 juegos: navegación Home/End, ajuste de ventana, verificación progresiva, reintento tras error, recuperación de eventos perdidos y actualización incremental sin recargar la biblioteca.
- Electron con perfil temporal: preload e IPC con sandbox, publicación de cambios, copia y verificación de partidas, catálogo cargado por el trabajador y escritura de métricas.

Queda por medir esta compilación instalada en Windows con bibliotecas y carpetas de sincronización reales. Los datos sintéticos no permiten asegurar una mejora equivalente en todos los equipos.
