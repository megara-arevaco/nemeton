import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./locales/resources";

const languageStorageKey = "nemeton.language";
const storedLanguage = localStorage.getItem(languageStorageKey);
const initialLanguage = storedLanguage === "en" ? "en" : "es";

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "es",
  supportedLngs: ["es", "en"],
  keySeparator: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

document.documentElement.lang = initialLanguage;
i18n.on("languageChanged", (language) => {
  const normalizedLanguage = language.startsWith("en") ? "en" : "es";
  localStorage.setItem(languageStorageKey, normalizedLanguage);
  document.documentElement.lang = normalizedLanguage;
});

export default i18n;
