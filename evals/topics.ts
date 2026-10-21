/**
 * Fixed evaluation topics: 6 question types × 2. Each checklist lists what a
 * learner must meet on the board to be well served; written by hand, not by a model.
 */
export type TopicType =
  | "concept"
  | "mechanism"
  | "decision"
  | "howto"
  | "learning-path"
  | "compare";

export interface EvalTopic {
  id: string;
  type: TopicType;
  topic: string;
  mustHave: string[];
}

export const TOPICS: EvalTopic[] = [
  {
    id: "opportunity-cost",
    type: "concept",
    topic: "什么是机会成本",
    mustHave: [
      "定义：放弃的次优选择的价值（不是所有放弃项之和）",
      "与会计成本/显性成本的区别（隐性成本）",
      "沉没成本不是机会成本，决策时应忽略",
      "生活中的具体例子（如读研 vs 工作、时间的价值）",
      "边际思维：在边际上比较收益与机会成本",
      "常见误区：把机会成本当成实际支出的钱",
      "应用：比较优势/分工与机会成本的关系",
    ],
  },
  {
    id: "entropy",
    type: "concept",
    topic: "熵到底是什么",
    mustHave: [
      "热力学熵：dS = δQ/T 的宏观定义",
      "统计力学：S = k ln W，微观状态数",
      "熵增原理/热力学第二定律及孤立系统前提",
      "‘熵=混乱度’的直觉及其局限",
      "信息熵（香农）与热力学熵的联系与区别",
      "时间箭头与熵",
      "局部熵减（生命、冰箱）不违反第二定律的原因",
    ],
  },
  {
    id: "attention",
    type: "mechanism",
    topic: "什么是 transformer 的注意力机制",
    mustHave: [
      "Query/Key/Value 的含义与由输入线性投影得到",
      "缩放点积：softmax(QKᵀ/√d_k)V，及除以 √d_k 的原因",
      "softmax 得到的权重是对 Value 的加权平均",
      "自注意力 vs 交叉注意力",
      "多头注意力：不同子空间关注不同关系",
      "位置编码：注意力本身无顺序信息",
      "因果掩码（decoder 不看未来）",
      "复杂度 O(n²) 与并行性（相对 RNN 的优势）",
    ],
  },
  {
    id: "tcp-handshake",
    type: "mechanism",
    topic: "TCP 三次握手为什么是三次",
    mustHave: [
      "SYN / SYN-ACK / ACK 三个报文及各自携带的序列号",
      "目的：双方都确认对方的收发能力并同步初始序列号（ISN）",
      "为什么两次不够：历史/延迟的 SYN 导致服务器误建连接",
      "为什么不需要四次：SYN 与 ACK 可合并",
      "ISN 随机化与安全（防序列号预测）",
      "连接状态变化（LISTEN, SYN_SENT, SYN_RCVD, ESTABLISHED）",
      "SYN flood 攻击与 SYN cookies",
    ],
  },
  {
    id: "critical-illness",
    type: "decision",
    topic: "重疾险怎么选",
    mustHave: [
      "先判断是否需要及优先级（先医疗险/意外险，家庭支柱优先）",
      "保额怎么定（收入替代，如 3–5 年收入）",
      "保障期限：定期 vs 终身，及保费差异",
      "消费型 vs 返还型（含身故责任）的取舍",
      "轻症/中症、多次赔付等责任是否值得",
      "健康告知与等待期，如实告知的重要性",
      "条款细节：疾病定义（统一定义）、豁免、除外责任",
      "预算控制：保费占收入比例，避免过度投保",
    ],
  },
  {
    id: "laptop-choice",
    type: "decision",
    topic: "程序员买 MacBook 还是 Windows 笔记本",
    mustHave: [
      "先看工作方向（iOS 开发、游戏/.NET、后端/前端）",
      "操作系统与开发环境：Unix 终端 vs WSL",
      "硬件性能与续航（Apple Silicon、内存统一架构）",
      "GPU/CUDA 需求（机器学习）",
      "价格、升级性与内存/存储配置",
      "生态与外设兼容性（公司环境、软件可用性）",
      "二手残值与长期成本",
    ],
  },
  {
    id: "marathon",
    type: "howto",
    topic: "零基础怎么准备第一个全程马拉松",
    mustHave: [
      "时间线：通常 4–6 个月，先打有氧基础/从半马开始",
      "周跑量循序渐进（约每周不超过 10% 增长）",
      "长距离慢跑（LSD）是核心，以及配速区间/心率",
      "恢复周、休息与睡眠",
      "力量训练与伤病预防（膝、跟腱、ITB）",
      "比赛日补给：能量胶、补水、电解质",
      "比赛配速策略（不要起步过快、撞墙）",
      "装备：跑鞋选择与试穿",
    ],
  },
  {
    id: "first-website",
    type: "howto",
    topic: "怎么从零上线一个个人网站",
    mustHave: [
      "确定目的与内容结构",
      "技术选择：静态站点生成器/建站平台/手写 HTML",
      "HTML/CSS 基础或主题模板",
      "域名购买与 DNS 解析",
      "托管/部署（GitHub Pages、Vercel、Netlify 或服务器）",
      "HTTPS 证书",
      "持续更新流程（git 推送即部署）",
      "SEO 与访问统计等上线后事项",
    ],
  },
  {
    id: "microecon",
    type: "learning-path",
    topic: "如何学好微观经济学",
    mustHave: [
      "先修数学：导数/偏导、最优化，图形分析",
      "核心模块：供需与弹性、消费者理论、生产与成本、市场结构",
      "进阶：博弈论、信息不对称、外部性与公共品、一般均衡",
      "学习方法：画图推导、做题，而不是背结论",
      "教材/课程推荐与难度梯度（如曼昆→范里安→MWG）",
      "用现实案例检验理解",
      "常见卡点：边际概念、无差异曲线、均衡思维",
    ],
  },
  {
    id: "english-speaking",
    type: "learning-path",
    topic: "成年人怎么系统地提升英语口语",
    mustHave: [
      "评估现有水平与设定具体目标（场景/考试）",
      "输入：大量可理解输入（听力）是基础",
      "发音：音标、连读、语调，跟读/影子跟读",
      "输出练习：自言自语、复述、录音回听",
      "真人对话练习：语伴/外教/口语课",
      "常用表达与语块积累，而非逐词翻译",
      "克服开口焦虑，持续性与每日时长",
      "反馈与纠错机制",
    ],
  },
  {
    id: "react-vue",
    type: "compare",
    topic: "React 和 Vue 有什么区别",
    mustHave: [
      "设计理念：JSX/函数式 vs 模板/渐进式框架",
      "响应式机制：不可变状态+重新渲染 vs 依赖追踪的响应式",
      "组件写法：Hooks vs Composition API/Options API",
      "生态与官方方案（路由、状态管理：Redux/Zustand vs Pinia）",
      "性能特征与更新粒度",
      "学习曲线与团队/招聘考量",
      "如何根据项目选择",
    ],
  },
  {
    id: "index-vs-active",
    type: "compare",
    topic: "指数基金和主动基金哪个更好",
    mustHave: [
      "定义：被动跟踪指数 vs 基金经理主动选股",
      "费率差异及其长期复利影响",
      "长期统计：多数主动基金跑输基准（SPIVA）",
      "幸存者偏差与业绩持续性问题",
      "不同市场有效性的差异（如 A 股主动基金表现）",
      "风险、分散度与跟踪误差",
      "适合人群与配置建议（核心-卫星）",
    ],
  },
];
