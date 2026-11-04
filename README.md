<div align="center">
  <img src="apps/desktop/resources/nemeton-mark.svg" width="132" height="132" alt="Nemeton logo">
  <h1>Nemeton</h1>
  <p><strong>Your games, play history, achievements, and saves — in one local-first library.</strong></p>
  <p>
    <img alt="Electron" src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white">
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=0B1320">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
    <img alt="License" src="https://img.shields.io/badge/License-MIT-B7FF64">
    <img alt="Platform" src="https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=white">
    <a href="https://github.com/megara-arevaco/nemeton/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/megara-arevaco/nemeton/actions/workflows/ci.yml/badge.svg"></a>
    <a href="https://github.com/megara-arevaco/nemeton/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/megara-arevaco/nemeton?display_name=tag"></a>
  </p>
</div>

Nemeton is a desktop game launcher that brings installed Steam games, account
libraries, local executables, playtime, achievements, artwork, and save backups
into one focused interface. It is designed to work without a Nemeton account or
a hosted Nemeton service: your library and credentials remain on your computer.

> [!NOTE]
> Nemeton is under active development. Windows is the primary supported desktop
> platform, and current builds are unsigned development builds.

## What Nemeton does

- Discovers installed Steam libraries on Windows, Linux, macOS, and WSL.
- Imports owned games and Steam playtime through the official Steam Web API.
- Adds local games with editable executables, artwork, playtime, and Steam AppIDs.
- Imports Epic and GOG libraries using locally configured Legendary and gogdl helpers.
- Groups explicitly matched store copies into one game with total and per-store playtime.
- Reconciles store counters with tracked sessions to avoid counting the same time twice.
- Organizes games with collections, tags, remembered filters, and recent/pending shortcuts.
- Launches games through their store adapter or directly from a local executable.
- Tracks local sessions and presents recent, monthly, yearly, and all-time statistics.
- Reads Steam account achievements with a local cache, alongside local achievement formats.
- Manages Real-Debrid and BitTorrent transfers with priority, global pause, bandwidth limits, and a completed-download-to-library flow.
- Discovers save locations using the Ludusavi manifest.
- Creates versioned save backups, validates archives, and enforces retention.
- Synchronizes manual history, achievement history, and saves through a folder you
  control — including folders managed by OneDrive, Google Drive, Dropbox, or Syncthing.
- Offers a dark interface with multiple accent themes and accessible primary actions.
- Permanently excludes deleted games so a future Steam scan does not silently add
  them back.

## Requirements

### To use the Windows application

- Windows 10 or Windows 11, x64.
- A Steam installation is optional; it is only needed for local Steam discovery and
  launching Steam games.
- Internet access is optional for local games. It is required for Steam account
  imports, metadata, remote artwork, and refreshing the Ludusavi manifest.
- Importing every visible game from a Steam account requires:
  - a 64-bit Steam ID;
  - a personal [Steam Web API key](https://steamcommunity.com/dev/apikey); and
  - Steam profile game details that the API is allowed to read.

Nemeton encrypts the Steam Web API key with Electron `safeStorage` and Windows
DPAPI when available. It never commits application data, credentials, save backups,
or generated installers to this repository.

### To develop Nemeton

- [Node.js](https://nodejs.org/) 22 or newer.
- [Corepack](https://nodejs.org/api/corepack.html), normally included with Node.js.
- Git.
- Windows 10 or 11 for final verification of Windows installers.

The workspace pins pnpm 10.15.0, so a separate global pnpm installation is not
required.

## Using Nemeton

### Start without a Steam key

On first use, choose **Import installed games** to scan local Steam libraries without
an API key, or **Add game** to create a local entry. A SteamID64 and API key are
optional and only needed for importing the full account library.

### Import a complete Steam account library

1. Open **Settings → Steam**.
2. Enter your SteamID64 or Steam profile URL and personal Steam Web API key.
3. Select **Connect Steam**.
4. Refresh the account later to merge newly owned games and updated Steam playtime.

Steam controls which library details the Web API exposes. A private game-details
setting can prevent account-wide imports; local installed-game discovery continues
to work independently.

### Connect Epic Games or GOG

Open **Settings** and find the store connection. Download a standalone helper from
[Legendary releases](https://github.com/derrod/legendary/releases/latest) for Epic or
[gogdl releases](https://github.com/Heroic-Games-Launcher/heroic-gogdl/releases/latest)
for GOG, then select its executable. Helpers already on the application's PATH are
detected automatically. Use the browser sign-in button and paste the authorization
code or GOG return URL into Nemeton. No Nemeton server or account is required.

After import, a game's installation panel provides installation discovery, updates,
and verification. Installs use a folder selected by the user; store transfers also
appear in Downloads. Running Windows games on Linux may require the helper's Wine
configuration. Native Windows and Linux builds should use helpers for their own OS.

Tokens are sealed with the operating system's secure storage between helper calls.
When secure storage is unavailable, they are kept for the session only. Helpers
receive a private credential file during execution; Nemeton removes it after the
operation and during orderly shutdown. Store adapters use community-maintained
interfaces, and live-account validation remains separate from mocked integration tests.

### Group copies and combine playtime

Open a game and use **Copies and playtime** to explicitly match another copy of the
same game and edition. Copies keep their own IDs, installations, sessions and store
counters. They can be separated again, and the preferred copy is remembered locally.
Nemeton never merges editions solely because their titles look similar.

20 hours on Steam, 8 on Epic and 5 on GOG produce a 33-hour total. New store counter
increments first acknowledge sessions already measured by Nemeton. Epic history is
queried during library import; GOG history is refreshed on demand when its grouped
game is opened. If a store cannot supply history, the total is marked partial and
Nemeton's recorded sessions remain available. If history is first discovered after
offline tracking and its overlap cannot be established, the total remains explicitly
partial rather than presenting an exact reconciliation.

### Control downloads

Downloads separates activity from completed/cancelled history. Global pause records
which tasks it paused, so resuming that group leaves manually paused tasks alone.
Queued tasks support priority. Configuration sets concurrency and a shared transfer
speed limit in KiB/s; zero means unlimited. Cleaning completed history preserves files.
After completion, **Add to library** lets you choose an executable and opens a prefilled
local-game form without running it.

Pausing preserves partial files, including across application restarts. Resume
continues from the saved position; when a host supplies no file validators, Nemeton
checks overlapping saved bytes before appending. If the host ignores resume
requests or the remote content changes, the task stops with an error and preserves
the partial file instead of silently restarting it.

### Add a local game

Choose **Add game**, select an executable, and optionally associate the title with a
Ludusavi entry or Steam AppID. The association improves artwork, achievement, and
save-location detection.

To import several local games, choose **Add game → Scan folder** and select a
folder. Nemeton checks its subfolders, groups possible executables by game folder,
and marks installations already in your library. Review each suggested name and
executable, then explicitly validate the game. Editing either field clears that
validation. Review the selected games in the final summary and confirm the import;
cancelling leaves the library unchanged. Common installers, uninstallers and helper
folders are skipped. A notice identifies incomplete scans so you can choose a
smaller folder. Detection is a suggestion: you decide which entries are games.

### Back up and restore saves

Open a game's save panel to review protected folders, detection suggestions,
backup policy, and version history. Each version shows its date, size, file count,
origin, and integrity check; restoring a selected version first preserves the current
state in another backup and asks for confirmation. Exact restore can remove extra files
only when that policy is explicitly enabled. Pin versions to protect them from
retention. Automatic backups after a game closes and optional pre-launch backups are
existing engine behaviors with visible controls; they require a configured backup
folder. A green verification means the local files match a backup in that folder, not
that OneDrive, Dropbox, or another provider has uploaded it.

In **Settings → Synchronization**, choose a local or cloud-synchronized folder.
Conflicts show local and folder versions side by side so you can keep the local state
as another version or restore a chosen version without silently overwriting current
saves.

### Export diagnostics

Settings offers a local JSON diagnostic report with app/runtime versions, aggregate
library counts and operation timings. It excludes credentials, account identities,
game titles, executable/save paths and raw logs. It is not uploaded automatically.

### Export, import, and portable data

**Settings → Portability and recovery** exports library metadata, play sessions,
achievement history, favorites, backlog status, language/theme preferences, and
save-backup policies. It does not export Steam API credentials, executable paths,
local save-folder paths, or the external synchronization folder. Import merges with
the current library, preserves existing local installation paths, and creates safety
copies of the library, backup policies, and achievement history before applying data.
Excluded-game keys from either file are retained as import filters: an excluded game
is not added when absent locally, but an exclusion never deletes a matching local game
or its sessions. A local exclusion therefore continues to block later re-imports.
Local artwork files are not included. Re-select local executables and save folders on
a different computer; those machine-specific paths are never restored from an export.

## Development

Clone the repository and install dependencies from its root:

```bash
git clone https://github.com/megara-arevaco/nemeton.git
cd nemeton
corepack enable
corepack pnpm install --frozen-lockfile
```

Start Electron with hot reload:

```bash
corepack pnpm dev
```

Validate a change before committing it:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

`test` (also available as `test:e2e`) builds the app and runs Playwright against
real Electron windows, the preload bridge, IPC handlers, and temporary data files.
The suite covers local-game creation/editing/deletion and persistence, keyboard
navigation and filtering in a 1,000-game library, and save backup/verification/restore
with a safety copy. Each test uses an isolated user-data directory and blocks HTTP
traffic; only native file-selection and confirmation dialogs are replaced.
No separate Playwright browser download is required: tests use the workspace Electron.
E2E windows are hidden by default and do not take focus. These are still real Electron
integration tests, not browser-only tests; setting Playwright's `headless` option alone
would not hide Electron windows. Background throttling is disabled for hidden test
windows so timers continue to run normally.

For visible debugging only, opt in with `NEMETON_E2E_HEADED=1`:

```bash
NEMETON_E2E_HEADED=1 corepack pnpm test
```

In PowerShell, set `$env:NEMETON_E2E_HEADED = "1"` before running tests, and remove it
with `Remove-Item Env:NEMETON_E2E_HEADED` afterwards.
On Linux, even hidden Electron windows require a working display or
`xvfb-run --auto-servernum corepack pnpm test` (a virtual display).
Failure traces and screenshots are available in `test-results/` and the HTML report
in `playwright-report/` (`corepack pnpm exec playwright show-report`).

`build` compiles the Electron main process, preload bridge, and React renderer into
`apps/desktop/out/`. It does not create a distributable executable.

## Building Windows executables

For the most reproducible Windows artifacts, run the build in native Windows
PowerShell:

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm dist:win
```

The current package version produces:

```text
apps/desktop/release/Nemeton-Setup-0.1.9.exe
apps/desktop/release/Nemeton-Portable-0.1.9.exe
apps/desktop/release/Nemeton-Setup-0.1.9.exe.blockmap
apps/desktop/release/latest.yml
apps/desktop/release/win-unpacked/
```

Build only one distribution format when needed:

```powershell
# NSIS installer
corepack pnpm dist:win:installer

# Portable executable
corepack pnpm dist:win:portable
```

The Windows installer has a branded Spanish welcome page with a native animated
logo and matching finish artwork. The animation respects the Windows animation
preference and can be paused from the welcome page. Windows distribution commands
generate the bitmap frames from the official SVG using
`apps/desktop/scripts/render-installer.cjs`; the NSIS customization lives in
`apps/desktop/build/installer.nsh`. Generated artwork is ignored by Git.

The installer is per-user, lets the user select an installation directory, creates
Desktop and Start menu shortcuts, and preserves Nemeton data after uninstalling.
The portable artifact does not require installation. When Electron's portable
launcher provides `PORTABLE_EXECUTABLE_DIR`, Nemeton uses a `NemetonData` folder next
to the portable executable instead of the installer's per-user data directory. Copy
that data folder or use the explicit export/import controls to move data. Windows
portable path behavior still needs validation in a native Windows run.

Cross-building from WSL or Linux can work when Wine and the required packaging tools
are installed. Native Windows or a Windows CI runner remains the recommended release
environment.

## Application updates

The Windows installed edition checks stable GitHub Releases 30 seconds after startup
and every six hours. Settings also provides a manual check, download progress, and
an explicit **Restart and install** button. Downloads are not automatic, and closing
Nemeton does not install a pending update. Save your work before restarting.
`electron-updater` verifies downloads against the SHA-512 metadata in `latest.yml`;
this integrity check does not replace code signing.

Development builds and non-Windows builds do not check or install updates. The
portable edition offers a link to Releases instead: close Nemeton, replace the
portable EXE, and keep the adjacent `NemetonData` directory.

The first release containing this feature must be installed manually. Subsequent
higher-version releases can be installed through the updater. End-to-end installer
replacement still requires validation on native Windows.

## Project structure

```text
nemeton/
├── apps/desktop/          Electron main process, preload bridge, and React UI
│   ├── resources/         Application icon and vector logo
│   └── src/
│       ├── main/          Native integration, IPC, saves, sync, and persistence
│       ├── preload/       Typed renderer-to-main API
│       └── renderer/      React interface and client-side queries
├── packages/core/         Platform-independent library and Steam domain logic
├── package.json           Workspace commands and pinned package manager
└── pnpm-workspace.yaml    Workspace package boundaries
```

## Publishing a release

Before producing a release, update the version in both `package.json` and
`apps/desktop/package.json`, refresh the lockfile, run the validation commands, and
commit the result. Then create and push a matching tag:

```bash
git tag -a v0.1.9 -m "Nemeton 0.1.9"
git push origin v0.1.9
```

The release workflow validates the tag against `package.json`, runs every quality
check on a Windows runner, builds the NSIS and portable editions, generates
`SHA256SUMS.txt`, and publishes both executables, the checksums, `latest.yml`, and
the installer's `.exe.blockmap` to GitHub Releases with generated release notes.
Do not rename the installer after building: `latest.yml` references its exact name.
Local distribution commands disable automatic publishing; the workflow publishes
all assets together. Published executables use portable asset names such as
`Nemeton-Setup-0.1.9.exe` and `Nemeton-Portable-0.1.9.exe`.

The `apps/desktop/release/` directory is intentionally ignored; executables belong
in GitHub Releases, not in source control.

The release workflow reads optional `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`
repository secrets and verifies Authenticode signatures when a certificate is configured.
Without a configured certificate, artifacts remain unsigned. Windows SmartScreen may warn when an unsigned
installer or portable executable is downloaded. An official public release process
builds in CI and publishes checksums. Signing credentials must remain in CI secrets. The release workflow also smoke-tests
the unpacked and silently installed Windows application with temporary data. These
steps require a native Windows runner; they are not proof that a local Linux build
was installed on Windows.

## Data locations and privacy

The installer stores its database and settings in Electron's per-user
application-data directory. The portable executable uses `NemetonData` next to the
EXE when `PORTABLE_EXECUTABLE_DIR` is supplied by the portable launcher. Settings
exports never contain a Steam API key, executable paths, save-folder paths, or the
external synchronization-folder path. A configured synchronization folder contains
versioned backup archives and portable play/achievement history intended for the
user's own storage provider.

Some synchronized files retain the historical `launcher-next-*` prefix for backward
compatibility with existing libraries. These names are internal implementation
details and do not affect the Nemeton product name.

## Regenerating the icon

The source artwork is
[`apps/desktop/resources/nemeton-mark.svg`](apps/desktop/resources/nemeton-mark.svg).
After editing it, regenerate the PNG consumed by `electron-builder`:

```bash
node apps/desktop/scripts/render-icon.cjs
```

## License

Nemeton is available under the [MIT License](LICENSE). Third-party acknowledgements
are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Custom Steam roots and packaged validation

`NEMETON_STEAM_ROOT` selects one explicit Steam root, including nonstandard or portable
client installations. `NEMETON_EPIC_MANIFESTS` and `NEMETON_GOG_ROOT` select explicit
Epic manifest and GOG installation directories. Test fixtures use temporary empty
roots so they never import installed games from the host computer.

After packaging, run `node scripts/smoke-packaged.mjs <path-to-Nemeton-executable>`
to check renderer startup, preload/IPC and persistence using temporary application data.
The script closes the test instance and removes only its temporary data.
