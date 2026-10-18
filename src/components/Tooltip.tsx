import { useEffect, useRef, useState } from "react";

/**
 * One tooltip for the whole app. Any element with `data-tip`, or any icon-only button with an
 * aria-label, gets a small label (plus its shortcut from `data-keys`) after a short delay on
 * hover, and immediately on keyboard focus. Moving between tooltipped controls stays "warm"
 * and shows the next one without the delay. The accessible name stays the aria-label; the
 * shortcut is also exposed as aria-keyshortcuts by `tip()`.
 */
const DELAY = 450;
const WARM = 400;
const SELECTOR = "[data-tip], button[aria-label], [role='button'][aria-label]";

/** Props for an icon-only control: its name (aria-label) and optional shortcut. */
export function tip(label: string, keys?: string) {
  return {
    "aria-label": label,
    ...(keys ? { "data-keys": keys, "aria-keyshortcuts": ariaKeys(keys) } : {}),
  };
}
function ariaKeys(keys: string) {
  return keys
    .replace("⌘", "Meta+")
    .replace("Ctrl+", "Control+")
    .replace("↵", "Enter")
    .replace("⌫", "Backspace");
}

function labelFor(el: Element): { text: string; keys?: string } | null {
  if (el.closest("[data-no-tip]")) return null;
  const explicit = el.getAttribute("data-tip");
  const keys = el.getAttribute("data-keys") ?? undefined;
  if (explicit) return { text: explicit, keys };
  const label = el.getAttribute("aria-label");
  if (!label) return null;
  // Only icon-only controls: visible text means the control already names itself.
  const text = (el.textContent ?? "").replace(/\s+/g, "");
  if (text.length > 1) return null;
  return { text: label, keys };
}

type Shown = { text: string; keys?: string; rect: DOMRect };

export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const target = useRef<Element | null>(null);
  const lastHide = useRef(0);
  // A clicked control stays quiet until the pointer leaves it (matched by its label, since
  // a click can re-render the control under the pointer).
  const pressed = useRef<string | null>(null);
  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      if (target.current) lastHide.current = Date.now();
      target.current = null;
      setShown(null);
    };
    const show = (el: Element, immediate: boolean) => {
      const label = labelFor(el);
      if (!label) return hide();
      if (target.current === el) return;
      clearTimeout(timer.current);
      target.current = el;
      const go = () => {
        if (target.current !== el || !el.isConnected) return;
        setShown({ ...label, rect: el.getBoundingClientRect() });
      };
      if (immediate || Date.now() - lastHide.current < WARM) go();
      else timer.current = setTimeout(go, DELAY);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = (e.target as Element)?.closest?.(SELECTOR);
      if (el && pressed.current && labelFor(el)?.text === pressed.current)
        return;
      pressed.current = null;
      if (el) show(el, false);
      else if (target.current) hide();
    };
    const focus = (e: FocusEvent) => {
      const el = e.target as Element;
      if (el?.matches?.(SELECTOR) && el.matches(":focus-visible"))
        show(el, true);
    };
    const blur = (e: FocusEvent) => {
      if (e.target === target.current) hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("pointerover", over);
    const down = (e: PointerEvent) => {
      const el = (e.target as Element)?.closest?.(SELECTOR);
      pressed.current = el ? (labelFor(el)?.text ?? null) : null;
      hide();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("keydown", key, true);
    window.addEventListener("wheel", hide, { passive: true });
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("wheel", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);
  // Drop a tooltip whose control disappears (e.g. a closed menu).
  useEffect(() => {
    if (!shown) return;
    const t = setInterval(() => {
      if (!target.current?.isConnected) {
        target.current = null;
        setShown(null);
      }
    }, 300);
    return () => clearInterval(t);
  }, [shown]);
  if (!shown) return null;
  const { rect } = shown;
  const below = rect.top < 44;
  const x = Math.min(
    window.innerWidth - 8,
    Math.max(8, rect.left + rect.width / 2),
  );
  return (
    <div
      role="tooltip"
      className={`tooltip ${below ? "below" : ""}`}
      style={{
        left: x,
        top: below ? rect.bottom + 8 : rect.top - 8,
      }}
    >
      {shown.text}
      {shown.keys && <kbd>{shown.keys}</kbd>}
    </div>
  );
}
