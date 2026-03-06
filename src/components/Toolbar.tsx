import { BrushIcon, EraserIcon, PencilIcon, ZoomIcon } from "../icons";
import { isToolOptionEnabled } from "../state";
import type { ToolId, ToolOptions } from "../types";

type ToolbarProps = {
  activeTool: ToolId;
  toolOptions: ToolOptions;
  onSelectTool: (tool: ToolId) => void;
  onChangeOption: (key: keyof ToolOptions, value: number) => void;
};

const toolDefinitions = [
  { id: "zoom" as const, label: "Zoom", icon: ZoomIcon },
  { id: "pencil" as const, label: "Pencil", icon: PencilIcon },
  { id: "brush" as const, label: "Brush", icon: BrushIcon },
  { id: "eraser" as const, label: "Eraser", icon: EraserIcon }
];

const optionDefinitions: Array<{
  key: keyof ToolOptions;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "size", label: "Size", min: 1, max: 24 },
  { key: "opacity", label: "Opacity", min: 1, max: 100 },
  { key: "flow", label: "Flow", min: 1, max: 100 },
  { key: "dabSpacing", label: "Dab Spacing", min: 1, max: 100 }
];

export function Toolbar({
  activeTool,
  toolOptions,
  onSelectTool,
  onChangeOption
}: ToolbarProps) {
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
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__options">
        {optionDefinitions.map((option) => {
          const enabled = isToolOptionEnabled(activeTool, option.key);

          return (
            <label
              key={option.key}
              className={`tool-option ${enabled ? "" : "is-disabled"}`}
            >
              <div className="tool-option__meta">
                <span>{option.label}</span>
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
