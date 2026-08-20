import { DownloadPanel } from "./download-panel";

const GITHUB_URL = "https://github.com/JikoSchnee/Study-Desk";
const RELEASES_URL = `${GITHUB_URL}/releases`;

function ArrowUpRight() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9" /></svg>;
}

export default function HomePage() {
  return <main>
    <nav className="topbar" aria-label="主要导航">
      <a className="brand" href="#top" aria-label="Study Desk 首页"><span>S</span><strong>Study Desk</strong></a>
      <div><a href="#features">它能做什么</a><a className="github-link" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub <ArrowUpRight /></a></div>
    </nav>

    <section className="hero" id="top">
      <div className="hero-copy">
        <div className="eyebrow"><span /> 你的桌面知识工作台</div>
        <h1>把学过的知识，<em>练成自己的。</em></h1>
        <p className="hero-lead">不是把资料越存越多，而是把零散内容整理成卡片，在一次次回忆里，变成随时能说出口的答案。</p>
        <div className="hero-actions"><a className="primary-action" href="#download">下载桌面版 <span>↓</span></a><a className="text-action" href={GITHUB_URL} target="_blank" rel="noreferrer">查看源代码 <ArrowUpRight /></a></div>
        <div className="local-first"><i>✓</i><span><strong>本地优先</strong>你的自建知识库保存在自己的电脑上</span></div>
      </div>

      <div className="desk-scene" aria-label="从资料到知识卡片，再到熟练表达的学习过程">
        <div className="desk-shadow" />
        <article className="paper paper-notes"><span className="paper-clip" /><small>今天想弄懂</small><h3>缓存穿透<br />到底是什么？</h3><div className="scribble" /><p>先用自己的话回答，<br />再逐条核对要点。</p></article>
        <article className="paper paper-card"><span className="card-index">CARD · 024</span><h3>缓存穿透</h3><ul><li>查询不存在的数据</li><li>请求绕过缓存</li><li>保护：布隆过滤器</li></ul><b>会说了 ✓</b></article>
        <div className="practice-stamp">练过<br /><strong>3</strong> 次</div>
        <div className="pencil" />
      </div>
    </section>

    <section className="feature-section" id="features">
      <header><p className="kicker">一条完整的学习路径</p><h2>从“我收藏了”，到“我真的会了”</h2></header>
      <div className="feature-grid">
        <article><span className="step-number">01</span><div className="feature-mark mark-blue">收</div><h3>整理成自己的知识库</h3><p>把文档、笔记和经验拆成有问题、有要点、有提示的知识卡片。</p></article>
        <article><span className="step-number">02</span><div className="feature-mark mark-yellow">练</div><h3>在回忆中反复练习</h3><p>按学习节奏安排新卡与复习，不看答案先说一遍，记忆才真正发生。</p></article>
        <article><span className="step-number">03</span><div className="feature-mark mark-green">带</div><h3>安全迁移，会员同步</h3><p>免费导出加密迁移文件；会员可用账号在多台电脑同步自建内容与进度。</p></article>
      </div>
    </section>

    <section className="download-section">
      <div className="download-intro"><p className="kicker">现在开始</p><h2>给知识留一张<br />真正能坐下来的桌子。</h2><p>Windows 与 Apple Silicon macOS 可用。下载、安装，然后建立第一套属于你的知识库。</p><div className="tiny-links"><a href={RELEASES_URL} target="_blank" rel="noreferrer">全部版本 <ArrowUpRight /></a><a href={`${GITHUB_URL}#下载`} target="_blank" rel="noreferrer">安装说明 <ArrowUpRight /></a></div></div>
      <DownloadPanel />
    </section>

    <section className="security-note" aria-labelledby="security-title"><div className="warning-mark">!</div><div><p className="kicker">安装前请留意</p><h2 id="security-title">当前安装包尚未签名或公证</h2><p>Windows SmartScreen 或 macOS 可能显示安全提示，这是当前版本的预期情况。请只从本页指向的官方 GitHub Releases 下载，并按照安装说明操作。</p></div><a href={`${GITHUB_URL}#下载`} target="_blank" rel="noreferrer">阅读下载说明 <ArrowUpRight /></a></section>

    <footer><a className="brand footer-brand" href="#top"><span>S</span><strong>Study Desk</strong></a><p>把知识沉淀成能说出口的答案。</p><div><a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a><a href={RELEASES_URL} target="_blank" rel="noreferrer">Releases</a><span>云服务在线</span></div></footer>
  </main>;
}
