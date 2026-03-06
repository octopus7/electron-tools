import { AppGlyph, CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "../icons";

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
  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <div className="titlebar__glyph">
          <AppGlyph />
        </div>
        <div className="titlebar__copy">
          <span className="titlebar__eyebrow">Electron Tools</span>
          <span className="titlebar__title">{activeDocumentLabel}</span>
        </div>
      </div>

      <div className="titlebar__window-actions">
        <button
          type="button"
          className="caption-button"
          aria-label="최소화"
          onClick={onMinimize}
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className="caption-button"
          aria-label={isWindowMaximized ? "복원" : "최대화"}
          onClick={onToggleMaximize}
        >
          {isWindowMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          className="caption-button caption-button--close"
          aria-label="닫기"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
