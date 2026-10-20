/**
 * Window-chrome classes for <html>. On macOS the hidden-inset title bar draws the traffic
 * lights over the top-left corner, so sidebar content needs top padding and the window
 * needs an app-region drag strip. Fullscreen hides the lights, so both are dropped there.
 * The browser preview and other platforms get nothing.
 */
export function windowChromeClasses(
  platform: string | undefined,
  fullscreen: boolean,
): string[] {
  if (platform !== "darwin") return [];
  return fullscreen ? ["platform-mac"] : ["platform-mac", "mac-titlebar"];
}
export const WINDOW_CHROME_CLASSES = ["platform-mac", "mac-titlebar"];
