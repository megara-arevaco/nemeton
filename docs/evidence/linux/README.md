# Evidencia E2E de Electron en Linux

Generada por `corepack pnpm test:e2e` en Linux con juegos/partidas ficticios, directorios temporales de usuario y tráfico externo bloqueado. No contiene partidas auténticas, credenciales ni Steam real.

- `two-device-merge.png`: biblioteca después del merge de dos procesos Electron independientes que usaron una carpeta temporal compartida.
- `achievements-top.png`, `achievements-middle.png`, `achievements-bottom.png`: desplazamiento real de Electron por el catálogo fixture de 120 logros; muestra el inicio, entradas intermedias y el final/estado oculto.
- `achievements-compact.png`: captura de la ventana a 960 × 760 CSS px; el E2E comprueba que no se desbordan el documento, la aplicación ni la cuadrícula.
- `achievement-contrast.json`: ratios calculados desde los colores computados y opacidad efectiva del texto bloqueado y anillo de foco en los cinco temas.

El ensayo visual no valida Windows, lectores de pantalla ni servicios reales de sincronización en la nube.
