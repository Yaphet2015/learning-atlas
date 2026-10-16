import { describe, expect, it } from "vitest";
import {
  buildMapFromAI,
  createEmptyBoard,
  createWalkthroughBoard,
  expandWalkthrough,
  newNote,
} from "../src/model/boards";
import {
  boardSchema,
  aiRequestSchema,
  settingsSchema,
  visualDiagramSchema,
} from "../src/shared/validation";

const map = () => ({
  nodes: [
    {
      id: "structure",
      title: "内容结构",
      body: "结构描述各部分之间的关系。",
      emoji: "🌿",
      color: "sage",
    },
    {
      id: "style",
      title: "呈现方式",
      body: "样式决定内容的外观。",
      emoji: "🎨",
      color: "blue",
    },
  ],
  relations: [{ source: "structure", target: "style", label: "决定呈现对象" }],
});

describe("board creation and progressive exploration", () => {
  it("starts with the compact Chinese walkthrough, no invented mastery", () => {
    const board = createWalkthroughBoard();
    expect(boardSchema.safeParse(board).success).toBe(true);
    expect(board.nodes).toHaveLength(4);
    expect(board.nodes[0]).toMatchObject({
      kind: "scene",
      title: "浏览器，把代码变成画面",
      position: { x: 0, y: 0 },
    });
    expect(board.nodes.slice(1).map((node) => node.title)).toEqual([
      "DOM",
      "样式计算",
      "布局与绘制",
    ]);
    expect(board.nodes.some((node) => node.status === "explained")).toBe(false);
    expect(board.notes).toEqual([]);
  });
  it("creates only the supplied learning topic for an AI board", () => {
    const board = createEmptyBoard("  线性代数  ");
    expect(board.kind).toBe("ai");
    expect(board.topic).toBe("线性代数");
    expect(board.nodes).toHaveLength(1);
    expect(board.nodes[0].title).toBe("线性代数");
    expect(board.relations).toEqual([]);
    expect(boardSchema.safeParse(board).success).toBe(true);
    expect(() => createEmptyBoard("  ")).toThrow();
    expect(() => createEmptyBoard("x".repeat(2_001))).toThrow();
  });
  it("returns an unattached note without mutating its board", () => {
    const board = createWalkthroughBoard();
    const note = newNote(board, { x: 30, y: 40 });
    expect(note.position).toEqual({ x: 30, y: 40 });
    expect(note.attachedTo).toBeUndefined();
    expect(note.messages).toEqual([]);
    expect(board.notes).toEqual([]);
    expect(() => newNote(board, { x: Infinity, y: 0 })).toThrow();
    expect(() =>
      newNote(board, { x: 0, y: 0 }, { kind: "node", id: "missing" }),
    ).toThrow();
  });
  it("supports both node and relation attachments", () => {
    const board = createWalkthroughBoard();
    expect(
      newNote(board, { x: 0, y: 0 }, { kind: "node", id: board.nodes[1].id })
        .attachedTo?.kind,
    ).toBe("node");
    expect(
      newNote(
        board,
        { x: 0, y: 0 },
        { kind: "relation", id: board.relations[1].id },
      ).attachedTo?.kind,
    ).toBe("relation");
  });
  it("expands only the requested branch, idempotently, without auto mastery", () => {
    const initial = createWalkthroughBoard();
    const expanded = expandWalkthrough(initial, "concept-render");
    expect(initial.nodes).toHaveLength(4);
    expect(expanded.nodes).toHaveLength(6);
    expect(expanded.nodes.slice(4).map((node) => node.id)).toEqual([
      "concept-layout",
      "concept-paint",
    ]);
    expect(
      expanded.nodes.find((node) => node.id === "concept-render")?.status,
    ).toBe("exploring");
    expect(expanded.nodes.some((node) => node.status === "explained")).toBe(
      false,
    );
    expect(expandWalkthrough(expanded, "concept-render")).toBe(expanded);
    expect(expandWalkthrough(initial, "missing")).toBe(initial);
    expect(boardSchema.safeParse(expanded).success).toBe(true);
  });
  it("does not downgrade a user-explained concept", () => {
    const board = createWalkthroughBoard();
    board.nodes.find((node) => node.id === "concept-render")!.status =
      "explained";
    expect(
      expandWalkthrough(board, "concept-render").nodes.find(
        (node) => node.id === "concept-render",
      )?.status,
    ).toBe("explained");
  });
});

describe("constrained AI map parsing", () => {
  it("preserves the board and replaces generated ids with safe unique ids", () => {
    const original = createEmptyBoard("浏览器");
    const result = buildMapFromAI(JSON.stringify(map()), original);
    expect(original.nodes).toHaveLength(1);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[1].id).not.toBe("structure");
    expect(result.relations).toHaveLength(2);
    expect(
      result.relations.some((edge) => edge.source === original.nodes[0].id),
    ).toBe(true);
    expect(boardSchema.safeParse(result).success).toBe(true);
    expect(result.nodes.some((node) => node.status === "explained")).toBe(
      false,
    );
  });
  it("accepts a complete JSON fence and an explicit anchor relation", () => {
    const board = createEmptyBoard("学习");
    const payload = map();
    payload.relations.push({
      source: "anchor",
      target: "structure",
      label: "第一步",
    });
    const result = buildMapFromAI(
      `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``,
      board,
      board.nodes[0].id,
    );
    expect(result.relations).toHaveLength(2);
    expect(
      result.relations.some(
        (edge) => edge.source === board.nodes[0].id && edge.label === "第一步",
      ),
    ).toBe(true);
  });
  it("connects disconnected components without fabricating semantic edges", () => {
    const board = createEmptyBoard("学习");
    const payload = map();
    payload.relations = [];
    const result = buildMapFromAI(JSON.stringify(payload), board);
    expect(result.relations).toHaveLength(2);
    expect(result.relations.every((edge) => edge.label === "继续探索")).toBe(
      true,
    );
  });
  it.each([
    "not json",
    '{"nodes":[],"relations":[]}',
    JSON.stringify({ ...map(), html: "<script>alert(1)</script>" }),
    JSON.stringify({
      nodes: [{ id: "n1", title: "恶意", body: "<script>alert(1)</script>" }],
      relations: [],
    }),
    JSON.stringify({
      nodes: [{ id: "n1", title: "代码", body: "```js\nalert(1)\n```" }],
      relations: [],
    }),
    JSON.stringify({
      ...map(),
      relations: [
        {
          source: "structure",
          target: "unrelated-board-node",
          label: "invalid",
        },
      ],
    }),
    JSON.stringify({
      ...map(),
      relations: [{ source: "structure", target: "structure", label: "self" }],
    }),
    JSON.stringify({ nodes: [map().nodes[0], map().nodes[0]], relations: [] }),
    JSON.stringify({
      nodes: Array.from({ length: 7 }, (_, i) => ({
        id: `n${i}`,
        title: "节点",
        body: "内容",
      })),
      relations: [],
    }),
    JSON.stringify({
      nodes: [{ id: "../../escape", title: "节点", body: "内容" }],
      relations: [],
    }),
  ])(
    "rejects malformed or executable-shaped map output without mutating the board",
    (text) => {
      const board = createEmptyBoard("学习");
      const before = JSON.stringify(board);
      expect(() => buildMapFromAI(text, board)).toThrow();
      expect(JSON.stringify(board)).toBe(before);
    },
  );
  it("keeps pasted user script as literal note text, never executable graph fields", () => {
    const board = createEmptyBoard("脚本研究");
    const note = newNote(board, { x: 0, y: 0 });
    note.text = "<script>globalThis.compromised = true</script>";
    board.notes.push(note);
    expect(boardSchema.parse(board).notes[0].text).toBe(note.text);
    expect(
      (globalThis as { compromised?: boolean }).compromised,
    ).toBeUndefined();
  });
});

describe("validation boundaries", () => {
  it("rejects dangling attachments, endpoints and duplicate ids", () => {
    const board = createWalkthroughBoard();
    board.relations[0].target = "missing";
    expect(boardSchema.safeParse(board).success).toBe(false);
    const duplicate = createWalkthroughBoard();
    duplicate.nodes[1].id = duplicate.nodes[0].id;
    expect(boardSchema.safeParse(duplicate).success).toBe(false);
    const detached = createWalkthroughBoard();
    detached.notes.push({
      ...newNote(detached, { x: 0, y: 0 }),
      attachedTo: { kind: "node", id: "missing" },
    });
    expect(boardSchema.safeParse(detached).success).toBe(false);
  });
  it("allows secure model endpoints and explicitly local development endpoints", () => {
    for (const baseUrl of [
      "https://api.example.com/v1",
      "http://localhost:11434/v1",
      "http://127.0.0.1:3000",
      "http://[::1]:8080/v1",
    ]) {
      expect(
        settingsSchema.safeParse({ model: "model", baseUrl }).success,
      ).toBe(true);
    }
    for (const baseUrl of [
      "http://api.example.com",
      "file:///tmp/api",
      "https://user:secret@example.com",
      "https://example.com/?key=secret",
      "https://example.com/#token",
    ]) {
      expect(
        settingsSchema.safeParse({ model: "model", baseUrl }).success,
      ).toBe(false);
    }
  });
  it("rejects oversized prompts and unsafe identifiers at IPC boundaries", () => {
    const request = {
      boardId: "board-1",
      stickyId: "note-1",
      requestId: "request-1",
      prompt: "hello",
      mode: "answer",
      context: { topic: "topic", references: [], summary: "" },
    };
    expect(aiRequestSchema.safeParse(request).success).toBe(true);
    expect(
      aiRequestSchema.safeParse({ ...request, boardId: "../../outside" })
        .success,
    ).toBe(false);
    expect(
      aiRequestSchema.safeParse({ ...request, prompt: "x".repeat(8_001) })
        .success,
    ).toBe(false);
  });
});

describe("safe structured learning visuals", () => {
  const visual = {
    kind: "process" as const,
    title: "从输入到反馈",
    labels: ["观察", "尝试", "反馈"],
    caption: "示意过程，不代表唯一学习路径。",
    basis: "analogy" as const,
  };
  it("preserves data-only visual structure through AI parsing and board schema roundtrip", () => {
    const board = createEmptyBoard("学习如何发生");
    const text = JSON.stringify({
      nodes: [
        {
          id: "cycle",
          title: "学习循环",
          body: "反馈帮助我们改进下一次尝试。",
          visual,
        },
      ],
      relations: [],
    });
    const mapped = buildMapFromAI(text, board);
    expect(mapped.nodes[1].visual).toEqual(visual);
    expect(
      boardSchema.parse(JSON.parse(JSON.stringify(mapped))).nodes[1].visual,
    ).toEqual(visual);
  });
  it("accepts all three diagram kinds and both explicit representational bases", () => {
    for (const kind of ["process", "parts", "comparison"]) {
      for (const basis of ["literal", "analogy"]) {
        expect(
          visualDiagramSchema.safeParse({ ...visual, kind, basis }).success,
        ).toBe(true);
      }
    }
  });
  it.each([
    { title: "<script>alert(1)</script>" },
    { labels: ["安全", '<svg onload="alert(1)"></svg>'] },
    { caption: '<img src=x onerror="alert(1)">' },
    { caption: "```js\nalert(1)\n```" },
    { labels: ["只有一个"] },
    { labels: ["a", "b", "c", "d", "e"] },
    { labels: ["a".repeat(33), "b"] },
    { title: "a".repeat(61) },
    { caption: "a".repeat(121) },
    { basis: "unknown" },
    { kind: "svg" },
    { html: "<div>unrecognized field</div>" },
    { values: [10, 20] },
  ])(
    "rejects markup, executable-shaped content, unknown fields and unbounded structure: %j",
    (override) => {
      const unsafe = { ...visual, ...override };
      expect(visualDiagramSchema.safeParse(unsafe).success).toBe(false);
      const board = createEmptyBoard("safe");
      expect(() =>
        buildMapFromAI(
          JSON.stringify({
            nodes: [
              { id: "cycle", title: "学习循环", body: "内容", visual: unsafe },
            ],
            relations: [],
          }),
          board,
        ),
      ).toThrow();
      expect(board.nodes).toHaveLength(1);
    },
  );
  it("keeps old boards with no visual field valid", () => {
    const board = createWalkthroughBoard();
    expect(boardSchema.safeParse(board).success).toBe(true);
    expect(board.nodes.every((node) => !node.visual)).toBe(true);
  });
});
