import { DownloadPanel } from "./download-panel";

const GITHUB_URL = "https://github.com/JikoSchnee/Study-Desk";
const RELEASES_URL = `${GITHUB_URL}/releases`;

function ArrowUpRight() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9" /></svg>;
}

function CheckMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>;
}

export default function HomePage() {
  return <main className="site-shell">
    <nav className="topbar" aria-label="主要导航">
      <a className="brand" href="#top" aria-label="Study Desk 首页"><span>S</span><strong>Study Desk</strong></a>
      <div className="nav-links">
        <a href="/app">浏览器打开</a>
        <a href="#features">学习方式</a>
        <a href="#download">下载</a>
        <a className="nav-github" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub <ArrowUpRight /></a>
      </div>
    </nav>

    <section className="hero" id="top">
      <div className="hero-copy">
        <div className="eyebrow"><span>✓</span> 本地优先的知识训练工具</div>
        <h1>别只收藏知识。<em>把它练会。</em></h1>
        <p className="hero-lead">把零散资料整理成自己的知识卡片，通过一次次主动回忆，让学过的内容真正变成随时能说出口的答案。</p>
        <div className="hero-actions">
          <a className="primary-action" href="#download">免费下载桌面版</a>
          <a className="secondary-action" href="/app">使用浏览器版</a>
        </div>
        <p className="platform-note">支持 Windows 10/11 与 Apple Silicon Mac</p>
      </div>

      <div className="hero-visual" aria-label="一张正在完成学习任务的知识卡片">
        <div className="visual-orbit orbit-one" />
        <div className="visual-orbit orbit-two" />
        <div className="streak-pill"><span>🔥</span><strong>连续学习 7 天</strong></div>
        <article className="study-card">
          <div className="card-topline"><span>今日练习</span><strong>3 / 5</strong></div>
          <div className="progress-track"><i /></div>
          <div className="card-character" aria-hidden="true">
            <span className="character-tab tab-left" /><span className="character-tab tab-right" />
            <div className="character-face"><i className="eye eye-left" /><i className="eye eye-right" /><b /></div>
            <div className="character-lines"><i /><i /><i /></div>
          </div>
          <p>缓存穿透是什么？</p>
          <button type="button" tabIndex={-1}>我能说出来了 <CheckMark /></button>
        </article>
        <div className="xp-pill"><strong>+20</strong><span>学习经验</span></div>
      </div>
    </section>

    <section className="trust-row" aria-label="产品特点">
      <div><span>01</span><p><strong>本地优先</strong>自建内容保存在电脑</p></div>
      <div><span>02</span><p><strong>加密迁移</strong>跨设备安全转移</p></div>
      <div><span>03</span><p><strong>会员同步</strong>账号自动同步进度</p></div>
    </section>

    <section className="feature-section" id="features">
      <header>
        <p className="kicker">简单，但真的有效</p>
        <h2>每天向“真正掌握”<br />前进一点点</h2>
        <p>Study Desk 把整理、回忆和复习串成一条清楚的学习路径。</p>
      </header>
      <div className="feature-path">
        <article className="feature-card feature-organize"><div className="feature-icon"><span>✦</span></div><div><small>第一步</small><h3>整理自己的知识库</h3><p>把文档、笔记和经验拆成有问题、有要点、有提示的知识卡片。</p></div></article>
        <span className="path-line" aria-hidden="true" />
        <article className="feature-card feature-practice"><div className="feature-icon"><span>↻</span></div><div><small>第二步</small><h3>先回答，再看答案</h3><p>不看答案先用自己的话讲一遍，让每次练习都真正调用记忆。</p></div></article>
        <span className="path-line" aria-hidden="true" />
        <article className="feature-card feature-carry"><div className="feature-icon"><span>✓</span></div><div><small>第三步</small><h3>安全带到每台电脑</h3><p>使用加密迁移文件离线转移；会员还可以通过账号自动同步。</p></div></article>
      </div>
    </section>

    <section className="download-section">
      <div className="download-intro">
        <div className="download-badge">准备好开始了吗？</div>
        <h2>把学习桌，<br />放进你的电脑。</h2>
        <p>下载安装后即可创建第一套知识库。本地优先保存，不登录也能整理和练习。</p>
        <ul><li><CheckMark /> 免费使用本地知识库</li><li><CheckMark /> 支持加密迁移文件</li><li><CheckMark /> 可选会员账号同步</li></ul>
        <div className="tiny-links"><a href={RELEASES_URL} target="_blank" rel="noreferrer">查看全部版本 <ArrowUpRight /></a><a href={`${GITHUB_URL}#下载`} target="_blank" rel="noreferrer">阅读安装说明 <ArrowUpRight /></a></div>
      </div>
      <DownloadPanel />
    </section>

    <section className="security-note" aria-labelledby="security-title">
      <div className="warning-mark">!</div>
      <div><p className="kicker">安装提醒</p><h2 id="security-title">安装包目前尚未签名或公证</h2><p>Windows SmartScreen 或 macOS 可能显示安全提示。请只从本页指向的官方 GitHub Releases 下载。</p></div>
      <a href={`${GITHUB_URL}#下载`} target="_blank" rel="noreferrer">查看解决方法 <ArrowUpRight /></a>
    </section>

    <footer>
      <a className="brand footer-brand" href="#top"><span>S</span><strong>Study Desk</strong></a>
      <p>把知识练成自己的。</p>
      <div><a href="/app">浏览器版</a><a href="/privacy">隐私政策</a><a href="/terms">服务条款</a><a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a><a href={RELEASES_URL} target="_blank" rel="noreferrer">Releases</a><span><i /> 云服务在线</span></div>
    </footer>
  </main>;
}
