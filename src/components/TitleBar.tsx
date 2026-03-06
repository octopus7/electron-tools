import { AppGlyph, CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "../icons";
import { useI18n } from "../i18n";

type TitleBarProps = {
  activeDocumentLabel: string;
  isWindowMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

export function TitleBar({
  activeDocumentLabel,
  isWindowMaximized,
  onMinimize,
  onToggleMaximize,
  onClose
}: TitleBarProps) {
  const { t } = useI18n();

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <div className="titlebar__glyph">
          <AppGlyph />
        </div>
        <div className="titlebar__copy">
          <span className="titlebar__name">{t("app.name")}</span>
          <span className="titlebar__divider" aria-hidden="true">
            /
          </span>
          <span className="titlebar__title">{activeDocumentLabel}</span>
        </div>
      </div>

      <div className="titlebar__window-actions">
        <button
          type="button"
          className="caption-button"
          aria-label={t("titlebar.minimize")}
          onClick={onMinimize}
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className="caption-button"
          aria-label={isWindowMaximized ? t("titlebar.restore") : t("titlebar.maximize")}
          onClick={onToggleMaximize}
        >
          {isWindowMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          className="caption-button caption-button--close"
          aria-label={t("titlebar.close")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
