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
    label: "\uD30C\uC77C",
    entries: [
      {
        kind: "item",
        id: "file-new",
        label: "\uC0C8\uB85C \uB9CC\uB4E4\uAE30",
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
        label: "\uC624\uD508",
        command: "file:open",
        accelerator: "Ctrl+O"
      },
      {
        kind: "item",
        id: "file-save",
        label: "\uC800\uC7A5",
        command: "file:save",
        accelerator: "Ctrl+S"
      },
      {
        kind: "item",
        id: "file-save-as",
        label: "\uB2E4\uB978 \uC774\uB984\uC73C\uB85C \uC800\uC7A5",
        command: "file:saveAs"
      },
      {
        kind: "separator",
        id: "file-separator-2"
      },
      {
        kind: "item",
        id: "file-exit",
        label: "\uC885\uB8CC",
        command: "file:exit"
      }
    ]
  },
  {
    id: "edit",
    label: "\uD3B8\uC9D1",
    entries: [
      {
        kind: "item",
        id: "edit-copy",
        label: "\uBCF5\uC0AC\uD558\uAE30",
        command: "edit:copy",
        accelerator: "Ctrl+C"
      },
      {
        kind: "item",
        id: "edit-paste",
        label: "\uBD99\uC5EC\uB123\uAE30",
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

type PopoverPosition = {
  top: number;
  left: number;
};

export function MenuBar({ onCommand }: MenuBarProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenu = menuDefinitions.find(
    (menu) => menu.id === activeMenuId && menu.entries && menu.entries.length > 0
  );

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
      setPopoverPosition(null);
      return;
    }

    const currentMenuId = activeMenuId;

    function updatePopoverPosition() {
      const trigger = triggerRefs.current[currentMenuId];

      if (!trigger) {
        setPopoverPosition(null);
        return;
      }

      const bounds = trigger.getBoundingClientRect();
      setPopoverPosition({
        top: bounds.bottom + 8,
        left: bounds.left
      });
    }

    updatePopoverPosition();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveMenuId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePopoverPosition);
    scrollerRef.current?.addEventListener("scroll", updatePopoverPosition, {
      passive: true
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePopoverPosition);
      scrollerRef.current?.removeEventListener("scroll", updatePopoverPosition);
    };
  }, [activeMenuId]);

  return (
    <div className="menu-bar" ref={menuRef}>
      <div className="menu-bar__scroller" ref={scrollerRef}>
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
                ref={(element) => {
                  triggerRefs.current[menu.id] = element;
                }}
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
            </div>
          );
        })}
      </div>

      {activeMenu?.entries && popoverPosition ? (
        <div
          className="menu-popover"
          style={{
            top: popoverPosition.top,
            left: popoverPosition.left
          }}
        >
          {activeMenu.entries.map((entry) => {
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
}
