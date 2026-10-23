import { describe, expect, it } from "vitest";
import {
  boardSchema,
  migrateV1toV2,
  parseBoard,
} from "../src/shared/validation";

const t = "2026-10-01T00:00:00.000Z";
const v1node = (id: string, x: number, y: number, title = id) => ({
  id,
  kind: "concept",
  title,
  body: "",
  emoji: "🌿",
  color: "sage",
  position: { x, y },
  status: "unseen",
});
const v1 = (nodes: unknown[], relations: unknown[], notes: unknown[] = []) => ({
  version: 1,
  id: "board-1",
  title: "T",
  topic: "Topic",
  kind: "ai",
  createdAt: t,
  updatedAt: t,
  nodes,
  relations,
  notes,
  scene: {
    width: 180,
    color: "#E9AE7E",
    prediction: "",
    explanation: "",
    changed: null,
  },
});
const rel = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
  label: id,
});

describe("migrateV1toV2", () => {
  it("drops position/color/emoji and uses first incoming edges as parents", () => {
    const board = migrateV1toV2(
      v1(
        [
          v1node("root", 0, 0),
          v1node("b", 300, 400),
          v1node("a", -300, 400),
          v1node("c", 0, 800),
        ],
        [
          rel("r1", "root", "b"),
          rel("r2", "root", "a"),
          rel("r3", "a", "c"),
          rel("r4", "b", "c"),
        ],
      ),
    );
    expect(boardSchema.safeParse(board).success).toBe(true);
    expect(board.version).toBe(3);
    const by = Object.fromEntries(board.nodes.map((n) => [n.id, n]));
    expect(by.root).toMatchObject({ parentId: null, order: 0 });
    // siblings ordered by old position.x
    expect(by.a).toMatchObject({ parentId: "root", order: 0 });
    expect(by.b).toMatchObject({ parentId: "root", order: 1 });
    expect(by.c.parentId).toBe("a");
    expect(board.relations).toEqual([
      { id: "r4", source: "b", target: "c", label: "r4", kind: "cross" },
    ]);
    for (const n of board.nodes) {
      expect(n).not.toHaveProperty("position");
      expect(n).not.toHaveProperty("color");
      expect(n).not.toHaveProperty("emoji");
    }
  });
  it("breaks cycles and hangs orphans under the top-most root", () => {
    const board = migrateV1toV2(
      v1(
        [
          v1node("x", 0, 500),
          v1node("top", 0, 0),
          v1node("y", 100, 500),
          v1node("lone", 900, 300),
        ],
        [rel("r1", "x", "y"), rel("r2", "y", "x"), rel("r3", "top", "x")],
      ),
    );
    const by = Object.fromEntries(board.nodes.map((n) => [n.id, n]));
    expect(board.nodes.filter((n) => n.parentId === null)).toHaveLength(1);
    expect(by.top.parentId).toBeNull();
    expect(by.lone.parentId).toBe("top");
    expect(boardSchema.safeParse(board).success).toBe(true);
    // every node reaches the root
    for (const n of board.nodes) {
      let c: string | null = n.id;
      for (let i = 0; c && i < 10; i++) c = by[c].parentId;
      expect(c).toBeNull();
    }
  });
  it("re-points notes on relations that became tree edges", () => {
    const board = migrateV1toV2(
      v1(
        [v1node("root", 0, 0), v1node("a", 0, 400)],
        [rel("r1", "root", "a")],
        [
          {
            id: "n1",
            title: "",
            text: "",
            position: { x: 0, y: 0 },
            attachedTo: { kind: "relation", id: "r1" },
            messages: [],
          },
        ],
      ),
    );
    expect(board.notes[0].attachedTo).toEqual({ kind: "node", id: "a" });
  });
  it("creates a root question for an empty v1 board", () => {
    const board = migrateV1toV2(v1([], []));
    expect(board.nodes).toHaveLength(1);
    expect(board.nodes[0]).toMatchObject({ parentId: null, title: "Topic" });
  });
  it("parseBoard passes v2 through and accepts a forest and rejects broken trees", () => {
    const board = migrateV1toV2(
      v1([v1node("root", 0, 0), v1node("a", 0, 400)], [rel("r1", "root", "a")]),
    );
    expect(parseBoard(board)).toEqual(board);
    const twoRoots = {
      ...board,
      nodes: board.nodes.map((n) => ({ ...n, parentId: null })),
    };
    // Several roots side by side (a forest) are a valid board now; no root at all is not.
    expect(parseBoard(twoRoots).nodes.every((n) => n.parentId === null)).toBe(
      true,
    );
    const noRoot = {
      ...board,
      nodes: [
        { ...board.nodes[0], id: "x", parentId: "y" },
        { ...board.nodes[1], id: "y", parentId: "x" },
      ],
      relations: [],
    };
    expect(() => parseBoard(noRoot)).toThrow();
    const cycle = {
      ...board,
      nodes: [
        board.nodes[0],
        { ...board.nodes[1], id: "b", parentId: "c" },
        { ...board.nodes[1], id: "c", parentId: "b" },
      ],
      relations: [],
    };
    expect(() => parseBoard(cycle)).toThrow(/cycle/);
  });
});
