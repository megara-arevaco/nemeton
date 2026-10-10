import { LoadingState } from "../LoadingState";
import type { LibraryGame } from "@launcher/core";
import { useTranslation } from "react-i18next";
import { FloppyDisk } from "@phosphor-icons/react/FloppyDisk";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { useSavegamesPanel } from "./SavegamesPanel.hook";

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function SavegamesPanel({ game }: Readonly<{ game: LibraryGame }>) {
  const { t, i18n } = useTranslation();
  const {
    loading,
    data,
    busy,
    status,
    copy,
    conflictCopy,
    run,
    chooseFolder,
    backup,
    restoreLatest,
    restoreVersion,
    setPolicy,
    pinVersion,
    addFolder,
    removeFolder,
    verifyVersion,
    integrity,
    verificationFailed,
    retryVerification,
  } = useSavegamesPanel(game);

  if (loading) {
    return <LoadingState variant="panel" label={t("savegames.preparing")} />;
  }

  return (
    <section className="savegames-section [margin:24px_34px_0] [padding:22px] [border:1px_solid_#ffffff0d] [border-radius:18px] [background:#101119]">
      <div className="savegames-heading [display:flex] [align-items:center] [justify-content:space-between] [gap:16px]">
        <div className="[display:flex] [align-items:center] [gap:12px]">
          <span className="[display:grid] [place-items:center] [width:38px] [height:38px] [border-radius:11px] [background:color-mix(in_srgb,_var(--accent-a)_12%,_transparent)] [color:var(--accent-a)]">
            <FloppyDisk weight="fill" />
          </span>
          <span>
            <small className="[display:block] [margin-bottom:3px] [color:#9699a4] [font-size:11px] [font-weight:700] [letter-spacing:1px]">
              {t("savegames.section")}
            </small>
            <strong className="[display:block] [font-size:15px]">{copy.title}</strong>
          </span>
        </div>
        <i
          aria-label={copy.title}
          className={`save-sync-indicator [width:10px] [height:10px] [border-radius:50%] [background:#777b86] [&.ok]:[background:var(--accent-a)] [&.warning]:[background:#e9bd70] [&.error]:[background:#ff727d] ${copy.tone}`}
        />
      </div>
      <p className="save-sync-detail [margin:12px_0_0] [color:#a5a8b2] [font-size:12px] [line-height:1.55]">
        {copy.detail}
      </p>
      <p className="[margin:7px_0_0] [color:#9295a0] [font-size:11px] [line-height:1.5]">
        {t("savegames.providerNote")}
      </p>
      {data?.backupFailure && (
        <p
          role="alert"
          className="[margin:12px_0_0] [padding:11px_12px] [border:1px_solid_#ff727d40] [border-radius:9px] [background:#ff727d0c] [color:#ffb0b5] [font-size:12px] [line-height:1.5]"
        >
          {t("savegames.lastFailure", {
            date: new Date(data.backupFailure.failedAt).toLocaleString(i18n.language),
            message: data.backupFailure.message,
          })}
        </p>
      )}

      {data?.syncState === "conflict" && (
        <div className="[margin-top:16px] [padding:14px] [border:1px_solid_#e9bd7040] [border-radius:12px] [background:#e9bd700c]">
          <strong className="[display:block] [margin-bottom:7px] [color:#f0d28f] [font-size:12px]">
            {t("savegames.conflictTitle")}
          </strong>
          <p className="[margin:0_0_12px] [color:#d7c59d] [font-size:12px] [line-height:1.6]">
            {conflictCopy} {t("savegames.conflictHelp")}
          </p>
          <div className="[display:flex] [flex-wrap:wrap] [gap:8px]">
            <button
              className="save-action"
              disabled={busy}
              onClick={() => run(backup, "savegames.keptLocal")}
            >
              <FloppyDisk /> {t("savegames.keepLocal")}
            </button>
            <button
              className="save-action"
              disabled={busy}
              onClick={() => run(restoreLatest, "savegames.restoredRemote")}
            >
              <ShieldCheck /> {t("savegames.restoreRemote")}
            </button>
          </div>
        </div>
      )}

      {data && data.paths.length > 0 && (
        <div className="[margin-top:18px]">
          <h3 className="save-subheading">{t("savegames.sourceFolders")}</h3>
          <ul className="[display:grid] [gap:7px] [margin:0] [padding:0] [list-style:none]">
            {data.paths.map((folderPath) => (
              <li
                key={folderPath}
                className="[display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:9px_10px] [border-radius:9px] [background:#ffffff06]"
              >
                <span
                  title={folderPath}
                  className="[min-width:0] [overflow:hidden] [color:#b9bbc3] [font-size:11px] [text-overflow:ellipsis] [white-space:nowrap]"
                >
                  {folderPath}
                </span>
                <button
                  className="save-link"
                  disabled={busy}
                  onClick={() =>
                    run(() => removeFolder(folderPath), "savegames.folderRemoved")
                  }
                >
                  {t("savegames.removeFolder")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && data.suggestions.length > 0 && (
        <div className="[margin-top:14px]">
          <h3 className="save-subheading">{t("savegames.suggestions")}</h3>
          {data.suggestions.map((suggestion) => (
            <button
              key={suggestion.path}
              title={suggestion.path}
              className="save-suggestion"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    window.launcher.addSuggestedSavegameFolder(
                      game.id,
                      suggestion.path,
                    ),
                  "savegames.folderAdded",
                )
              }
            >
              <FolderOpen /> <span>{suggestion.path}</span>{" "}
              <small>{t(`savegames.confidence.${suggestion.confidence}`)}</small>
            </button>
          ))}
        </div>
      )}
      <div className="[display:flex] [flex-wrap:wrap] [gap:8px] [margin-top:14px]">
        <button
          className="save-action"
          disabled={busy}
          onClick={() => run(addFolder, "savegames.folderAdded")}
        >
          <FolderOpen /> {t("savegames.addFolder")}
        </button>
        {data &&
          data.paths.length > 0 &&
          data.syncConfigured &&
          data.syncState !== "path-missing" && (
            <button
              className="save-action save-action-primary"
              disabled={busy}
              onClick={() => run(backup, "savegames.synced")}
            >
              <FloppyDisk /> {t("savegames.createBackup")}
            </button>
          )}
        {verificationFailed && (
          <button
            className="save-action"
            disabled={busy}
            onClick={() => void retryVerification()}
          >
            {t("savegames.retry")}
          </button>
        )}
        {data && data.syncConfigured && data.missingPaths.length > 0 && (
          <button
            className="save-action"
            disabled={busy}
            onClick={() => run(chooseFolder, "savegames.folderUpdated")}
          >
            <FolderOpen /> {t("savegames.replaceMissingFolder")}
          </button>
        )}
      </div>

      {data && (
        <div className="[margin-top:20px] [padding-top:17px] [border-top:1px_solid_#ffffff12]">
          <h3 className="save-subheading">{t("savegames.policyTitle")}</h3>
          <p className="[margin:0_0_12px] [color:#a1a4af] [font-size:11px] [line-height:1.55]">
            {t("savegames.policyExplanation")}
          </p>
          <div className="[display:grid] [grid-template-columns:repeat(auto-fit,_minmax(220px,_1fr))] [gap:8px_16px]">
            <label className="save-policy-option">
              <input
                type="checkbox"
                checked={data.policy.autoBackup}
                disabled={busy}
                onChange={(event) =>
                  void run(
                    () => setPolicy({ autoBackup: event.target.checked }),
                    "savegames.policySaved",
                  )
                }
              />{" "}
              {t("savegames.autoBackup")}
            </label>
            <label className="save-policy-option">
              <input
                type="checkbox"
                checked={data.policy.backupBeforeLaunch}
                disabled={busy}
                onChange={(event) =>
                  void run(
                    () => setPolicy({ backupBeforeLaunch: event.target.checked }),
                    "savegames.policySaved",
                  )
                }
              />{" "}
              {t("savegames.backupBeforeLaunch")}
            </label>
            <label className="save-policy-option">
              <input
                type="checkbox"
                checked={data.policy.exactRestore}
                disabled={busy}
                onChange={(event) =>
                  void run(
                    () => setPolicy({ exactRestore: event.target.checked }),
                    "savegames.policySaved",
                  )
                }
              />{" "}
              {t("savegames.exactRestore")}
            </label>
            <label className="save-policy-option">
              <input
                type="checkbox"
                checked={data.policy.includeConfig}
                disabled={busy}
                onChange={(event) =>
                  void run(
                    () => setPolicy({ includeConfig: event.target.checked }),
                    "savegames.policySaved",
                  )
                }
              />{" "}
              {t("savegames.includeConfig")}
            </label>
          </div>
          <label className="[display:inline-flex] [align-items:center] [gap:9px] [margin-top:13px] [color:#b8bbc4] [font-size:12px]">
            {t("savegames.retention")}
            <select
              value={data.policy.maxVersions}
              disabled={busy}
              onChange={(event) =>
                void run(
                  () => setPolicy({ maxVersions: Number(event.target.value) }),
                  "savegames.policySaved",
                )
              }
              className="[height:32px] [border:1px_solid_#ffffff18] [border-radius:8px] [padding:0_9px] [background:#171820] [color:#f1f2f5]"
            >
              {[1, 2, 5, 10, 20].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {data && data.versions.length > 0 && (
        <div className="[margin-top:20px] [padding-top:17px] [border-top:1px_solid_#ffffff12]">
          <h3 className="save-subheading">
            {t("savegames.historyTitle", { count: data.versions.length })}
          </h3>
          <div className="[display:grid] [gap:9px]">
            {data.versions.map((version) => {
              const state = integrity[version.id];
              return (
                <article
                  key={version.id}
                  className="[display:grid] [grid-template-columns:minmax(0,_1fr)_auto] [align-items:center] [gap:12px] [padding:12px] [border:1px_solid_#ffffff0c] [border-radius:11px] [background:#ffffff04]"
                >
                  <div className="[min-width:0]">
                    <strong className="[display:block] [color:#eceef2] [font-size:12px]">
                      {new Date(version.createdAt).toLocaleString(i18n.language)}
                    </strong>
                    <p className="[margin:5px_0_0] [color:#a1a4af] [font-size:11px] [line-height:1.5]">
                      {t("savegames.versionDetails", {
                        size: formatBytes(version.sizeBytes),
                        files: version.fileCount,
                        device: version.deviceName,
                      })}
                    </p>
                    <small className="[display:block] [margin-top:5px] [color:#a1a4af] [font-size:11px]">
                      {state === "verified"
                        ? t("savegames.integrityVerified")
                        : state === "corrupt"
                          ? t("savegames.integrityFailed")
                          : state === "checking"
                            ? t("savegames.integrityChecking")
                            : t("savegames.integrityUnknown")}
                    </small>
                  </div>
                  <div className="[display:flex] [flex-wrap:wrap] [justify-content:flex-end] [gap:6px]">
                    <button
                      className="save-link"
                      disabled={busy || state === "checking"}
                      onClick={() => void verifyVersion(version.id)}
                    >
                      {t("savegames.verifyVersion")}
                    </button>
                    <button
                      className="save-link"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => pinVersion(version.id, !version.pinned),
                          "savegames.pinUpdated",
                        )
                      }
                    >
                      {version.pinned ? t("savegames.unpin") : t("savegames.pin")}
                    </button>
                    <button
                      className="save-action save-action-primary"
                      disabled={busy || !data.syncConfigured || data.paths.length === 0}
                      onClick={() =>
                        run(
                          () => restoreVersion(version.id),
                          "savegames.versionRestored",
                        )
                      }
                    >
                      {t("savegames.restoreVersion")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {status && (
        <p
          role="status"
          aria-live="polite"
          className="savegame-status [margin:14px_0_0] [border-radius:8px] [padding:10px_12px] [background:#a9fb760d] [color:#d2e8c2] [font-size:12px]"
        >
          {status}
        </p>
      )}
    </section>
  );
}
