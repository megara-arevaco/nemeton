import { useTranslation } from "react-i18next";
import type { LibraryGame } from "@launcher/core";

export function LibraryFilters({
  games,
  store,
  collection,
  installed,
  onStore,
  onCollection,
  onInstalled,
}: {
  games: LibraryGame[];
  store: string;
  collection: string;
  installed: boolean;
  onStore: (value: string) => void;
  onCollection: (value: string) => void;
  onInstalled: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const collections = [
    ...new Set(games.flatMap((game) => game.collections ?? [])),
  ].sort();
  return (
    <div className="library-filterbar">
      <label>
        {t("library.storeFilter")}
        <select
          aria-label={t("library.storeFilter")}
          value={store}
          onChange={(event) => onStore(event.target.value)}
        >
          <option value="all">{t("library.allStores")}</option>
          {["steam", "epic", "gog", "local"].map((provider) => (
            <option key={provider} value={provider}>
              {t(`stores.${provider}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("library.collectionFilter")}
        <select
          aria-label={t("library.collectionFilter")}
          value={collection}
          onChange={(event) => onCollection(event.target.value)}
        >
          <option value="">{t("library.allCollections")}</option>
          {collection && !collections.includes(collection) && (
            <option value={collection}>{collection}</option>
          )}
          {collections.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label className="library-check">
        <input
          type="checkbox"
          checked={installed}
          onChange={(event) => onInstalled(event.target.checked)}
        />
        {t("library.installedOnly")}
      </label>
    </div>
  );
}
