import { useRef, type MouseEvent } from "react";

/**
 * A button that does one thing on a tap and another on a long press. After a long press the
 * click that follows the release is swallowed, so the tap action never fires by accident.
 */
export function useLongPress(onLongPress: () => void, onTap: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onPointerDown: () => {
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        if (typeof navigator !== "undefined") navigator.vibrate?.(12);
        onLongPress();
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: (e: MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        return;
      }
      onTap();
    },
    // Mobile browsers open a context menu on a long press; the sheet replaces it.
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  };
}
