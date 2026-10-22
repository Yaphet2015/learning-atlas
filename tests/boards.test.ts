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
import { layoutTree } from "../src/model/layout";

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
      parentId: null,
    });
    expect(board.nodes.slice(1).map((node) => node.order)).toEqual([0, 1, 2]);
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
        { kind: "relation", id: board.relations[0].id },
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
  it("accepts no additions only for expansion and leaves the board intact", () => {
    const board = createEmptyBoard("浏览器");
    const empty = JSON.stringify({ nodes: [], relations: [] });
    expect(buildMapFromAI(empty, board, board.nodes[0].id, "expand")).toBe(
      board,
    );
    expect(() => buildMapFromAI(empty, board)).toThrow();
    expect(() =>
      buildMapFromAI(
        JSON.stringify({
          nodes: [],
          relations: [{ source: "anchor", target: "anchor", label: "关系" }],
        }),
        board,
        board.nodes[0].id,
        "expand",
      ),
    ).toThrow();
  });

  it("preserves the board and replaces generated ids with safe unique ids", () => {
    const original = createEmptyBoard("浏览器");
    const result = buildMapFromAI(JSON.stringify(map()), original);
    expect(original.nodes).toHaveLength(1);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[1].id).not.toBe("structure");
    // Relations never decide the tree: both are children of the anchor and
    // structure→style stays a cross-link.
    expect(result.nodes[1].parentId).toBe(original.nodes[0].id);
    expect(result.nodes[2].parentId).toBe(original.nodes[0].id);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]).toMatchObject({
      source: result.nodes[1].id,
      target: result.nodes[2].id,
      label: "决定呈现对象",
      kind: "cross",
    });
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
    // anchor → structure is already the tree edge, so only the cross-link stays.
    expect(result.relations).toHaveLength(1);
    expect(
      result.nodes.filter((n) => n.parentId === board.nodes[0].id),
    ).toHaveLength(2);
  });
  it("lays a chained first level side by side: c1→c2→c3 is not a vertical chain", () => {
    const board = createEmptyBoard("重疾险");
    const anchor = board.nodes[0].id;
    const payload = {
      nodes: [
        { id: "c1", title: "保什么", body: "病种与分层。", parent: "anchor" },
        { id: "c2", title: "什么时候不赔", body: "等待期与免责。" },
        { id: "c3", title: "怎么赔", body: "次数与比例。", parent: "anchor" },
      ],
      relations: [
        { source: "c1", target: "c2", label: "先看" },
        { source: "c2", target: "c3", label: "然后" },
      ],
    };
    const result = buildMapFromAI(JSON.stringify(payload), board, anchor);
    const added = result.nodes.slice(1);
    expect(added.map((n) => n.parentId)).toEqual([anchor, anchor, anchor]);
    expect(added.map((n) => n.order)).toEqual([0, 1, 2]);
    const { positions } = layoutTree(result.nodes);
    expect(added.map((n) => positions.get(n.id)!.level)).toEqual([1, 1, 1]);
    // 先/然后 between neighbours is the sibling arrow, not a cross-link.
    expect(result.relations).toHaveLength(0);
  });
  it("keeps cross-branch relations and appends after existing children", () => {
    const board = buildMapFromAI(
      JSON.stringify({
        nodes: [{ id: "a", title: "已有", body: "已有的一张。" }],
        relations: [],
      }),
      createEmptyBoard("学习"),
    );
    const anchor = board.nodes[0].id;
    const result = buildMapFromAI(
      JSON.stringify({
        nodes: [
          { id: "x", title: "甲", body: "一。" },
          { id: "y", title: "乙", body: "二。" },
          { id: "z", title: "丙", body: "三。" },
        ],
        relations: [
          { source: "x", target: "z", label: "对照" },
          { source: "z", target: "x", label: "反过来" },
          { source: "x", target: "y", label: "导致" },
        ],
      }),
      board,
      anchor,
    );
    expect(
      result.nodes.filter((n) => n.parentId === anchor).map((n) => n.order),
    ).toEqual([0, 1, 2, 3]);
    // x↔z is kept once; x→y is a causal link, not a sequence, so it stays.
    expect(result.relations.map((r) => r.label)).toEqual(["对照", "导致"]);
  });
  it("preserves explicit knowledge parents instead of flattening the generated hierarchy", () => {
    const board = createEmptyBoard("学习");
    const result = buildMapFromAI(
      JSON.stringify({
        nodes: [
          { id: "p", title: "父", body: "一。" },
          { id: "q", title: "子", body: "二。", parent: "p" },
        ],
        relations: [],
      }),
      board,
    );
    const [root, parent, child] = result.nodes;
    expect(parent.parentId).toBe(root.id);
    expect(child.parentId).toBe(parent.id);
    const { positions } = layoutTree(result.nodes);
    expect(positions.get(parent.id)!.level).toBe(1);
    expect(positions.get(child.id)!.level).toBe(2);
  });
  it("places peers and details by knowledge even when generated from the same selected card", () => {
    const original = buildMapFromAI(
      JSON.stringify({
        nodes: [
          { id: "http", title: "HTTP", body: "请求和响应。", parent: "anchor" },
        ],
        relations: [],
      }),
      createEmptyBoard("网络通信"),
    );
    const [network, http] = original.nodes;
    const before = JSON.stringify(original);
    const result = buildMapFromAI(
      JSON.stringify({
        // Forward references and interleaved levels must not change placement.
        nodes: [
          {
            id: "header",
            title: "请求头",
            body: "请求中的元数据。",
            parent: "request",
          },
          { id: "tcp", title: "TCP", body: "可靠传输。", parent: network.id },
          {
            id: "request",
            title: "HTTP 请求",
            body: "客户端发出的请求。",
            parent: "anchor",
          },
          {
            id: "response",
            title: "HTTP 响应",
            body: "服务端返回的响应。",
            parent: http.id,
          },
        ],
        relations: [
          { source: "tcp", target: "anchor", label: "提供传输能力" },
          { source: "request", target: "response", label: "然后" },
          { source: "request", target: "header", label: "包含" },
          { source: "tcp", target: "request", label: "随后" },
        ],
      }),
      original,
      http.id,
    );
    const byTitle = new Map(result.nodes.map((n) => [n.title, n]));
    const tcp = byTitle.get("TCP")!;
    const request = byTitle.get("HTTP 请求")!;
    const response = byTitle.get("HTTP 响应")!;
    const header = byTitle.get("请求头")!;
    expect(tcp).toMatchObject({ parentId: network.id, order: 1 });
    expect(request).toMatchObject({ parentId: http.id, order: 0 });
    expect(response).toMatchObject({ parentId: http.id, order: 1 });
    expect(header.parentId).toBe(request.id);
    const { positions } = layoutTree(result.nodes);
    expect(positions.get(tcp.id)!.y).toBe(positions.get(http.id)!.y);
    expect(positions.get(tcp.id)!.x).toBeGreaterThan(positions.get(http.id)!.x);
    expect(positions.get(request.id)!.level).toBe(2);
    expect(positions.get(response.id)!.level).toBe(2);
    expect(positions.get(header.id)!.level).toBe(3);
    // Cross-links to the selected card survive; sequence only disappears for siblings.
    expect(result.relations.map((r) => r.label)).toEqual([
      "提供传输能力",
      "随后",
    ]);
    expect(result.nodes.find((n) => n.id === network.id)?.expanded).toBe(true);
    expect(result.nodes.some((n) => n.status === "explained")).toBe(false);
    expect(JSON.stringify(original)).toBe(before);
  });
  it("can add a peer of a top-level card and its details", () => {
    const board = createEmptyBoard("HTTP");
    const result = buildMapFromAI(
      JSON.stringify({
        nodes: [
          { id: "tcp", title: "TCP", body: "可靠传输。", parent: null },
          {
            id: "ack",
            title: "确认机制",
            body: "确认收到的数据。",
            parent: "tcp",
          },
        ],
        relations: [],
      }),
      board,
    );
    expect(result.nodes[1]).toMatchObject({ parentId: null, order: 1 });
    expect(result.nodes[2].parentId).toBe(result.nodes[1].id);
    const { positions } = layoutTree(result.nodes);
    expect(positions.get(result.nodes[1].id)!.level).toBe(0);
    expect(positions.get(result.nodes[2].id)!.level).toBe(1);
  });
  it.each(
    [
      [{ id: "a", parent: "missing" }],
      [{ id: "a", parent: "a" }],
      [
        { id: "a", parent: "b" },
        { id: "b", parent: "a" },
      ],
      [
        { id: "a", parent: "b" },
        { id: "b", parent: "c" },
        { id: "c", parent: "a" },
      ],
      [{ id: "anchor", parent: null }],
    ].map((nodes) => ({ nodes })),
  )("rejects invalid knowledge parents atomically: %j", ({ nodes }) => {
    const board = createEmptyBoard("网络通信");
    const before = JSON.stringify(board);
    expect(() =>
      buildMapFromAI(
        JSON.stringify({
          nodes: nodes.map((n) => ({ ...n, title: "概念", body: "说明。" })),
          relations: [],
        }),
        board,
      ),
    ).toThrow();
    expect(JSON.stringify(board)).toBe(before);
  });
  it("rejects a generated id that shadows an existing parent", () => {
    const board = createWalkthroughBoard();
    const before = JSON.stringify(board);
    expect(() =>
      buildMapFromAI(
        JSON.stringify({
          nodes: [
            {
              id: "concept-dom",
              title: "新概念",
              body: "说明。",
              parent: "anchor",
            },
          ],
          relations: [],
        }),
        board,
        "concept-style",
      ),
    ).toThrow("重复或保留");
    expect(JSON.stringify(board)).toBe(before);
  });
  it("drops stray top-level keys; they never reach the board", () => {
    const board = createEmptyBoard("学习");
    const result = buildMapFromAI(
      JSON.stringify({ ...map(), html: "<script>alert(1)</script>", relations_note: "x" }),
      board,
    );
    expect(result.nodes).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain("script");
    const { relations: _r, ...noRelations } = map();
    expect(buildMapFromAI(JSON.stringify(noRelations), board).nodes).toHaveLength(3);
  });
  it("connects disconnected components without fabricating semantic edges", () => {
    const board = createEmptyBoard("学习");
    const payload = map();
    payload.relations = [];
    const result = buildMapFromAI(JSON.stringify(payload), board);
    // Both hang under the anchor as siblings, in the model's order.
    expect(result.relations).toHaveLength(0);
    expect(result.nodes.slice(1).map((n) => [n.parentId, n.order])).toEqual([
      [board.nodes[0].id, 0],
      [board.nodes[0].id, 1],
    ]);
  });
  it.each([
    "not json",
    '{"nodes":[],"relations":[]}',
    JSON.stringify({
      nodes: [{ id: "n1", title: "恶意", body: "<script>alert(1)</script>" }],
      relations: [],
    }),
    JSON.stringify({
      nodes: [{ id: "n1", title: "代码", body: "```js\nalert(1)\n```" }],
      relations: [],
    }),
    JSON.stringify({ nodes: [map().nodes[0], map().nodes[0]], relations: [] }),
    JSON.stringify({
      nodes: Array.from({ length: 9 }, (_, i) => ({
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
