import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

export function DownloadIndicator() {
  const { t } = useTranslation();
  const status = useQuery({
    queryKey: ["downloads", "status"],
    queryFn: window.launcher.getDownloads,
    refetchInterval: 2000,
    refetchOnWindowFocus: false,
  });
  const stores = useQuery({
    queryKey: ["providers", "status"],
    queryFn: window.launcher.getProviderStates,
    refetchInterval: 2000,
    refetchOnWindowFocus: false,
  });
  const storeTransfers =
    stores.data?.filter(
      (state) =>
        state.operation && ["install", "update"].includes(state.operation.action),
    ).length ?? 0;
  const active =
    status.data?.jobs.filter((job) =>
      ["queued", "preparing", "downloading"].includes(job.status),
    ) ?? [];

  if (!active.length && !storeTransfers) {
    return null;
  }

  const total = active.reduce((sum, job) => sum + job.total, 0);
  const bytes = active.reduce((sum, job) => sum + job.bytes, 0);
  const percentage = total ? Math.floor((bytes / total) * 100) : 0;
  return (
    <span
      className="sidebar-download-indicator"
      title={t("downloads.sidebarActivity", {
        count: active.length + storeTransfers,
        progress: percentage,
      })}
      aria-hidden="true"
    >
      <span>{active.length + storeTransfers}</span>
      <i style={{ "--download-progress": `${percentage}%` } as React.CSSProperties} />
    </span>
  );
}
