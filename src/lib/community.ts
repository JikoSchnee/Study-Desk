export type CommunityProductKind = "lifetime" | "timed" | "author-subscription";

export type CommunityProduct = {
  id: string;
  kind: CommunityProductKind;
  priceCents: number;
  durationDays?: number;
};

export type CommunityKnowledgeBase = {
  id: string;
  title: string;
  summary: string;
  author: { id: string; name: string; verified: boolean };
  category: string;
  level: string;
  cardCount: number;
  learnerCount: number;
  rating: number;
  accent: "green" | "blue" | "yellow" | "coral";
  tags: string[];
  isFree: boolean;
  products: CommunityProduct[];
  previewQuestions: string[];
};

export type CommunityEntitlement = {
  kind: CommunityProductKind | "free";
  knowledgeBaseId?: string;
  authorId?: string;
  startsAt: string;
  expiresAt: string | null;
  revokedAt?: string | null;
};

export type CommunityOrder = {
  id: string;
  userId: string;
  productId: string;
  status: "pending" | "paid" | "refunded" | "closed";
  paidAt: string | null;
  refundDeadline: string | null;
};

export const communityCatalog: CommunityKnowledgeBase[] = [
  {
    id: "system-design-map",
    title: "系统设计面试地图",
    summary: "从容量估算到高可用，把常见架构题拆成可复述的回答路径。",
    author: { id: "lin-architect", name: "林屿 · 架构师", verified: true },
    category: "技术面试",
    level: "进阶",
    cardCount: 86,
    learnerCount: 1248,
    rating: 4.9,
    accent: "blue",
    tags: ["后端", "架构", "高频题"],
    isFree: false,
    products: [
      { id: "system-design-30d", kind: "timed", priceCents: 2900, durationDays: 30 },
      { id: "system-design-lifetime", kind: "lifetime", priceCents: 9900 },
      { id: "lin-subscription-monthly", kind: "author-subscription", priceCents: 3900, durationDays: 30 },
    ],
    previewQuestions: ["如何设计一个支持千万用户的短链系统？", "缓存穿透、击穿和雪崩分别如何处理？"],
  },
  {
    id: "product-sense-starter",
    title: "产品 Sense 基础训练",
    summary: "用真实场景练习用户洞察、需求优先级和指标拆解。",
    author: { id: "mia-pm", name: "Mia 的产品手记", verified: true },
    category: "产品面试",
    level: "入门",
    cardCount: 42,
    learnerCount: 2310,
    rating: 4.8,
    accent: "green",
    tags: ["产品经理", "案例", "免费"],
    isFree: true,
    products: [],
    previewQuestions: ["如何判断一个需求值得做？", "新功能上线后应该关注哪些指标？"],
  },
  {
    id: "behavioral-stories",
    title: "行为面试故事工坊",
    summary: "把零散经历整理为可信、有细节、能追问的 STAR 故事。",
    author: { id: "yan-career", name: "言舟 Career Lab", verified: true },
    category: "通用能力",
    level: "全阶段",
    cardCount: 64,
    learnerCount: 876,
    rating: 4.9,
    accent: "yellow",
    tags: ["STAR", "表达", "追问"],
    isFree: false,
    products: [
      { id: "behavioral-90d", kind: "timed", priceCents: 4900, durationDays: 90 },
      { id: "behavioral-lifetime", kind: "lifetime", priceCents: 7900 },
      { id: "yan-subscription-monthly", kind: "author-subscription", priceCents: 2900, durationDays: 30 },
    ],
    previewQuestions: ["讲一次你推动困难项目落地的经历。", "当团队意见不一致时，你是怎么处理的？"],
  },
  {
    id: "frontend-deep-dive",
    title: "前端深水区",
    summary: "覆盖浏览器、性能、工程化与 React 原理的进阶表达训练。",
    author: { id: "qiu-frontend", name: "秋原前端札记", verified: false },
    category: "技术面试",
    level: "高级",
    cardCount: 112,
    learnerCount: 592,
    rating: 4.7,
    accent: "coral",
    tags: ["前端", "React", "性能"],
    isFree: false,
    products: [
      { id: "frontend-30d", kind: "timed", priceCents: 3500, durationDays: 30 },
      { id: "frontend-lifetime", kind: "lifetime", priceCents: 10900 },
      { id: "qiu-subscription-monthly", kind: "author-subscription", priceCents: 4500, durationDays: 30 },
    ],
    previewQuestions: ["浏览器从输入 URL 到页面可交互经历了什么？", "React 并发渲染解决了什么问题？"],
  },
];

export function canAccessCommunityKnowledgeBase(input: {
  knowledgeBase: Pick<CommunityKnowledgeBase, "id" | "isFree" | "author">;
  entitlements: CommunityEntitlement[];
  now?: Date;
}) {
  if (input.knowledgeBase.isFree) return true;
  const now = (input.now ?? new Date()).getTime();
  return input.entitlements.some((entitlement) => {
    if (entitlement.revokedAt) return false;
    const startsAt = Date.parse(entitlement.startsAt);
    const expiresAt = entitlement.expiresAt ? Date.parse(entitlement.expiresAt) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(startsAt) || startsAt > now || expiresAt <= now) return false;
    if (entitlement.kind === "author-subscription") return entitlement.authorId === input.knowledgeBase.author.id;
    return entitlement.knowledgeBaseId === input.knowledgeBase.id;
  });
}

export function refundDeadline(paidAt: string) {
  const paid = new Date(paidAt);
  if (Number.isNaN(paid.getTime())) throw new Error("支付时间无效。");
  paid.setUTCDate(paid.getUTCDate() + 3);
  return paid.toISOString();
}

export function canRefundOrder(order: CommunityOrder, now = new Date()) {
  return order.status === "paid" && Boolean(order.refundDeadline) && Date.parse(order.refundDeadline!) > now.getTime();
}

export function formatCommunityPrice(priceCents: number) {
  return `¥${(priceCents / 100).toFixed(priceCents % 100 ? 2 : 0)}`;
}

export function productLabel(product: CommunityProduct) {
  if (product.kind === "lifetime") return "永久拥有";
  if (product.kind === "author-subscription") return "订阅作者 · 30 天";
  return `限时学习 · ${product.durationDays ?? 30} 天`;
}
