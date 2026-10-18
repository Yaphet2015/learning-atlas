import ReactDOM from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import App from "./App";
// LXGW WenKai is bundled (unicode-range subsets, loaded on demand from dist/).
import "lxgw-wenkai-webfont/lxgwwenkai-regular.css";
import "lxgw-wenkai-webfont/lxgwwenkai-bold.css";
import "lxgw-wenkai-webfont/lxgwwenkaimono-regular.css";
import "@xyflow/react/dist/style.css";
import "./styles.css";

async function boot() {
  // Measure with the real face, never a fallback: card widths are measured from the title.
  try {
    await Promise.all([
      document.fonts.load('700 22px "LXGW WenKai"', "学习地图"),
      document.fonts.load('400 15px "LXGW WenKai"', "学习地图"),
      document.fonts.load('400 11px "LXGW WenKai Mono"', "L0"),
    ]);
  } catch {
    /* Render anyway; card widths fall back to a character estimate. */
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>,
  );
}
void boot();
