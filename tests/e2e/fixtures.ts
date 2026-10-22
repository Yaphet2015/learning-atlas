/** Seed boards for e2e and the design screenshots: the 重疾险 example from studyboard-fixes. */
const T = "2026-10-18T10:42:00.000Z";
const node = (
  id: string,
  title: string,
  body: string,
  parentId: string | null,
  order: number,
  status: "unseen" | "exploring" | "explained",
  extra: Record<string, unknown> = {},
) => ({ id, kind: "concept", title, body, parentId, order, status, ...extra });

export const INSURANCE_ANSWER = `好，先给你骨架。一份重疾险条款，表面几十页，其实只有**四块**：

1. **保什么**：病种数量、重疾 / 中症 / 轻症的分层、每种病的定义。
2. **什么时候不赔**：等待期、免责条款、如实告知。
3. **怎么赔**：赔付次数、间隔期、赔付比例、年龄限制。
4. **钱和手续**：保额保费、保费豁免、犹豫期、理赔材料。

类比：像看租房合同：先找“什么情况下押金不退”，比先看租金更省心。条款里“不赔”的部分，价值最高。

小练习：随手打开一个产品页，只找三个数字——等待期多少天、轻症赔保额的百分之几、重疾能赔几次。

检查：这四块里，哪块最容易被销售话术盖住？`;

export function insuranceBoard(withLevel = true) {
  const root = node(
    "topic-ci",
    "重疾险有哪些比较重要的条款（教会我 12 条及以上）",
    "这是你的学习起点。",
    null,
    0,
    "exploring",
    { expanded: true },
  );
  const level = withLevel
    ? [
        node(
          "c-what",
          "保什么",
          "病种数量、重疾 / 中症 / 轻症怎么分层、每种病的定义写在哪。",
          root.id,
          0,
          "exploring",
          { hand: "2 条批注" },
        ),
        node(
          "c-when-not",
          "什么时候不赔",
          "等待期、免责条款、如实告知——决定这份保单会不会落空。",
          root.id,
          1,
          "unseen",
        ),
        node(
          "c-how",
          "怎么赔",
          "赔付次数、间隔期、赔付比例、年龄限制。",
          root.id,
          2,
          "unseen",
        ),
        node(
          "c-money",
          "钱和手续",
          "保额保费、保费豁免、犹豫期、理赔材料。",
          root.id,
          3,
          "unseen",
        ),
        node(
          "c-tiers",
          "重疾、中症、轻症怎么分",
          "同一种病按严重程度分三档，每档的赔付比例不同，合同附表里有每档的病种清单。",
          "c-what",
          0,
          "explained",
          {
            hand: "能讲清楚了",
            visual: {
              kind: "comparison",
              title: "三档怎么赔",
              labels: ["重疾 100%", "中症 50%", "轻症 30%"],
              caption: "比例因产品而异，以合同为准。",
              basis: "literal",
            },
          },
        ),
        node(
          "c-wait",
          "等待期是什么",
          "投保后的一段观察期，这期间确诊通常不赔。",
          "c-when-not",
          0,
          "unseen",
        ),
      ]
    : [];
  return {
    version: 2,
    id: "board-ci",
    title: "重疾险有哪些比较重要的条款（教会我 12 条及以上）",
    topic: "重疾险有哪些比较重要的条款（教会我 12 条及以上）",
    kind: "ai",
    createdAt: T,
    updatedAt: T,
    nodes: [root, ...level],
    relations: [],
    notes: [
      {
        id: "note-kickoff",
        title: "带我起步",
        text: "",
        position: { x: 0, y: 0 },
        attachedTo: { kind: "node", id: root.id },
        messages: [
          {
            id: "m1",
            role: "user",
            text: "我想从这里开始学，带我起步吧。",
            createdAt: T,
          },
          {
            id: "m2",
            role: "assistant",
            text: INSURANCE_ANSWER,
            createdAt: T,
          },
        ],
      },
    ],
    scene: {
      width: 180,
      color: "#E9AE7E",
      prediction: "",
      explanation: "",
      changed: null,
    },
  };
}

/** One card per mastery state, side by side, for the mastery close-up. */
export function masteryBoard() {
  const root = node("topic-m", "等待期", "", null, 0, "exploring");
  const body = "投保后的一段观察期，这期间确诊通常不赔，只退已交的保费。";
  return {
    ...insuranceBoard(false),
    id: "board-m",
    title: "掌握度",
    topic: "等待期",
    nodes: [
      root,
      node("m-u", "等待期是什么", body, root.id, 0, "unseen"),
      node("m-e", "等待期是什么", body, root.id, 1, "exploring", {
        hand: "2 条批注",
      }),
      node("m-x", "等待期是什么", body, root.id, 2, "explained", {
        hand: "能讲清楚了 · 10 月 18 日",
      }),
    ],
    notes: [],
  };
}

/** The insurance board with a confirmed plan: 保什么 covered, two blocks missing. */
export function plannedBoard() {
  const board: any = insuranceBoard(true);
  board.nodes.find((n: any) => n.id === "c-what").planBlock = "b-what";
  board.plan = {
    status: "confirmed",
    intent: "concept",
    goal: "学完后，能读懂一份重疾险条款的关键部分。",
    learner: "按初学者处理",
    blocks: [
      { id: "b-what", title: "保什么", why: "先知道保障范围", parent: null, prerequisites: [], core: true },
      { id: "b-tiers", title: "多次赔付的间隔期", why: "分层决定赔多少", parent: "b-what", prerequisites: [], core: true },
      { id: "b-wait", title: "等待期与免责", why: "决定会不会落空", parent: null, prerequisites: ["b-what"], core: true },
    ],
    outOfScope: [],
  };
  return board;
}


/** The insurance board on a numbered route: stop 1 sealed, stop 2 carries a choice check question. */
export function routedBoard() {
  const board: any = insuranceBoard(true);
  board.route = ["c-what", "c-when-not", "c-how", "c-money"];
  for (const n of board.nodes) if (n.status === "explained") n.status = "exploring";
  const what = board.nodes.find((n: any) => n.id === "c-what");
  Object.assign(what, { status: "explained", seal: "test", beat: "done" });
  const when = board.nodes.find((n: any) => n.id === "c-when-not");
  Object.assign(when, {
    status: "unseen",
    title: "等待期内确诊，保险公司通常不赔",
    body: "合同生效后有一段等待期，比如 90 天（示例），这期间确诊合同列明的重疾，通常只退保费不赔保额。它防的是“带病投保”：知道自己快病了才去买。",
    check: {
      q: "小李投保第 2 个月确诊合同列明的重疾，最可能卡在哪一条？",
      options: ["疾病定义", "等待期", "免责条款"],
    },
    meta: {
      gate: {
        newIdea: "SECRET-NEWIDEA 等待期防带病投保",
        addsBeyond: "SECRET-ADDSBEYOND 比父卡多了等待期",
        claims: ["SECRET-CLAIM 等待期内确诊通常不赔"],
        simParent: 0.123,
        simMax: 0.456,
        decidedBy: "judge",
        judgeAdds: "SECRET-JUDGE",
      },
      check: { keyPoints: ["SECRET-KEYPOINT 等待期内确诊不赔"], answer: 1 },
    },
  });
  return board;
}
