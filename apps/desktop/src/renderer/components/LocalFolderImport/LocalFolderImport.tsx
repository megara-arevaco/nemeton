import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { LibrarySnapshot } from "@launcher/core";
import type {
  LocalFolderScan,
  LocalFolderImportResult,
  LocalFolderSelection,
} from "../../../shared/local-folder";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Modal } from "../Modal";
import { Button } from "../Button";

export function LocalFolderImport({
  onClose,
  onBack,
  onImported,
}: {
  onClose: () => void;
  onBack: () => void;
  onImported: (snapshot: LibrarySnapshot) => void;
}) {
  const { t } = useTranslation();
  const [scan, setScan] = useState<LocalFolderScan | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LocalFolderSelection>>({});
  const [validated, setValidated] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LocalFolderImportResult | null>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (confirming || result) {
      summary.current?.focus();
    }
  }, [confirming, result]);
  const selections = [...validated].map((id) => drafts[id]!).filter(Boolean);
  const valid = selections.length > 0 && selections.every((item) => item.title.trim());
  const step = result ? 3 : confirming ? 2 : scan ? 1 : 0;
  const finish = () => {
    if (result) {
      onImported(result.snapshot);
    }
    onClose();
  };
  const chooseFolder = async () => {
    setBusy(true);
    setError("");
    try {
      const next = await window.launcher.scanLocalFolder();

      if (next) {
        setScan(next);
        setValidated(new Set());
        setDrafts(
          Object.fromEntries(
            next.candidates.map((candidate) => [
              candidate.id,
              {
                candidateId: candidate.id,
                title: candidate.title,
                executablePath: candidate.executables[0]!,
              },
            ]),
          ),
        );
        setConfirming(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("folderScan.scanError"));
    } finally {
      setBusy(false);
    }
  };
  const importGames = async () => {
    if (!scan || !valid) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResult(await window.launcher.importLocalFolder(scan.scanId, selections));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("folderScan.importError"));
    } finally {
      setBusy(false);
    }
  };
  const update = (id: string, field: "title" | "executablePath", value: string) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id]!, [field]: value } }));
    setValidated((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };
  return (
    <Modal
      title={t(result ? "folderScan.doneTitle" : "folderScan.title")}
      subtitle={t("folderScan.subtitle")}
      icon={<FolderOpen />}
      size="wide"
      busy={busy}
      onClose={finish}
      actions={
        result ? (
          <Button variant="primary" onClick={finish}>
            {t("folderScan.viewLibrary")}
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (confirming) {
                  setConfirming(false);
                  setError("");
                } else {
                  onBack();
                }
              }}
            >
              <ArrowLeft />
              {t(confirming ? "folderScan.backToReview" : "folderScan.back")}
            </Button>
            <Button disabled={busy} onClick={onClose} variant="secondary">
              {t("modal.cancel")}
            </Button>
            {scan && (
              <Button
                variant="primary"
                loading={busy}
                disabled={busy || !valid}
                onClick={confirming ? importGames : () => setConfirming(true)}
              >
                {t(
                  busy && confirming
                    ? "folderScan.importing"
                    : confirming
                      ? "folderScan.confirmImport"
                      : "folderScan.reviewSelection",
                  { count: selections.length },
                )}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="folder-import">
        {!result && (
          <ol className="folder-import-steps">
            {[
              "folderScan.stepFolder",
              "folderScan.stepValidate",
              "folderScan.stepConfirm",
            ].map((key, index) => (
              <li key={key} aria-current={step === index ? "step" : undefined}>
                <span>{index + 1}</span>
                {t(key)}
              </li>
            ))}
          </ol>
        )}
        {result ? (
          <div className="folder-import-success">
            <CheckCircle weight="duotone" aria-hidden="true" />
            <h3 ref={summary} tabIndex={-1}>
              {t("folderScan.added", { count: result.addedCount })}
            </h3>
            {result.artworkMissingCount > 0 && (
              <p>
                {t("folderScan.artworkMissing", { count: result.artworkMissingCount })}
              </p>
            )}
            {result.skippedCount > 0 && (
              <p>{t("folderScan.skipped", { count: result.skippedCount })}</p>
            )}
          </div>
        ) : confirming ? (
          <>
            <h3 ref={summary} tabIndex={-1}>
              {t("folderScan.confirmTitle", { count: selections.length })}
            </h3>
            <p className="folder-import-description">{t("folderScan.confirmHelp")}</p>
            <ul className="folder-import-summary">
              {selections.map((item) => (
                <li key={item.candidateId}>
                  <CheckCircle aria-hidden="true" />
                  <div>
                    <strong>{item.title.trim()}</strong>
                    <span>{item.executablePath}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="folder-import-source">
              <div>
                <strong>{t("folderScan.source")}</strong>
                <p>{scan?.directory ?? t("folderScan.chooseHelp")}</p>
              </div>
              <Button
                variant="secondary"
                loading={busy}
                disabled={busy}
                onClick={chooseFolder}
              >
                <FolderOpen />
                {t(scan ? "folderScan.changeFolder" : "folderScan.chooseFolder")}
              </Button>
            </div>
            {busy && (
              <p role="status" className="folder-import-description">
                {t("folderScan.scanning")}
              </p>
            )}
            {scan && (
              <>
                <div className="folder-import-results-heading">
                  <h3>{t("folderScan.detected", { count: scan.candidates.length })}</h3>
                  <span aria-live="polite">
                    {t("folderScan.validated", { count: validated.size })}
                  </span>
                </div>
                <p className="folder-import-description">
                  {t("folderScan.validateHelp")}
                </p>
                {scan.truncated && (
                  <p role="status" className="folder-import-warning">
                    {t("folderScan.limited")}
                  </p>
                )}
                {scan.unreadableDirectories > 0 && (
                  <p role="status" className="folder-import-warning">
                    {t("folderScan.unreadable", { count: scan.unreadableDirectories })}
                  </p>
                )}
                {scan.candidates.length === 0 && (
                  <p className="folder-import-empty">{t("folderScan.empty")}</p>
                )}
                <div className="folder-import-candidates">
                  {scan.candidates.map((candidate) => (
                    <fieldset
                      key={candidate.id}
                      className="folder-import-candidate"
                      disabled={busy || candidate.alreadyAdded}
                      data-validated={validated.has(candidate.id)}
                    >
                      <legend>{candidate.title}</legend>
                      <div className="folder-import-candidate-heading">
                        <FolderOpen aria-hidden="true" />
                        <strong>{candidate.title}</strong>
                        {candidate.alreadyAdded ? (
                          <span className="folder-import-existing">
                            {t("folderScan.alreadyAdded")}
                          </span>
                        ) : (
                          <label className="folder-import-validation">
                            <input
                              type="checkbox"
                              checked={validated.has(candidate.id)}
                              aria-label={t("folderScan.validateGame", {
                                title: candidate.title,
                              })}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setValidated((current) => {
                                  const next = new Set(current);

                                  if (checked) {
                                    next.add(candidate.id);
                                  } else {
                                    next.delete(candidate.id);
                                  }
                                  return next;
                                });
                              }}
                              disabled={!drafts[candidate.id]?.title.trim() || busy}
                            />
                            {t(
                              validated.has(candidate.id)
                                ? "folderScan.validatedGame"
                                : "folderScan.validate",
                            )}
                          </label>
                        )}
                      </div>
                      <div className="folder-import-fields">
                        <label>
                          <span>{t("modal.gameName")}</span>
                          <input
                            value={drafts[candidate.id]?.title ?? ""}
                            maxLength={500}
                            onChange={(event) =>
                              update(candidate.id, "title", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>{t("modal.executable")}</span>
                          <select
                            aria-label={t("modal.executable")}
                            value={drafts[candidate.id]?.executablePath}
                            onChange={(event) =>
                              update(candidate.id, "executablePath", event.target.value)
                            }
                          >
                            {candidate.executables.map((filename) => (
                              <option key={filename} value={filename}>
                                {filename.slice(candidate.directory.length + 1)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="folder-import-path">
                        {drafts[candidate.id]?.executablePath}
                      </p>
                    </fieldset>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="folder-import-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
