import { createContext, useContext, type ReactNode } from "react";
import translationsCsv from "./i18n/translations.csv?raw";

export type AppLocale = "en" | "ko" | "ja";
export type TranslationKey = string;
export type TranslationVariables = Record<string, string | number>;

type TranslationRow = Record<AppLocale, string>;

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: TranslationKey, variables?: TranslationVariables) => string;
};

const STORAGE_KEY = "electron-tools.locale";
const SUPPORTED_LOCALES: AppLocale[] = ["en", "ko", "ja"];
const TRANSLATIONS = parseTranslations(translationsCsv);
const I18nContext = createContext<I18nContextValue | null>(null);

export const LANGUAGE_OPTIONS: Array<{
  value: AppLocale;
  labelKey: TranslationKey;
}> = [
  { value: "en", labelKey: "language.english" },
  { value: "ko", labelKey: "language.korean" },
  { value: "ja", labelKey: "language.japanese" }
];

export function I18nProvider({
  children,
  locale,
  onLocaleChange
}: {
  children: ReactNode;
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => void;
}) {
  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale: onLocaleChange,
        t: (key, variables) => translate(locale, key, variables)
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("I18nProvider is missing.");
  }

  return value;
}

export function normalizeLocale(localeLike: string | null | undefined): AppLocale {
  const normalized = localeLike?.toLowerCase() ?? "en";

  if (normalized.startsWith("ko")) {
    return "ko";
  }

  if (normalized.startsWith("ja")) {
    return "ja";
  }

  return "en";
}

export function readStoredLocale(): AppLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  return isSupportedLocale(stored) ? stored : null;
}

export function persistLocale(locale: AppLocale): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, locale);
}

export function getInitialLocale(): AppLocale {
  return readStoredLocale() ?? normalizeLocale(typeof navigator === "undefined" ? "en" : navigator.language);
}

export function translate(
  locale: AppLocale,
  key: TranslationKey,
  variables?: TranslationVariables
): string {
  const template = TRANSLATIONS[key]?.[locale] ?? TRANSLATIONS[key]?.en ?? key;

  if (!variables) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, variableName: string) => {
    const value = variables[variableName];

    return value === undefined ? `{${variableName}}` : String(value);
  });
}

function parseTranslations(csv: string): Record<string, TranslationRow> {
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .map((line) => parseCsvLine(line));

  const [header, ...body] = rows;
  const locales = header.slice(1) as AppLocale[];
  const translations: Record<string, TranslationRow> = {};

  for (const row of body) {
    const key = row[0];

    if (!key) {
      continue;
    }

    const nextRow = {} as TranslationRow;

    locales.forEach((locale, index) => {
      nextRow[locale] = row[index + 1] ?? "";
    });

    translations[key] = nextRow;
  }

  return translations;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);

  return values;
}

function isSupportedLocale(value: string | null): value is AppLocale {
  return value !== null && SUPPORTED_LOCALES.includes(value as AppLocale);
}
