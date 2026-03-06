import { BrushIcon, EraserIcon, PencilIcon, ZoomIcon } from "../icons";
import { useI18n, type TranslationKey } from "../i18n";
import { isToolOptionEnabled } from "../state";
import type { ToolId, ToolOptions } from "../types";

type ToolbarProps = {
  activeTool: ToolId;
  toolOptions: ToolOptions;
  onSelectTool: (tool: ToolId) => void;
  onChangeOption: (key: keyof ToolOptions, value: number) => void;
};

const toolDefinitions = [
  { id: "zoom" as const, labelKey: "toolbar.tool.zoom" as TranslationKey, icon: ZoomIcon },
  { id: "pencil" as const, labelKey: "toolbar.tool.pencil" as TranslationKey, icon: PencilIcon },
  { id: "brush" as const, labelKey: "toolbar.tool.brush" as TranslationKey, icon: BrushIcon },
  { id: "eraser" as const, labelKey: "toolbar.tool.eraser" as TranslationKey, icon: EraserIcon }
];

const optionDefinitions: Array<{
  key: keyof ToolOptions;
  labelKey: TranslationKey;
  min: number;
  max: number;
}> = [
  { key: "size", labelKey: "toolbar.option.size", min: 1, max: 200 },
  { key: "opacity", labelKey: "toolbar.option.opacity", min: 1, max: 100 },
  { key: "flow", labelKey: "toolbar.option.flow", min: 1, max: 100 },
  { key: "dabSpacing", labelKey: "toolbar.option.dabSpacing", min: 1, max: 100 }
];

export function Toolbar({
  activeTool,
  toolOptions,
  onSelectTool,
  onChangeOption
}: ToolbarProps) {
  const { t } = useI18n();

  return (
    <div className="toolbar">
      <div className="toolbar__tools">
        {toolDefinitions.map((tool) => {
          const Icon = tool.icon;

          return (
            <button
              key={tool.id}
              type="button"
              className={`tool-button ${activeTool === tool.id ? "is-active" : ""}`}
              onClick={() => onSelectTool(tool.id)}
            >
              <Icon />
              <span>{t(tool.labelKey)}</span>
            </button>
          );
        })}
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__options">
        {optionDefinitions.map((option) => {
          const enabled = isToolOptionEnabled(activeTool, option.key);

          return (
            <label key={option.key} className={`tool-option ${enabled ? "" : "is-disabled"}`}>
              <div className="tool-option__meta">
                <span>{t(option.labelKey)}</span>
                <strong>
                  {toolOptions[option.key]}
                  {option.key === "opacity" || option.key === "flow" ? "%" : ""}
                </strong>
              </div>
              <input
                type="range"
                min={option.min}
                max={option.max}
                value={toolOptions[option.key]}
                disabled={!enabled}
                onChange={(event) => {
                  onChangeOption(option.key, Number(event.target.value));
                }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
