import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { X } from "@phosphor-icons/react/X";
import { Button } from "../Button";
import {
  downloadUriSchema,
  type DownloadMethod,
  type DownloadsSnapshot,
  type DownloadJob,
  type DownloadFile,
  type DownloadAction,
  type DownloadFileAction,
} from "../../../shared/downloads";
import "./DownloadsView.css";

const statusKey = ["downloads", "status"];
const activeStatuses = ["queued", "preparing", "downloading"];

type Run = (action: () => Promise<unknown>, notice?: string) => Promise<boolean>;

export function formatDownloadBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const unit = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${["B", "KiB", "MiB", "GiB", "TiB"][unit]}`;
}

export function DownloadsView() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [tab, setTab] = useState<"queue" | "configuration">("queue");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const status = useQuery({
    queryKey: statusKey,
    queryFn: window.launcher.getDownloads,
    refetchInterval: 500,
  });
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async (data) => {
      if (data && typeof data === "object" && "jobs" in data) {
        client.setQueryData(statusKey, data);
      }
      await client.invalidateQueries({ queryKey: statusKey });
    },
  });
  const run: Run = async (action, message) => {
    setError("");
    setNotice("");
    try {
      await mutation.mutateAsync(action);
      if (message) {
        setNotice(message);
      }
      return true;
    } catch (failure) {
      const code =
        failure instanceof Error
          ? failure.message.match(/([a-z][a-z0-9-]+)$/)?.[1]
          : undefined;
      setError(
        t(`downloads.failure.${code}`, { defaultValue: t("downloads.failure") }),
      );
      return false;
    }
  };
  const snapshot = status.data;
  const busy = mutation.isPending;

  if (status.isPending) {
    return (
      <div className="downloads-view" role="status">
        {t("downloads.loading")}
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="downloads-view" role="alert">
        <p>{t("downloads.loadFailed")}</p>
        <Button onClick={() => void status.refetch()}>{t("downloads.retry")}</Button>
      </div>
    );
  }
  return (
    <div className="downloads-view">
      <div className="downloads-heading">
        <h1>{t("downloads.title")}</h1>
        <p>{t("downloads.description")}</p>
      </div>
      <nav className="downloads-tabs" aria-label={t("downloads.title")}>
        {(["queue", "configuration"] as const).map((item) => (
          <button
            type="button"
            key={item}
            aria-current={tab === item ? "page" : undefined}
            onClick={() => {
              setTab(item);
              setError("");
              setNotice("");
            }}
          >
            {t(`downloads.${item}`)}
          </button>
        ))}
      </nav>
      {error && (
        <p className="downloads-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="downloads-notice" role="status">
          {notice}
        </p>
      )}
      {tab === "configuration" ? (
        <DownloadConfiguration snapshot={snapshot} run={run} busy={busy} />
      ) : (
        <>
          {!snapshot.directory && (
            <p className="downloads-hint">
              {t("downloads.noFolder")}{" "}
              <button type="button" onClick={() => setTab("configuration")}>
                {t("downloads.configuration")}
              </button>
            </p>
          )}
          <AddDownload snapshot={snapshot} run={run} busy={busy} />
          <div className="downloads-queue-heading">
            <h2>{t("downloads.queue")}</h2>
            <span>{t("downloads.parallel", { count: snapshot.maxConcurrent })}</span>
          </div>
          {!snapshot.jobs.length && (
            <div className="downloads-empty">
              <DownloadSimple size={28} />
              <h2>{t("downloads.emptyQueue")}</h2>
              <p>{t("downloads.emptyQueueHelp")}</p>
            </div>
          )}
          <div className="downloads-queue">
            {snapshot.jobs.map((job) => (
              <DownloadTask
                key={job.id}
                job={job}
                run={run}
                busy={busy}
                hasToken={snapshot.hasToken}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AddDownload({
  snapshot,
  run,
  busy,
}: {
  snapshot: DownloadsSnapshot;
  run: Run;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [torrent, setTorrent] = useState<{ id: string; name: string } | null>(null);
  const [links, setLinks] = useState("");
  const [method, setMethod] = useState<DownloadMethod | "">("");
  const [invalid, setInvalid] = useState(false);
  const [expanded, setExpanded] = useState(snapshot.jobs.length === 0);
  const selectedMethod = method || (snapshot.hasToken ? "real-debrid" : "torrent");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    const uris = links
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (
      !torrent &&
      (!uris.length ||
        uris.length > 50 ||
        uris.some((uri) => !downloadUriSchema.safeParse(uri).success))
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const ok = await run(async () => {
      if (torrent) {
        return window.launcher.startDownload({
          title: title || torrent.name,
          torrentFileId: torrent.id,
          method: selectedMethod,
        });
      }

      let result: DownloadsSnapshot | undefined;

      for (const uri of uris) {
        const url = new URL(uri);
        const suggested =
          url.protocol === "magnet:"
            ? url.searchParams.get("dn")
            : decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
        result = await window.launcher.startDownload({
          title: title || suggested || t("downloads.newDownload"),
          uri,
          method: selectedMethod,
        });
      }
      return result;
    }, t("downloads.added"));

    if (ok) {
      setLinks("");
      setTorrent(null);
      form.reset();
      setExpanded(false);
    }
  };
  return (
    <details
      className="downloads-add-panel"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <h2>{t("downloads.addDownload")}</h2>
      </summary>
      <form className="downloads-add" onSubmit={(event) => void submit(event)}>
        {torrent ? (
          <div className="downloads-selected-torrent">
            <span>{torrent.name}</span>
            <Button size="small" disabled={busy} onClick={() => setTorrent(null)}>
              {t("downloads.change")}
            </Button>
          </div>
        ) : (
          <label>
            {t("downloads.links")}
            <textarea
              name="links"
              value={links}
              onChange={(event) => {
                setLinks(event.target.value);
                setInvalid(false);
              }}
              rows={2}
              maxLength={409600}
              placeholder={t("downloads.linkPlaceholder")}
              aria-invalid={invalid || undefined}
            />
          </label>
        )}
        {invalid && (
          <p className="downloads-error" role="alert">
            {t("downloads.invalidLinks")}
          </p>
        )}
        <div className="downloads-add-fields">
          <label>
            {t("downloads.name")}
            <input name="title" maxLength={500} placeholder={t("downloads.optional")} />
          </label>
          <label>
            {t("downloads.method")}
            <select
              name="method"
              value={selectedMethod}
              onChange={(event) => setMethod(event.target.value as DownloadMethod)}
            >
              <option value="real-debrid" disabled={!snapshot.hasToken}>
                Real-Debrid
              </option>
              <option value="torrent">{t("downloads.torrent")}</option>
            </select>
          </label>
        </div>
        <div className="downloads-actions">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !snapshot.directory || (!torrent && !links.trim())}
          >
            <DownloadSimple />
            {t("downloads.addQueue")}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const selected = await window.launcher.chooseDownloadTorrent();

                if (selected) {
                  setTorrent(selected);
                  setLinks("");
                  setInvalid(false);
                }
              })
            }
          >
            <FolderOpen />
            {t("downloads.openTorrent")}
          </Button>
        </div>
        {!snapshot.hasToken && (
          <p className="downloads-muted">{t("downloads.connectHint")}</p>
        )}
      </form>
    </details>
  );
}

function DownloadTask({
  job,
  run,
  busy,
  hasToken,
}: {
  job: DownloadJob;
  run: Run;
  busy: boolean;
  hasToken: boolean;
}) {
  const { t } = useTranslation();
  const blocked = busy || (job.method === "real-debrid" && !hasToken);
  const active = activeStatuses.includes(job.status);
  const control = (action: DownloadAction) =>
    void run(() => window.launcher.controlDownload(job.id, action));
  return (
    <article className="downloads-job" aria-label={job.title}>
      <div className="downloads-row-heading">
        <h2>{job.title}</h2>
        <span className={`downloads-status is-${job.status}`}>
          {t(`downloads.${job.status}`)}
        </span>
      </div>
      <p className="downloads-muted">
        {job.method === "real-debrid" ? "Real-Debrid" : t("downloads.torrent")} ·{" "}
        {formatDownloadBytes(job.bytes)} / {formatDownloadBytes(job.total)}
        {active && ` · ${formatDownloadBytes(job.speed)}/s`}
        {active &&
          job.method === "torrent" &&
          ` · ${t("downloads.peers", { count: job.peers })}`}
      </p>
      {job.status === "preparing" && job.method === "real-debrid" && job.torrentId && (
        <div className="downloads-cloud">
          <span>
            {t("downloads.cloudProgress", { progress: Math.round(job.cloudProgress) })}
          </span>
          <progress
            aria-label={t("downloads.cloudPreparation")}
            value={job.cloudProgress}
            max={100}
          />
        </div>
      )}
      {job.error && (
        <p className="downloads-error" role="alert">
          {t(`downloads.failure.${job.error}`, {
            defaultValue: t("downloads.failure"),
          })}
        </p>
      )}
      <div className="downloads-actions">
        {active && (
          <Button size="small" disabled={busy} onClick={() => control("pause")}>
            <Pause />
            {t("downloads.pause")}
          </Button>
        )}
        {["paused", "interrupted", "error", "cancelled"].includes(job.status) && (
          <Button size="small" disabled={blocked} onClick={() => control("resume")}>
            <Play />
            {t("downloads.resume")}
          </Button>
        )}
        {!["completed", "cancelled"].includes(job.status) && (
          <Button size="small" disabled={busy} onClick={() => control("cancel")}>
            <X />
            {t("downloads.cancel")}
          </Button>
        )}
        {!active && job.status !== "waiting-selection" && (
          <Button
            size="small"
            disabled={busy}
            title={t("downloads.removeHelp")}
            onClick={() => control("remove")}
          >
            {t("downloads.remove")}
          </Button>
        )}
        <Button
          size="small"
          disabled={busy || job.status === "queued"}
          onClick={() => void run(() => window.launcher.openDownload(job.id))}
        >
          <FolderOpen />
          {t("downloads.open")}
        </Button>
      </div>
      {job.status === "waiting-selection" ? (
        <FileSelection job={job} run={run} busy={blocked} />
      ) : (
        <div className="downloads-files">
          {job.files
            .filter((file) => file.selected)
            .map((file) => (
              <DownloadFileRow
                key={file.id}
                job={job}
                file={file}
                run={run}
                busy={busy}
                blocked={blocked}
              />
            ))}
        </div>
      )}
    </article>
  );
}

function FileSelection({
  job,
  run,
  busy,
}: {
  job: DownloadJob;
  run: Run;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(
    () => new Set(job.files.map((file) => file.id)),
  );
  return (
    <form
      className="downloads-selection"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => window.launcher.selectDownloadFiles(job.id, [...selected]));
      }}
    >
      <h3>{t("downloads.selectFiles")}</h3>
      <label className="downloads-check">
        <input
          type="checkbox"
          checked={selected.size === job.files.length}
          onChange={(event) =>
            setSelected(
              new Set(event.target.checked ? job.files.map((file) => file.id) : []),
            )
          }
        />
        {t("downloads.selectAll")}
      </label>
      {job.files.map((file) => (
        <label key={file.id} className="downloads-check">
          <input
            type="checkbox"
            checked={selected.has(file.id)}
            onChange={(event) =>
              setSelected((previous) => {
                const next = new Set(previous);

                if (event.target.checked) {
                  next.add(file.id);
                } else {
                  next.delete(file.id);
                }
                return next;
              })
            }
          />
          <span>{file.name}</span>
          <small>{formatDownloadBytes(file.total)}</small>
        </label>
      ))}
      <Button
        type="submit"
        variant="primary"
        size="small"
        disabled={busy || !selected.size}
      >
        {t("downloads.downloadSelected", { count: selected.size })}
      </Button>
    </form>
  );
}

function DownloadFileRow({
  job,
  file,
  run,
  busy,
  blocked,
}: {
  job: DownloadJob;
  file: DownloadFile;
  run: Run;
  busy: boolean;
  blocked: boolean;
}) {
  const { t } = useTranslation();
  const control = (action: DownloadFileAction) =>
    void run(() => window.launcher.controlDownloadFile(job.id, file.id, action));
  const active = ["queued", "downloading"].includes(file.status);
  return (
    <div className="downloads-file" role="group" aria-label={file.name}>
      <div className="downloads-row-heading">
        <h3>{file.name}</h3>
        <span>{t(`downloads.${file.status}`)}</span>
      </div>
      <progress
        aria-label={t("downloads.fileProgress", { name: file.name })}
        value={file.progress}
        max={100}
      />
      <div className="downloads-transfer">
        <span>
          {Math.floor(file.progress)} % · {formatDownloadBytes(file.bytes)} /{" "}
          {formatDownloadBytes(file.total)}
        </span>
        {file.status === "downloading" && (
          <span>{formatDownloadBytes(file.speed)}/s</span>
        )}
      </div>
      {file.restarted && <p className="downloads-hint">{t("downloads.restarted")}</p>}
      {file.error && (
        <p className="downloads-error">
          {t(`downloads.failure.${file.error}`, {
            defaultValue: t("downloads.failure"),
          })}
        </p>
      )}
      <div className="downloads-actions">
        {active && (
          <Button size="small" disabled={busy} onClick={() => control("pause")}>
            <Pause />
            {t("downloads.pauseFile")}
          </Button>
        )}
        {["paused", "error", "cancelled", "interrupted"].includes(file.status) && (
          <Button size="small" disabled={blocked} onClick={() => control("resume")}>
            <Play />
            {t("downloads.resumeFile")}
          </Button>
        )}
        {!["completed", "cancelled"].includes(file.status) && (
          <Button size="small" disabled={busy} onClick={() => control("cancel")}>
            <X />
            {t("downloads.cancelFile")}
          </Button>
        )}
      </div>
    </div>
  );
}

function DownloadConfiguration({
  snapshot,
  run,
  busy,
}: {
  snapshot: DownloadsSnapshot;
  run: Run;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const expiration = snapshot.account
    ? new Date(snapshot.account.expiration).toLocaleDateString(i18n.language)
    : "";
  return (
    <div className="downloads-config">
      <section>
        <h2>Real-Debrid</h2>
        <p>{t("downloads.tokenHelp")}</p>
        {snapshot.hasToken ? (
          <>
            <p className="downloads-notice">
              {snapshot.account &&
                t("downloads.connected", {
                  username: snapshot.account.username,
                  expiration,
                })}
            </p>
            {!snapshot.persistentToken && (
              <p className="downloads-hint">{t("downloads.sessionToken")}</p>
            )}
            <Button
              disabled={busy}
              onClick={() => void run(() => window.launcher.disconnectRealDebrid())}
            >
              {t("downloads.disconnect")}
            </Button>
          </>
        ) : (
          <form
            className="downloads-inline-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const token = String(new FormData(form).get("token")).trim();
              form.reset();
              await run(
                () => window.launcher.connectRealDebrid(token),
                t("downloads.saved"),
              );
            }}
          >
            <label>
              {t("downloads.token")}
              <input
                name="token"
                type="password"
                autoComplete="off"
                required
                maxLength={4096}
                spellCheck={false}
              />
            </label>
            <Button type="submit" disabled={busy} variant="primary">
              {busy ? t("downloads.busy") : t("downloads.connect")}
            </Button>
          </form>
        )}
      </section>
      <section>
        <h2>{t("downloads.folder")}</h2>
        <p className="downloads-folder">
          {snapshot.directory ?? t("downloads.noFolder")}
        </p>
        <Button
          disabled={busy}
          onClick={() => void run(() => window.launcher.chooseDownloadDirectory())}
        >
          <FolderOpen />
          {t("downloads.chooseFolder")}
        </Button>
      </section>
      <section>
        <h2>{t("downloads.pauseResume")}</h2>
        <p>{t("downloads.pauseHelp")}</p>
      </section>
      <section>
        <h2>{t("downloads.torrent")}</h2>
        <p>{t("downloads.torrentHelp")}</p>
      </section>
    </div>
  );
}
