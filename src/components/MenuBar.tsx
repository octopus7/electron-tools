import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, InfoIcon } from "../icons";
import type { AppCommand } from "../types";

type MenuEntry =
  | {
      kind: "item";
      id: string;
      label: string;
      command: AppCommand;
      accelerator?: string;
    }
  | {
      kind: "separator";
      id: string;
    };

type MenuDefinition = {
  id: string;
  label: string;
  entries?: MenuEntry[];
  command?: AppCommand;
};

const menuDefinitions: MenuDefinition[] = [
  {
    id: "file",
    label: "파일",
    entries: [
      {
        kind: "item",
        id: "file-new",
        label: "새로 만들기",
        command: "file:new",
        accelerator: "Ctrl+N"
      },
      {
        kind: "separator",
        id: "file-separator-1"
      },
      {
        kind: "item",
        id: "file-open",
        label: "오픈",
        command: "file:open",
        accelerator: "Ctrl+O"
      },
      {
        kind: "item",
        id: "file-save",
        label: "저장",
        command: "file:save",
        accelerator: "Ctrl+S"
      },
      {
        kind: "item",
        id: "file-save-as",
        label: "다른 이름으로 저장",
        command: "file:saveAs"
      },
      {
        kind: "separator",
        id: "file-separator-2"
      },
      {
        kind: "item",
        id: "file-exit",
        label: "종료",
        command: "file:exit"
      }
    ]
  },
  {
    id: "edit",
    label: "편집",
    entries: [
      {
        kind: "item",
        id: "edit-copy",
        label: "복사하기",
        command: "edit:copy",
        accelerator: "Ctrl+C"
      },
      {
        kind: "item",
        id: "edit-paste",
        label: "붙여넣기",
        command: "edit:paste",
        accelerator: "Ctrl+V"
      }
    ]
  },
  {
    id: "about",
    label: "About",
    command: "help:about"
  }
];

type MenuBarProps = {
  onCommand: (command: AppCommand) => void;
};

export function MenuBar({ onCommand }: MenuBarProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setActiveMenuId(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!activeMenuId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveMenuId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeMenuId]);

  return (
    <div className="menu-bar" ref={menuRef}>
      {menuDefinitions.map((menu) => {
        const isOpen = menu.id === activeMenuId;
        const hasEntries = Boolean(menu.entries);

        return (
          <div
            key={menu.id}
            className="menu-bar__group"
            onMouseEnter={() => {
              if (activeMenuId && hasEntries) {
                setActiveMenuId(menu.id);
              }
            }}
          >
            <button
              type="button"
              className={`menu-bar__trigger ${isOpen ? "is-open" : ""}`}
              onClick={() => {
                if (menu.command) {
                  setActiveMenuId(null);
                  onCommand(menu.command);
                  return;
                }

                setActiveMenuId(isOpen ? null : menu.id);
              }}
            >
              <span>{menu.label}</span>
              {hasEntries ? <ChevronDownIcon /> : <InfoIcon />}
            </button>

            {isOpen && menu.entries ? (
              <div className="menu-popover">
                {menu.entries.map((entry) => {
                  if (entry.kind === "separator") {
                    return <div key={entry.id} className="menu-popover__separator" />;
                  }

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className="menu-popover__item"
                      onClick={() => {
                        setActiveMenuId(null);
                        onCommand(entry.command);
                      }}
                    >
                      <span>{entry.label}</span>
                      <span className="menu-popover__accelerator">{entry.accelerator ?? ""}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
