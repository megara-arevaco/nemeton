import { useTranslation } from "react-i18next";
import { FilterSelect } from "../FilterSelect/FilterSelect";
import { Storefront } from "@phosphor-icons/react/Storefront";

export function LibraryFilters({
  store,
  onStore,
}: {
  store: string;
  onStore: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="library-filterbar">
      <FilterSelect
        label={t("library.storeFilter")}
        icon={<Storefront />}
        value={store}
        onChange={onStore}
        options={[
          { value: "all", label: t("library.allStores") },
          ...["steam", "epic", "gog", "local"].map((provider) => ({
            value: provider,
            label: t(`stores.${provider}`),
          })),
        ]}
      />
    </div>
  );
}
