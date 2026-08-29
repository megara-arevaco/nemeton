# Nemeton

Un launcher de juegos local e independiente. Esta primera fase importa juegos
instalados en Steam, mantiene una biblioteca local y permite iniciarlos sin una
cuenta ni servicios remotos.

## Desarrollo

Requisitos: Node.js 22 y pnpm 10.

```bash
pnpm install
pnpm dev
```

## Alcance actual

- Aplicación Electron con Vite, React 19 y TypeScript.
- Descubrimiento de bibliotecas Steam en Windows, Linux, macOS y WSL.
- Persistencia local y atómica en el directorio de datos de la aplicación.
- Lanzamiento mediante `steam://rungameid/<app-id>`.
- Alta y lanzamiento de ejecutables locales.
- Seguimiento de tiempo para procesos locales iniciados desde el launcher.
- Importación de horas y última sesión desde los archivos locales de Steam.
- Carátulas personalizadas copiadas al directorio privado de la aplicación.
- Identificadores internos estables preparados para futuras migraciones.

La sincronización, las cuentas y Google Drive quedan expresamente fuera de esta
fase. La sincronización se abordará únicamente después de completar la experiencia
local y el empaquetado de escritorio.
