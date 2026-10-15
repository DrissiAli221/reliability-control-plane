import { MoreHorizontal } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type MenuAction = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Danger items read red; the red wash only appears on hover. */
  tone?: "danger";
  /** Draws a hairline above this item to set it apart from the group before it. */
  separatorBefore?: boolean;
};

const MENU_HEIGHT_ESTIMATE = 150;

/**
 * The menu renders in a body-level portal with fixed coordinates, so table scroll containers and
 * row stacking contexts can neither clip it nor paint over it.
 */
export function ActionMenu({ label, actions, bordered = false }: { label: string; actions: MenuAction[]; bordered?: boolean }) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const open = position != null;

  function toggle() {
    if (open || !trigger.current) {
      setPosition(null);
      return;
    }
    const rect = trigger.current.getBoundingClientRect();
    const right = window.innerWidth - rect.right;
    setPosition(rect.bottom + MENU_HEIGHT_ESTIMATE > window.innerHeight
      ? { right, bottom: window.innerHeight - rect.top + 4 }
      : { right, top: rect.bottom + 4 });
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div className="action-menu" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button
        ref={trigger}
        type="button"
        className={bordered ? "icon-button bordered" : "icon-button"}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <MoreHorizontal size={16} />
      </button>
      {position && createPortal(
        <div className="menu" role="menu" id={menuId} ref={menu} style={position}>
          {actions.map((action) => (
            <Fragment key={action.label}>
            {action.separatorBefore && <div className="menu-separator" role="separator" />}
            <button
              type="button"
              role="menuitem"
              className={action.tone === "danger" ? "danger" : undefined}
              disabled={action.disabled}
              onClick={() => {
                setPosition(null);
                action.onSelect();
              }}
            >
              {action.icon}
              {action.label}
            </button>
            </Fragment>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
