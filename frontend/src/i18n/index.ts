import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zhTW from "./zh-TW.json";

const savedLang = localStorage.getItem("g-demand-lang") ?? "en";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "zh-TW": { translation: zhTW }
    },
    lng: savedLang,
    fallbackLng: "en",
    interpolation: { escapeValue: false }
  });

export default i18n;
