import { describe, expect, it } from "vitest";
import { createWalkthroughBoard, newNote } from "../src/model/boards";
import {
  latestNoteOn,
  listSessions,
  sessionClock,
} from "../src/model/sessions";
import { KICKOFF_MESSAGE } from "../src/model/kickoff";

const msg = (role: "user" | "assistant", text: string, at: string) => ({
  id: `m-${at}-${role}`,
  role,
  text,
  createdAt: at,
});

function board() {
  const b = createWalkthroughBoard();
  b.updatedAt = "2026-10-01T00:00:00.000Z";
  const older = newNote(b, { x: 0, y: 0 }, { kind: "node", id: "concept-dom" });
  older.title = "DOM";
  older.messages = [
    msg("user", "DOM 是**什么**？", "2026-10-10T08:00:00.000Z"),
    msg("assistant", "…", "2026-10-10T08:00:05.000Z"),
  ];
  const newer = newNote(b, { x: 0, y: 0 }, { kind: "node", id: "concept-dom" });
  newer.title = "DOM";
  newer.messages = [
    msg("user", "和 HTML 有什么区别", "2026-10-12T08:00:00.000Z"),
  ];
  const kickoff = newNote(
    b,
    { x: 0, y: 0 },
    { kind: "node", id: "scene-browser" },
  );
  kickoff.title = "我的问题";
  kickoff.messages = [
    msg(
      "user",
      `${KICKOFF_MESSAGE}\n很长的隐藏说明`,
      "2026-10-11T08:00:00.000Z",
    ),
  ];
  const renamed = newNote(
    b,
    { x: 0, y: 0 },
    { kind: "node", id: "concept-style" },
  );
  renamed.title = "关于「样式计算」等 3 张卡";
  renamed.contextCards = ["concept-dom", "concept-render"];
  renamed.createdAt = "2026-10-09T08:00:00.000Z";
  const legacy = newNote(b, { x: 0, y: 0 });
  delete legacy.createdAt;
  legacy.text = "一张旧的自由批注";
  b.notes.push(older, newer, kickoff, renamed, legacy);
  return { b, older, newer, kickoff, renamed, legacy };
}

describe("session list", () => {
  it("lists every conversation newest first with title, anchor, time and count", () => {
    const { b, older, newer, kickoff, renamed, legacy } = board();
    const list = listSessions(b);
    expect(list.map((s) => s.id)).toEqual([
      newer.id,
      kickoff.id,
      older.id,
      renamed.id,
      legacy.id,
    ]);
    expect(list[0]).toMatchObject({
      title: "和 HTML 有什么区别",
      anchorId: "concept-dom",
      anchorTitle: "DOM",
      count: 1,
      time: "2026-10-12T08:00:00.000Z",
    });
    // The kickoff's hidden instructions never become the title.
    expect(list[1]).toMatchObject({
      title: KICKOFF_MESSAGE,
      anchorTitle: "起点问题",
    });
    expect(list[2].title).toBe("DOM 是什么？");
    // A renamed conversation keeps its own title and counts its extra cards.
    expect(list[3]).toMatchObject({ title: renamed.title, extra: 2, count: 0 });
    // Old notes without createdAt fall back to the board's time.
    expect(list[4]).toMatchObject({
      title: "一张旧的自由批注",
      anchorId: null,
      anchorTitle: "自由批注",
      time: b.updatedAt,
    });
  });

  it("「/」 on a card opens its latest conversation", () => {
    const { b, newer } = board();
    expect(latestNoteOn(b, { kind: "node", id: "concept-dom" })?.id).toBe(
      newer.id,
    );
    expect(
      latestNoteOn(b, { kind: "node", id: "concept-render" }),
    ).toBeUndefined();
  });

  it("formats times relative to today", () => {
    const now = new Date(2026, 9, 18, 17, 0);
    expect(sessionClock(new Date(2026, 9, 18, 9, 5).toISOString(), now)).toBe(
      "09:05",
    );
    expect(sessionClock(new Date(2026, 9, 17, 22, 30).toISOString(), now)).toBe(
      "昨天 22:30",
    );
    expect(sessionClock(new Date(2026, 9, 3, 8).toISOString(), now)).toBe(
      "10月3日",
    );
    expect(sessionClock(new Date(2025, 0, 2).toISOString(), now)).toBe(
      "2025年1月2日",
    );
    expect(sessionClock("nope", now)).toBe("");
  });
});
