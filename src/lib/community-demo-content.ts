import "server-only";

const cards: Record<string, Array<{ question: string; answerPoints: string[] }>> = {
  "system-design-map": [
    { question: "如何设计一个支持千万用户的短链系统？", answerPoints: ["先明确读写比例、数据规模和延迟目标，再确定短码生成与冲突处理。", "按写入链路、读取链路和故障模式拆解缓存、数据库与异步处理。", "最后补充热点、容灾、监控和容量扩展策略。"] },
    { question: "缓存穿透、击穿和雪崩分别如何处理？", answerPoints: ["先分别定义三类问题的触发条件，避免混用术语。", "穿透可用布隆过滤器与空值缓存，击穿关注热点互斥和逻辑过期。", "雪崩需要随机过期、限流降级与缓存集群的高可用设计。"] },
  ],
  "product-sense-starter": [
    { question: "如何判断一个需求值得做？", answerPoints: ["先确认目标用户和问题发生频率，避免把反馈直接等同于需求。", "评估用户价值、业务价值、实现成本和机会成本。", "用最小实验验证关键假设，并预先定义成功指标。"] },
    { question: "新功能上线后应该关注哪些指标？", answerPoints: ["从目标行为定义北极星指标和护栏指标。", "同时观察覆盖、采用、留存和任务成功率。", "分群排查平均值掩盖的问题，并和上线前基线比较。"] },
  ],
  "behavioral-stories": [
    { question: "讲一次你推动困难项目落地的经历。", answerPoints: ["用一句话交代背景和真正困难，不铺陈无关细节。", "明确你的责任、判断和具体动作，避免只说“我们”。", "用可验证结果收尾，并补充反思和迁移到下一次的做法。"] },
    { question: "当团队意见不一致时，你是怎么处理的？", answerPoints: ["先还原分歧背后的目标、信息和风险偏好。", "说明你如何补充证据、组织讨论并明确决策人。", "交代最终选择、执行结果以及你对关系和信任的维护。"] },
  ],
  "frontend-deep-dive": [
    { question: "浏览器从输入 URL 到页面可交互经历了什么？", answerPoints: ["从导航、DNS、连接与 TLS 开始描述网络阶段。", "解释服务端响应、HTML 解析、资源调度与渲染流水线。", "最后区分首屏可见、可交互和指标采集的时点。"] },
    { question: "React 并发渲染解决了什么问题？", answerPoints: ["先说明并发不是并行执行，而是可中断、可恢复的渲染调度。", "结合更新优先级解释为什么输入响应不会被重渲染长期阻塞。", "补充并发特性对纯函数组件和副作用管理提出的要求。"] },
  ],
};

export function getCommunityDemoCard(knowledgeBaseId: string, position: number) {
  const card = cards[knowledgeBaseId]?.[position];
  return card ? { id: `demo-${knowledgeBaseId}-${position}`, position, question: card.question, answerPoints: card.answerPoints, note: "演示数据不会进入本地知识库。", version: 1 } : null;
}
