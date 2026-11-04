import { useQuery } from "@tanstack/react-query";
import { HardDrive } from "@phosphor-icons/react/HardDrive";
import { useTranslation } from "react-i18next";
import "./StorageIndicator.css";

export function StorageIndicator() {
  const { t, i18n } = useTranslation();
  const { data, isError } = useQuery({
    queryKey: ["storage", "disk-space"],
    queryFn: window.launcher.getDiskSpace,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const format = (bytes: number) => {
    const unit = bytes >= 1e12 ? "TB" : "GB";
    return `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(bytes / (unit === "TB" ? 1e12 : 1e9))} ${unit}`;
  };
  const used = data?.total
    ? Math.max(0, Math.min(100, ((data.total - data.free) / data.total) * 100))
    : 0;

  return (
    <footer className="sidebar-storage" title={data?.path}>
      {data && !isError ? (
        <>
          <div className="sidebar-storage-summary">
            <HardDrive aria-hidden="true" size={13} />
            <span>
              {t("sidebar.storageCompact", {
                free: format(data.free),
                total: format(data.total),
              })}
            </span>
          </div>
          <div className="sidebar-storage-track" aria-hidden="true">
            <span style={{ width: `${used}%` }} />
          </div>
        </>
      ) : (
        <span className="sidebar-storage-total">
          {isError ? t("sidebar.storageUnavailable") : "…"}
        </span>
      )}
    </footer>
  );
}
