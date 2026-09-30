import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab and Shift+Tab inside a modal while it is open, and returns focus to whatever opened it when it closes,
 * so keyboard users neither wander behind the backdrop nor lose their place.
 */
export function useFocusTrap<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // Read during the first render: by the time effects run, an autoFocus field inside the modal already has focus.
  const opener = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const returnTo = opener.current;
    if (!container.contains(document.activeElement)) container.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Tab" || !container) return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("keydown", onKey);
      returnTo?.focus?.();
    };
  }, []);

  return ref;
}
