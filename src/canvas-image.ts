import { getNodesBounds } from "@xyflow/react";
import type { Node } from "@xyflow/react";

/** Rasterize all rendered cards and edges at their map coordinates, independent of pan/zoom. */
export async function canvasImage(nodes: Node[]): Promise<string> {
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  const visible = nodes.filter((n) => n.type !== "ghost" && !n.hidden);
  if (!viewport || !visible.length)
    throw new Error("当前没有可以导出的知识图。");
  await document.fonts.ready;
  const bounds = getNodesBounds(visible);
  const padding = 64;
  const width = Math.ceil(bounds.width + padding * 2);
  const height = Math.ceil(bounds.height + padding * 2);
  // Keep large maps within Chromium's canvas limits and a predictable memory budget.
  const scale = Math.min(
    2,
    16384 / width,
    16384 / height,
    Math.sqrt(32_000_000 / (width * height)),
  );
  const clone = viewport.cloneNode(true) as HTMLElement;
  const originals = [viewport, ...viewport.querySelectorAll<Element>("*")];
  const copies = [clone, ...clone.querySelectorAll<Element>("*")];
  originals.forEach((original, index) => {
    const copy = copies[index] as HTMLElement | SVGElement;
    const style = getComputedStyle(original);
    for (const property of style)
      copy.style.setProperty(property, style.getPropertyValue(property));
    // Embedded SVG images cannot load external font files; use system CJK faces.
    copy.style.fontFamily = '"PingFang SC", "Microsoft YaHei", sans-serif';
    copy.style.animation = "none";
    copy.style.transition = "none";
  });
  clone
    .querySelectorAll(
      ".topic-overviews, .react-flow__node-toolbar, .react-flow__node-ghost, .react-flow__handle, button, input, textarea, .react-flow__selection, .react-flow__nodesselection",
    )
    .forEach((el) => el.remove());
  clone.style.transform = `translate(${padding - bounds.x}px, ${padding - bounds.y}px)`;
  clone.style.transformOrigin = "0 0";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  const background =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--paper")
      .trim() || "#f7f5ef";
  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${background}`;
  wrapper.append(clone);
  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("截图生成失败，请重试。"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法生成截图。");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0);
  const data = canvas.toDataURL("image/png");
  if (!data.startsWith("data:image/png;base64,"))
    throw new Error("知识图过大，无法生成截图。");
  return data;
}
