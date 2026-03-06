import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, CloseIcon } from "../icons";
import { LANGUAGE_OPTIONS, useI18n, type AppLocale } from "../i18n";
import { THEME_OPTIONS, type AppTheme } from "../theme";

type SettingsDialogProps = {
  open: boolean;
  locale: AppLocale;
  theme: AppTheme;
  onLocaleChange: (locale: AppLocale) => void;
  onThemeChange: (theme: AppTheme) => void;
  onClose: () => void;
};

type SettingsSelectId = "language" | "theme" | null;

type SettingsOption<TValue extends string> = {
  value: TValue;
  label: string;
};

type SettingsMenuPosition = {
  top: number;
  left: number;
  width: number;
};

export function SettingsDialog({
  open,
  locale,
  theme,
  onLocaleChange,
  onThemeChange,
  onClose
}: SettingsDialogProps) {
  const { t } = useI18n();
  const [openSelect, setOpenSelect] = useState<SettingsSelectId>(null);
  const [draftLocale, setDraftLocale] = useState<AppLocale>(locale);
  const [draftTheme, setDraftTheme] = useState<AppTheme>(theme);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftLocale(locale);
    setDraftTheme(theme);
  }, [locale, open, theme]);

  useEffect(() => {
    if (!open) {
      setOpenSelect(null);
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (openSelect) {
          setOpenSelect(null);
          return;
        }

        onClose();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        (event.target as HTMLElement | null)?.closest("[data-settings-select]") ||
        (event.target as HTMLElement | null)?.closest("[data-settings-select-menu]")
      ) {
        return;
      }

      setOpenSelect(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onClose, open, openSelect]);

  if (!open) {
    return null;
  }

  const canConfirm = draftLocale !== locale || draftTheme !== theme;

  return (
    <div
      className="settings-dialog-backdrop"
      onPointerDown={(event) => {
        if (
          dialogRef.current?.contains(event.target as Node) ||
          (event.target as HTMLElement | null)?.closest("[data-settings-select-menu]")
        ) {
          return;
        }

        onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <header className="settings-dialog__header">
          <div>
            <h2 id="settings-dialog-title" className="settings-dialog__title">
              {t("settings.title")}
            </h2>
          </div>
          <button
            type="button"
            className="settings-dialog__close"
            aria-label={t("settings.close")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="settings-dialog__body">
          <SettingsSelect
            label={t("settings.language")}
            value={getLanguageLabel(draftLocale, t)}
            open={openSelect === "language"}
            options={LANGUAGE_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey)
            }))}
            selectedValue={draftLocale}
            onToggle={() => {
              setOpenSelect((current) => (current === "language" ? null : "language"));
            }}
            onSelect={(nextLocale) => {
              setDraftLocale(nextLocale as AppLocale);
              setOpenSelect(null);
            }}
          />

          <SettingsSelect
            label={t("settings.theme")}
            value={getThemeLabel(draftTheme, t)}
            open={openSelect === "theme"}
            options={THEME_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey)
            }))}
            selectedValue={draftTheme}
            onToggle={() => {
              setOpenSelect((current) => (current === "theme" ? null : "theme"));
            }}
            onSelect={(nextTheme) => {
              setDraftTheme(nextTheme as AppTheme);
              setOpenSelect(null);
            }}
          />
        </div>

        <footer className="settings-dialog__footer">
          <button
            type="button"
            className="settings-dialog__button settings-dialog__button--ghost"
            onClick={onClose}
          >
            {t("settings.cancel")}
          </button>
          <button
            type="button"
            className="settings-dialog__button settings-dialog__button--primary"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) {
                onClose();
                return;
              }

              onLocaleChange(draftLocale);
              onThemeChange(draftTheme);
              onClose();
            }}
          >
            {t("settings.confirm")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SettingsSelect<TValue extends string>({
  label,
  value,
  open,
  options,
  selectedValue,
  onToggle,
  onSelect
}: {
  label: string;
  value: string;
  open: boolean;
  options: Array<SettingsOption<TValue>>;
  selectedValue: TValue;
  onToggle: () => void;
  onSelect: (value: TValue) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<SettingsMenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    function updateMenuPosition() {
      const bounds = triggerRef.current?.getBoundingClientRect();

      if (!bounds) {
        setMenuPosition(null);
        return;
      }

      setMenuPosition({
        top: bounds.bottom + 8,
        left: bounds.left,
        width: bounds.width
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  return (
    <div className="settings-dialog__field" data-settings-select="">
      <span className="settings-dialog__label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className={`settings-select ${open ? "is-open" : ""}`}
        onClick={onToggle}
      >
        <span>{value}</span>
        <ChevronDownIcon />
      </button>

      {open && menuPosition
        ? createPortal(
            <div
              className="settings-select__menu"
              data-settings-select-menu=""
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`settings-select__option ${
                    option.value === selectedValue ? "is-selected" : ""
                  }`}
                  onClick={() => {
                    onSelect(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function getLanguageLabel(
  locale: AppLocale,
  t: (key: string) => string
) {
  const option = LANGUAGE_OPTIONS.find((entry) => entry.value === locale);

  return option ? t(option.labelKey) : locale;
}

function getThemeLabel(
  theme: AppTheme,
  t: (key: string) => string
) {
  const option = THEME_OPTIONS.find((entry) => entry.value === theme);

  return option ? t(option.labelKey) : theme;
}
