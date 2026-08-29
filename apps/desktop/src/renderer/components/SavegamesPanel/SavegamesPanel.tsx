import type { LibraryGame } from "@launcher/core";
import { FloppyDisk } from "@phosphor-icons/react/FloppyDisk";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { useSavegamesPanel } from "./SavegamesPanel.hook";

export function SavegamesPanel({ game }: Readonly<{ game: LibraryGame }>) {
  const { data, busy, status, copy, run, chooseFolder, backup } =
    useSavegamesPanel(game);

  return (
    <section
      className={
        "savegames-section [margin:24px_34px_0] [padding:24px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119] compact-save-status [padding-bottom:22px] [&_>_.cover-button]:[margin-top:14px]"
      }
    >
      <div
        className={
          "savegames-heading [&_>_div]:[gap:12px] [&_small]:[display:block] [&_strong]:[display:block] [&_small]:[margin-bottom:3px] [&_small]:[color:#696c78] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.4px] [&_strong]:[font-size:14px]"
        }
      >
        <div>
          <span
            className={
              "section-icon [display:grid] [place-items:center] [width:38px] [height:38px] [border-radius:11px] [background:#a9fb7615] [color:#a9fb76]"
            }
          >
            <FloppyDisk weight="fill" />
          </span>
          <span>
            <small>PARTIDAS GUARDADAS</small>
            <strong>{copy.title}</strong>
          </span>
        </div>
        <i
          className={`save-sync-indicator [width:10px] [height:10px] [border-radius:50%] [background:#777b86] [box-shadow:0_0_0_5px_#777b8610] [&.ok]:[background:#a9fb76] [&.ok]:[box-shadow:0_0_0_5px_#a9fb7612] [&.warning]:[background:#e9bd70] [&.warning]:[box-shadow:0_0_0_5px_#e9bd7012] [&.error]:[background:#ff727d] [&.error]:[box-shadow:0_0_0_5px_#ff727d12] ${copy.tone}`}
        />{" "}
      </div>
      <p
        className={
          "save-sync-detail [margin:12px_0_0] [color:#777b86] [font-size:11px] [line-height:1.5]"
        }
      >
        {copy.detail}
      </p>
      {data &&
        (data.syncState === "not-detected" ||
          data.syncState === "path-missing") && (
          <button
            className={
              "cover-button [display:flex] [align-items:center] [gap:8px] [border:1px_solid_#ffffff18] [border-radius:12px] [padding:12px_16px] [background:#ffffff0b] [cursor:pointer]"
            }
            disabled={busy}
            onClick={() => run(chooseFolder, "Carpeta de partidas actualizada")}
          >
            <FolderOpen /> Indicar carpeta
          </button>
        )}
      {data &&
        (data.syncState === "waiting-backup" ||
          data.syncState === "pending") && (
          <button
            className={
              "cover-button [display:flex] [align-items:center] [gap:8px] [border:1px_solid_#ffffff18] [border-radius:12px] [padding:12px_16px] [background:#ffffff0b] [cursor:pointer]"
            }
            disabled={busy}
            onClick={() => run(backup, "Partidas sincronizadas")}
          >
            <FloppyDisk /> Sincronizar ahora
          </button>
        )}
      {status && (
        <p className={"savegame-status [background:#a9fb760d] [color:#a9fb76]"}>
          {status}
        </p>
      )}
    </section>
  );
}
