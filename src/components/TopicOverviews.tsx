import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ViewportPortal,
  getViewportForBounds,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import type { Board } from "../shared/types";
import type { TreeLayout } from "../model/layout";
import {
  overviewFrontier,
  overviewLabels,
  overviewOpacity,
  overviewRegions,
} from "../model/overview";

const COLORS = [
  "#567d67",
  "#527ca1",
  "#ac7655",
  "#8972a6",
  "#a87883",
  "#788348",
];

/** Transparent annotations: the cards and their interactions remain available. */
export function TopicOverviews({
  board,
  layout,
  heights,
  suspended = false,
}: {
  board: Board;
  layout: TreeLayout;
  heights: Map<string, number>;
  suspended?: boolean;
}) {
  const zoom = useStore((state) => state.transform[2]);
  const width = useStore((state) => state.width);
  const flow = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef(new Set<string>());
  const regions = useMemo(
    () => overviewRegions(board, layout, heights),
    [board, layout, heights],
  );
  const [visible, setVisible] = useState(new Set<string>());
  const opacity = suspended ? 0 : overviewOpacity(zoom);

  useLayoutEffect(() => {
    const next = overviewFrontier(regions, zoom, width, previous.current);
    previous.current = next.split;
    setVisible((current) =>
      current.size === next.visible.size &&
      [...current].every((id) => next.visible.has(id))
        ? current
        : next.visible,
    );
  }, [regions, zoom, width]);

  const labels = useMemo(
    () => overviewLabels(regions, visible, zoom, layout, heights),
    [regions, visible, zoom, layout, heights],
  );

  return (
    <ViewportPortal>
      <div className="topic-overviews" ref={container}>
        {regions.map((region) => {
          const label = labels.get(region.id);
          const active = !!label && opacity > 0;
          return (
            <div
              key={region.id}
              className="topic-overview"
              data-topic-id={region.id}
              data-depth={region.depth}
              data-active={active}
              aria-hidden={!active}
              style={
                {
                  left: region.x,
                  top: region.y,
                  width: region.width,
                  height: region.height,
                  opacity: active ? opacity : 0,
                  "--topic-color": COLORS[region.color],
                } as CSSProperties
              }
            >
              <svg
                className="topic-overview-outline"
                width={region.width}
                height={region.height}
                aria-hidden="true"
              >
                <path
                  d={region.outline}
                  fill="none"
                  stroke="var(--topic-color)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                {label && (
                  <path
                    className="topic-overview-leader"
                    d={`M${label.x - region.x},${label.y - region.y + 4 / zoom} L${region.width / 2},0`}
                    fill="none"
                    stroke="var(--topic-color)"
                    strokeWidth={1}
                    strokeDasharray="3 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              {label && (
                <div
                  className="topic-overview-label"
                  style={{ left: label.x - region.x, top: label.y - region.y }}
                >
                  <button
                    className="topic-overview-content nodrag nopan"
                    aria-label={`放大主题：${region.title}`}
                    tabIndex={active ? 0 : -1}
                    disabled={!active}
                    style={{
                      width: label.width,
                      transform: `translateX(-50%) scale(${1 / zoom})`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      const canvas = container.current?.closest(".react-flow");
                      if (!canvas) return;
                      void flow.setViewport(
                        getViewportForBounds(
                          region,
                          canvas.clientWidth,
                          canvas.clientHeight,
                          0.85,
                          1.2,
                          0.2,
                        ),
                        {
                          duration: window.matchMedia(
                            "(prefers-reduced-motion: reduce)",
                          ).matches
                            ? 0
                            : 300,
                        },
                      );
                    }}
                  >
                    <span className="topic-overview-title">{region.title}</span>
                    <span className="topic-overview-summary">
                      {region.summary}
                    </span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ViewportPortal>
  );
}
