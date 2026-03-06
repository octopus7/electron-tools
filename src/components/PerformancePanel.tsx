import { CloseIcon } from "../icons";
import { useI18n } from "../i18n";
import type {
  PerformanceStageKey,
  StrokeFramePerformanceSample,
  TimingMetricKey
} from "../types";

const GRAPH_WIDTH_PX = 132;
const GRAPH_HEIGHT_PX = 30;

type PerformancePanelProps = {
  sample: StrokeFramePerformanceSample | null;
  history: StrokeFramePerformanceSample[];
  onClose: () => void;
};

export function PerformancePanel({ sample, history, onClose }: PerformancePanelProps) {
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
            <TimingMetricRow
              label={t("performance.frameTime")}
              value={`${sample.frameTimeMs.toFixed(2)} ms`}
              series={buildMetricSeries(history, "frameTimeMs")}
            />
            <div className="performance-panel__metric">
              <span>{t("performance.fps")}</span>
              <strong>{sample.fps.toFixed(1)}</strong>
            </div>
            <TimingMetricRow
              label={t("performance.engineTotal")}
              value={`${sample.engineTotalMs.toFixed(2)} ms`}
              series={buildMetricSeries(history, "engineTotalMs")}
            />
            <div className="performance-panel__metric">
              <span>{t("performance.dirtyTiles")}</span>
              <strong>{sample.dirtyTileCount}</strong>
            </div>
          </div>

          <div className="performance-panel__stages">
            {sample.stageTimings.map((stage) => (
              <TimingMetricRow
                key={stage.key}
                label={t(stageLabelKey(stage.key))}
                value={`${stage.durationMs.toFixed(2)} ms`}
                series={buildMetricSeries(history, toTimingMetricKey(stage.key))}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="performance-panel__empty">{t("performance.empty")}</div>
      )}
    </aside>
  );
}

function TimingMetricRow({
  label,
  value,
  series
}: {
  label: string;
  value: string;
  series: number[];
}) {
  return (
    <div className="performance-panel__timing">
      <div className="performance-panel__timing-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <PerformanceSparkline values={series} />
    </div>
  );
}

function PerformanceSparkline({ values }: { values: number[] }) {
  const normalized = normalizeValues(values);
  const columns = normalized.map((value, index) => ({
    x: index,
    height: Math.max(1, Math.round(value * GRAPH_HEIGHT_PX))
  }));

  return (
    <svg
      className="performance-panel__sparkline"
      viewBox={`0 0 ${GRAPH_WIDTH_PX} ${GRAPH_HEIGHT_PX}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="performance-panel__sparkline-baseline"
        d={`M0 ${GRAPH_HEIGHT_PX - 0.5} H${GRAPH_WIDTH_PX}`}
      />
      {columns.map((column) => (
        <path
          key={column.x}
          className="performance-panel__sparkline-bar"
          d={`M${column.x + 0.5} ${GRAPH_HEIGHT_PX} V${GRAPH_HEIGHT_PX - column.height}`}
        />
      ))}
    </svg>
  );
}

function normalizeValues(values: number[]): number[] {
  const padded =
    values.length >= GRAPH_WIDTH_PX
      ? values.slice(values.length - GRAPH_WIDTH_PX)
      : [...new Array(GRAPH_WIDTH_PX - values.length).fill(0), ...values];
  const max = Math.max(...padded, 0.0001);

  return padded.map((value) => value / max);
}

function buildMetricSeries(
  history: StrokeFramePerformanceSample[],
  metricKey: TimingMetricKey
): number[] {
  return history.map((sample) => metricValue(sample, metricKey));
}

function metricValue(sample: StrokeFramePerformanceSample, metricKey: TimingMetricKey): number {
  if (metricKey === "frameTimeMs") {
    return sample.frameTimeMs;
  }

  if (metricKey === "engineTotalMs") {
    return sample.engineTotalMs;
  }

  const stage = sample.stageTimings.find((entry) => entry.key === metricKey);

  return stage?.durationMs ?? 0;
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

function toTimingMetricKey(stageKey: PerformanceStageKey): TimingMetricKey {
  return stageKey;
}
