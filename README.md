# Nemeton

Nemeton is a local-first desktop game launcher for keeping games, play history,
achievements, artwork, and save-game backups in one place. It can discover an
existing Steam installation, import games from a Steam account, and manage local
executables without requiring a Nemeton account or a hosted Nemeton service.

## Features

- Steam library discovery on Windows, Linux, macOS, and WSL.
- Steam account import through the official Steam Web API.
- Local game entries with custom executables and artwork.
- Launching through `steam://rungameid/<app-id>` or a local executable.
- Local playtime, session history, recent activity, and statistics.
- Local achievement detection for supported Steam-compatible formats.
- Save-game discovery and versioned backups with Ludusavi integration.
- Folder-based history and save synchronization, suitable for Google Drive,
  OneDrive, Dropbox, Syncthing, or another folder synchronization provider.
- A permanently dark interface with selectable accent themes.
- Local, atomic persistence with stable internal game identifiers.

## Technology

Nemeton is a pnpm workspace containing:

- `apps/desktop`: Electron, React 19, Vite, and TypeScript desktop application.
- `packages/core`: platform-independent library, Steam, artwork, achievement,
  and persistence logic.

## Requirements

- [Node.js](https://nodejs.org/) 22 or newer.
- [Corepack](https://nodejs.org/api/corepack.html), included with supported
  Node.js releases.
- Windows 10 or 11 when producing and testing the Windows installers.

The repository pins pnpm 10.15.0 through the `packageManager` field. You do not
need to install pnpm globally.

## Install dependencies

From the repository root:

```bash
corepack enable
corepack pnpm install
```

If Corepack cannot modify the global Node.js installation, the commands below
can still be run as `corepack pnpm <command>` without enabling its shims.

## Development

Start Electron with hot reload:

```bash
corepack pnpm dev
```

The renderer and Electron main process are rebuilt automatically while the
development process is running.

Before submitting a change, run:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

`build` compiles the Electron main process, preload script, and React renderer
into `apps/desktop/out/`. It does **not** create a distributable `.exe`.

## Build Windows executables

The most reliable environment for creating Windows artifacts is native Windows
PowerShell. Clone the repository on a Windows drive, install Node.js, and run the
following commands from the repository root.

### Build both installer and portable editions

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dist:win
```

This produces:

```text
apps/desktop/release/Nemeton Setup 0.1.0.exe
apps/desktop/release/Nemeton Portable 0.1.0.exe
apps/desktop/release/win-unpacked/
```

The exact version in each filename comes from `apps/desktop/package.json`.

### Build only the NSIS installer

```powershell
corepack pnpm dist:win:installer
```

The NSIS installer:

- Allows the user to choose an installation directory.
- Installs for the current user rather than the entire machine.
- Creates desktop and Start menu shortcuts.
- Keeps application data when Nemeton is uninstalled.

Output:

```text
apps/desktop/release/Nemeton Setup 0.1.0.exe
```

### Build only the portable executable

```powershell
corepack pnpm dist:win:portable
```

Output:

```text
apps/desktop/release/Nemeton Portable 0.1.0.exe
```

The portable package does not install Nemeton, but application data still uses
Electron's normal per-user data directory. “Portable” describes distribution of
the executable; it does not currently mean that the library database is stored
beside the executable.

### Build from WSL or Linux

The regular application build works in WSL or Linux:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

`electron-builder` can cross-build some Windows targets from Linux, but NSIS and
Windows executable processing may require Wine and additional system packages.
For reproducible `.exe` releases, use native Windows or a Windows CI runner.

## Versioning a release

Update the version in both the root package and the desktop package before
building:

```text
package.json
apps/desktop/package.json
```

Then reinstall to refresh the lockfile metadata, validate the project, and build
the artifacts:

```powershell
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm dist:win
```

The `apps/desktop/release/` directory is ignored by Git. Publish the generated
executables as GitHub Release assets rather than committing them to the source
repository.

## Code signing and Windows SmartScreen

The default build is unsigned. Windows may display a SmartScreen warning when an
unsigned installer or portable executable is downloaded from the internet. A
public release should be signed with an appropriate Windows code-signing
certificate through `electron-builder`; no signing credentials belong in this
repository.

## Application data and credentials

Nemeton stores its database and settings in Electron's per-user application data
directory. The Steam Web API key is encrypted using Electron `safeStorage` (and
Windows DPAPI when applicable) before it is written to disk.

Application data, Steam credentials, synchronized histories, save backups, and
generated release artifacts are not part of the Git repository.

Folder synchronization deliberately retains the historical
`launcher-next-*` internal filenames for compatibility with existing libraries.
They are implementation details and do not affect the Nemeton product name.

## Regenerate the application icon

The vector source is located at:

```text
apps/desktop/resources/nemeton-mark.svg
```

After changing it, regenerate the PNG consumed by `electron-builder`:

```bash
node apps/desktop/scripts/render-icon.cjs
```

The generated file is `apps/desktop/resources/icon.png`.

## License

See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
