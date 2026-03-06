import { CloseIcon } from "../icons";
import { useI18n } from "../i18n";
import type { PerformanceStageKey, StrokeFramePerformanceSample } from "../types";

type PerformancePanelProps = {
  sample: StrokeFramePerformanceSample | null;
  onClose: () => void;
};

export function PerformancePanel({ sample, onClose }: PerformancePanelProps) {
  const { t } = useI18n();

  return (
    <aside className="performance-panel" role="dialog" aria-labelledby="performance-panel-title">
      <header className="performance-panel__header">
        <div>
          <h2 id="performance-panel-title" className="performance-panel__title">
            {t("performance.title")}
          </h2>
        </div>
        <button
          type="button"
          className="performance-panel__close"
          aria-label={t("performance.close")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      {sample ? (
        <div className="performance-panel__body">
          <div className="performance-panel__summary">
            <div className="performance-panel__metric">
              <span>{t("performance.document")}</span>
              <strong>{sample.documentTitle}</strong>
            </div>
            <div className="performance-panel__metric">
              <span>{t("performance.phase")}</span>
              <strong>{t(`performance.phase.${sample.phase}`)}</strong>
            </div>
            <div className="performance-panel__metric">
              <span>{t("performance.frameTime")}</span>
              <strong>{sample.frameTimeMs.toFixed(2)} ms</strong>
            </div>
            <div className="performance-panel__metric">
              <span>{t("performance.fps")}</span>
              <strong>{sample.fps.toFixed(1)}</strong>
            </div>
            <div className="performance-panel__metric">
              <span>{t("performance.engineTotal")}</span>
              <strong>{sample.engineTotalMs.toFixed(2)} ms</strong>
            </div>
            <div className="performance-panel__metric">
              <span>{t("performance.dirtyTiles")}</span>
              <strong>{sample.dirtyTileCount}</strong>
            </div>
          </div>

          <div className="performance-panel__stages">
            {sample.stageTimings.map((stage) => (
              <div key={stage.key} className="performance-panel__stage">
                <span>{t(stageLabelKey(stage.key))}</span>
                <strong>{stage.durationMs.toFixed(2)} ms</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="performance-panel__empty">{t("performance.empty")}</div>
      )}
    </aside>
  );
}

function stageLabelKey(stageKey: PerformanceStageKey): string {
  switch (stageKey) {
    case "strokeInput":
      return "performance.stage.strokeInput";
    case "strokeCommit":
      return "performance.stage.strokeCommit";
    case "displayTiles":
      return "performance.stage.displayTiles";
    case "rendererApply":
      return "performance.stage.rendererApply";
    default:
      return stageKey;
  }
}
