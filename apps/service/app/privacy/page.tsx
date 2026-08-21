import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "隐私政策 · Study Desk",
  description: "Study Desk 对账号、Google 登录、云同步和本地数据的处理说明。",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage
    eyebrow="Privacy"
    title="隐私政策"
    summary="我们只收集提供账号与同步服务所必需的信息，并明确区分保存在电脑上的数据与用户主动启用的云端数据。"
    updated="更新日期：2026 年 8 月 20 日"
    sections={[
      { title: "1. 我们处理哪些信息", items: [
        "账号信息：Supabase 用户 ID、已验证邮箱和已绑定的登录方式。",
        "Google 基础身份信息：仅限 openid、email、profile，用于登录和账号关联。我们不会请求或读取 Google Drive、Gmail、通讯录等数据。",
        "会员与交易状态：套餐、权益期限、Paddle 交易标识和支付结果。Study Desk 不接触或保存银行卡、支付宝或微信支付凭据。",
        "云同步数据：仅在用户开始试用或持有有效会员并启用同步时，保存用户自建知识库、学习记录和可同步设置。",
        "服务运行信息：为防止滥用、排查故障和保障安全而产生的必要请求日志。",
      ] },
      { title: "2. 本地数据与加密迁移", paragraphs: [
        "默认情况下，自建知识库和学习数据保存在用户设备。免费用户可以导出 .studydesk 加密迁移文件，并在另一台 Study Desk 桌面端导入。付费社区知识库、授权信息、账号令牌、迁移密钥和本机配置不会写入迁移文件或云同步快照。",
        "桌面端把账号会话保存在操作系统安全存储中。Google OAuth 的长期令牌不会放入 study-desk:// 深链；深链只携带短期、一次性且可过期的交接码。",
      ] },
      { title: "3. 云同步、保留与删除", paragraphs: [
        "试用期或会员期内可以上传和下载同步数据。权益到期后进入 30 天只读宽限期，期间仍可拉取和导出，但不能上传；宽限期结束后，系统会删除云端同步文档及历史版本。",
        "OAuth 流程记录只用于完成登录或绑定，并受短期有效期、加密保存和一次性消费限制。支付和会员记录会按履约、退款、争议处理及法律义务所需期限保留。",
      ] },
      { title: "4. 服务提供方", paragraphs: [
        "Study Desk 使用 Supabase 提供身份认证和数据库服务，Vercel 承载官网与 API，Paddle 处理付款，GitHub 承载桌面安装包。各服务商会按其自身隐私政策处理为提供服务所必需的信息。",
      ] },
      { title: "5. 用户选择与安全", paragraphs: [
        "用户可以不登录并仅使用本地功能，也可以在设置中退出账号或解除 Google 身份（前提是仍保留邮箱登录方式）。如需查询、更正或删除账号相关数据，请通过项目的 GitHub Issues 联系我们。",
        "我们采用访问控制、短期授权流程、加密存储和最小权限等措施降低风险，但任何联网服务都无法保证绝对安全。请妥善保护邮箱、Google 账号和设备访问权限。",
      ] },
      { title: "6. 政策更新与联系", paragraphs: [
        "功能、供应商或法律要求变化时，我们可能更新本政策，并在本页标注新的更新日期。隐私问题、账号数据请求或安全问题可通过 GitHub 项目的 Issues 提交；请勿在公开 Issue 中粘贴访问令牌、支付信息或其他秘密。",
      ] },
    ]}
  />;
}
