import { ProviderTransfers } from "./ProviderTransfers";
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
  type DownloadAction,
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
  const [filter, setFilter] = useState<"all" | "activity" | "history">("all");
  const [adding, setAdding] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const providers = useQuery({
    queryKey: ["providers", "status"],
    queryFn: window.launcher.getProviderStates,
    refetchInterval: 2000,
  });
  const externalTransfers =
    providers.data?.filter(
      (state) =>
        state.operation && ["install", "update"].includes(state.operation.action),
    ).length ?? 0;
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

  const history = snapshot.jobs.filter((job) =>
    ["completed", "cancelled"].includes(job.status),
  );
  const activity = snapshot.jobs.filter(
    (job) => !["completed", "cancelled"].includes(job.status),
  );
  const speed = activity.reduce(
    (sum, job) => sum + (job.status === "downloading" ? job.speed : 0),
    0,
  );
  const composerOpen = adding ?? snapshot.jobs.length === 0;
  const groups =
    filter === "activity"
      ? [["activity", activity] as const]
      : filter === "history"
        ? [["history", history] as const]
        : [["activity", activity] as const, ["history", history] as const];
  return (
    <div className="downloads-view">
      <header className="downloads-heading">
        <div>
          <h1>{t("downloads.title")}</h1>
          <p>{t("downloads.description")}</p>
        </div>
        <Button
          variant="primary"
          aria-expanded={tab === "queue" && composerOpen}
          aria-controls="download-composer"
          onClick={() => {
            setTab("queue");
            setAdding(!composerOpen);
          }}
        >
          <DownloadSimple aria-hidden="true" />
          {t("downloads.addDownload")}
        </Button>
      </header>
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
      {tab === "configuration" && (
        <DownloadConfiguration snapshot={snapshot} run={run} busy={busy} />
      )}
      <div hidden={tab !== "queue"}>
        <div className="downloads-overview" aria-label={t("downloads.overview")}>
          <div>
            <span>{t("downloads.activity")}</span>
            <strong>{activity.length + externalTransfers}</strong>
          </div>
          <div>
            <span>{t("downloads.speed")}</span>
            <strong>
              {formatDownloadBytes(speed)}
              <small>/s</small>
            </strong>
          </div>
          <div>
            <span>{t("downloads.completedCount")}</span>
            <strong>
              {history.filter((job) => job.status === "completed").length}
            </strong>
          </div>
        </div>
        {!snapshot.directory && (
          <div className="downloads-setup">
            <p>{t("downloads.noFolder")}</p>
            <Button size="small" onClick={() => setTab("configuration")}>
              {t("downloads.chooseFolder")}
            </Button>
          </div>
        )}
        <AddDownload
          snapshot={snapshot}
          run={run}
          busy={busy}
          expanded={composerOpen}
          setExpanded={setAdding}
          configure={() => setTab("configuration")}
        />
        <div className="downloads-queue-heading">
          <div className="downloads-filters" aria-label={t("downloads.filter")}>
            {(["all", "activity", "history"] as const).map((item) => (
              <Button
                key={item}
                size="small"
                variant={filter === item ? "setup" : "ghost"}
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
              >
                {t(`downloads.${item}`)}{" "}
                <span>
                  {item === "all"
                    ? snapshot.jobs.length + externalTransfers
                    : item === "activity"
                      ? activity.length + externalTransfers
                      : history.length}
                </span>
              </Button>
            ))}
          </div>
          <div className="downloads-queue-tools">
            <Button
              size="small"
              variant="secondary"
              title={t("downloads.bulkScope")}
              disabled={
                busy ||
                !snapshot.jobs.some((job) => activeStatuses.includes(job.status))
              }
              onClick={() =>
                void run(() => window.launcher.controlAllDownloads("pause"))
              }
            >
              {t("downloads.pauseAll")}
            </Button>
            <Button
              size="small"
              variant="secondary"
              title={t("downloads.resumeAllHelp")}
              disabled={busy || !snapshot.bulkPausedIds?.length}
              onClick={() =>
                void run(() => window.launcher.controlAllDownloads("resume"))
              }
            >
              {t("downloads.resumeAll")}
            </Button>
            <span>{t("downloads.parallel", { count: snapshot.maxConcurrent })}</span>
            {filter !== "activity" &&
              history.some((job) => job.status === "completed") && (
                <Button
                  size="small"
                  variant="ghost"
                  loading={busy}
                  title={t("downloads.removeHelp")}
                  onClick={() =>
                    void run(async () => {
                      for (const job of history.filter(
                        (item) => item.status === "completed",
                      )) {
                        await window.launcher.controlDownload(job.id, "remove");
                      }
                    }, t("downloads.historyCleared"))
                  }
                >
                  {t("downloads.clearCompleted")}
                </Button>
              )}
          </div>
        </div>
        {!snapshot.jobs.length && !externalTransfers && (
          <div className="downloads-empty">
            <DownloadSimple size={32} aria-hidden="true" />
            <h2>{t("downloads.emptyQueue")}</h2>
            <p>{t("downloads.emptyQueueHelp")}</p>
          </div>
        )}
        <ProviderTransfers hidden={filter === "history"} />
        {groups.map(([name, jobs]) => (
          <section
            className="downloads-group"
            key={name}
            aria-label={t(`downloads.${name}`)}
          >
            {jobs.length > 0 && (
              <h2 className="downloads-group-title">
                {t(`downloads.${name}`)} <span>{jobs.length}</span>
              </h2>
            )}
            {jobs.map((job) => (
              <DownloadTask key={job.id} job={job} hasToken={snapshot.hasToken} />
            ))}
            {!jobs.length &&
              filter !== "all" &&
              snapshot.jobs.length > 0 &&
              !(name === "activity" && externalTransfers > 0) && (
                <p className="downloads-empty-filter">{t("downloads.noMatches")}</p>
              )}
          </section>
        ))}
      </div>
    </div>
  );
}

function AddDownload({
  snapshot,
  run,
  busy,
  configure,
  expanded,
  setExpanded,
}: {
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  configure: () => void;
  snapshot: DownloadsSnapshot;
  run: Run;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [torrent, setTorrent] = useState<{ id: string; name: string } | null>(null);
  const [links, setLinks] = useState("");
  const [method, setMethod] = useState<DownloadMethod>(() =>
    localStorage.getItem("nemeton.downloadMethod") === "torrent"
      ? "torrent"
      : "real-debrid",
  );
  const [invalid, setInvalid] = useState(false);
  const selectedMethod = method;
  const unsupportedLinks =
    method === "torrent" &&
    !torrent &&
    links.split(/\r?\n/).some((link) => link.trim().startsWith("https:"));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    const uris = links
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (unsupportedLinks) {
      setInvalid(true);
      return;
    }
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
      hidden={!expanded}
      id="download-composer"
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
        {(invalid || unsupportedLinks) && (
          <p className="downloads-error" role="alert">
            {t(
              unsupportedLinks
                ? "downloads.torrentLinksOnly"
                : "downloads.invalidLinks",
            )}
          </p>
        )}
        <div className="downloads-source-actions">
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
        <details className="downloads-add-fields">
          <summary>{t("downloads.customName")}</summary>
          <label>
            {t("downloads.name")}
            <input name="title" maxLength={500} placeholder={t("downloads.optional")} />
          </label>
        </details>
        <fieldset className="downloads-methods">
          <legend>{t("downloads.method")}</legend>
          {(["real-debrid", "torrent"] as const).map((option) => (
            <label key={option} className="downloads-method">
              <input
                type="radio"
                name="method"
                value={option}
                checked={method === option}
                onChange={() => {
                  setMethod(option);
                  localStorage.setItem("nemeton.downloadMethod", option);
                  setInvalid(false);
                }}
              />
              <span>
                <strong>
                  {option === "real-debrid" ? "Real-Debrid" : t("downloads.torrent")}
                </strong>
                <small>
                  {t(
                    option === "real-debrid"
                      ? "downloads.realDebridHelp"
                      : "downloads.directTorrentHelp",
                  )}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="downloads-actions">
          {method === "real-debrid" && !snapshot.hasToken && (
            <Button onClick={configure}>{t("downloads.connectRealDebrid")}</Button>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy ||
              unsupportedLinks ||
              !snapshot.directory ||
              (method === "real-debrid" && !snapshot.hasToken) ||
              (!torrent && !links.trim())
            }
          >
            <DownloadSimple />
            {t("downloads.addQueue")}
          </Button>
        </div>
        {method === "real-debrid" && !snapshot.hasToken && (
          <p className="downloads-job-meta">{t("downloads.connectHint")}</p>
        )}
      </form>
    </details>
  );
}

function DownloadTask({ job, hasToken }: { job: DownloadJob; hasToken: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const run = async (action: () => Promise<unknown>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await action();
      await client.invalidateQueries({ queryKey: statusKey });
    } catch (failure) {
      const code =
        failure instanceof Error
          ? failure.message.match(/([a-z][a-z0-9-]+)$/)?.[1]
          : undefined;
      setActionError(
        t(`downloads.failure.${code}`, { defaultValue: t("downloads.failure") }),
      );
    } finally {
      setBusy(false);
    }
  };
  const blocked = busy || (job.method === "real-debrid" && !hasToken);
  const active = activeStatuses.includes(job.status);
  const control = (action: DownloadAction) =>
    void run(() => window.launcher.controlDownload(job.id, action));
  return (
    <article
      className={`downloads-job is-${job.status}`}
      aria-label={job.title}
      aria-busy={busy}
    >
      <div className="downloads-row-heading">
        <h3>{job.title}</h3>
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
      <progress
        aria-label={t("downloads.fileProgress", { name: job.title })}
        value={
          job.status === "preparing" && job.torrentId ? job.cloudProgress : job.progress
        }
        max={100}
      />
      <div className="downloads-transfer">
        <span>
          {job.status === "preparing" && job.torrentId
            ? t("downloads.cloudProgress", { progress: Math.round(job.cloudProgress) })
            : `${Math.floor(job.progress)} %`}
        </span>
        {job.status === "downloading" && job.speed > 0 && job.total > job.bytes && (
          <span>
            {t("downloads.remaining", {
              minutes: Math.max(1, Math.ceil((job.total - job.bytes) / job.speed / 60)),
            })}
          </span>
        )}
      </div>
      {actionError && (
        <p className="downloads-error" role="alert">
          {actionError}
        </p>
      )}
      {!hasToken &&
        job.method === "real-debrid" &&
        ["paused", "error", "interrupted", "cancelled"].includes(job.status) && (
          <p className="downloads-hint">{t("downloads.connectHint")}</p>
        )}
      {(job.error || job.files.some((file) => file.selected && file.error)) && (
        <p className="downloads-error" role="alert">
          {t(
            `downloads.failure.${job.error || job.files.find((file) => file.selected && file.error)?.error}`,
            {
              defaultValue: t("downloads.failure"),
            },
          )}
        </p>
      )}
      <div className="downloads-actions">
        {job.status === "completed" && (
          <Button
            size="small"
            variant="setup"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const selected = await window.launcher.chooseDownloadedExecutable(
                  job.id,
                );

                if (selected) {
                  window.dispatchEvent(
                    new CustomEvent("nemeton:add-downloaded-game", {
                      detail: selected,
                    }),
                  );
                }
              })
            }
          >
            {t("downloads.addToLibrary")}
          </Button>
        )}
        {job.status === "queued" && (
          <label className="download-priority">
            {t("downloads.priority")}
            <select
              value={job.priority ?? 0}
              disabled={busy}
              onChange={(event) =>
                void run(() =>
                  window.launcher.setDownloadPriority(
                    job.id,
                    Number(event.target.value),
                  ),
                )
              }
            >
              <option value={1}>{t("downloads.priorityHigh")}</option>
              <option value={0}>{t("downloads.priorityNormal")}</option>
              <option value={-1}>{t("downloads.priorityLow")}</option>
            </select>
          </label>
        )}
        {active && (
          <Button size="small" disabled={busy} onClick={() => control("pause")}>
            <Pause />
            {t("downloads.pause")}
          </Button>
        )}
        {["paused", "interrupted", "error", "cancelled"].includes(job.status) && (
          <Button
            size="small"
            variant="setup"
            disabled={blocked}
            onClick={() => control("resume")}
          >
            <Play />
            {t("downloads.resume")}
          </Button>
        )}
        {!["completed", "cancelled"].includes(job.status) && (
          <Button
            size="small"
            variant="ghost"
            disabled={busy}
            onClick={() => control("cancel")}
          >
            <X />
            {t("downloads.cancel")}
          </Button>
        )}
        {!active && job.status !== "waiting-selection" && (
          <Button
            size="small"
            disabled={busy}
            variant="ghost"
            title={t("downloads.removeHelp")}
            onClick={() => control("remove")}
          >
            {t("downloads.remove")}
          </Button>
        )}
        <Button
          size="small"
          className="downloads-open"
          variant={job.status === "completed" ? "secondary" : "ghost"}
          disabled={busy || !job.directory || job.status === "queued"}
          onClick={() => void run(() => window.launcher.openDownload(job.id))}
        >
          <FolderOpen />
          {t("downloads.open")}
        </Button>
      </div>
    </article>
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
        <h2>{t("downloads.transferSettings")}</h2>
        <form
          key={`${snapshot.maxConcurrent}-${snapshot.downloadLimitBytesPerSecond ?? 0}`}
          className="downloads-limit-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run(
              () =>
                window.launcher.configureDownloads({
                  maxConcurrent: Number(data.get("concurrent")),
                  downloadLimitBytesPerSecond: Number(data.get("limit")) * 1024,
                }),
              t("downloads.saved"),
            );
          }}
        >
          <label>
            {t("downloads.concurrent")}
            <input
              type="number"
              name="concurrent"
              min={1}
              max={6}
              defaultValue={snapshot.maxConcurrent}
              required
            />
          </label>
          <label>
            {t("downloads.speedLimit")}
            <input
              type="number"
              name="limit"
              min={0}
              max={1048576}
              defaultValue={(snapshot.downloadLimitBytesPerSecond ?? 0) / 1024}
              required
            />
            <small>{t("downloads.unlimitedHelp")}</small>
          </label>
          <Button type="submit" loading={busy}>
            {t("downloads.saveSettings")}
          </Button>
        </form>
      </section>
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
      <details className="downloads-help">
        <summary>{t("downloads.pauseResume")}</summary>
        <p>{t("downloads.pauseHelp")}</p>
      </details>
      <details className="downloads-help">
        <summary>{t("downloads.torrent")}</summary>
        <p>{t("downloads.torrentHelp")}</p>
      </details>
    </div>
  );
}
