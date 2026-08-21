import Link from "next/link";

type LegalSection = { title: string; paragraphs?: string[]; items?: string[] };

export function LegalPage({ eyebrow, title, summary, updated, sections }: {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
}) {
  return <main className="legal-shell">
    <nav className="legal-nav" aria-label="法律页面导航">
      <Link className="brand" href="/"><span>S</span><strong>Study Desk</strong></Link>
      <Link className="legal-back" href="/">返回首页</Link>
    </nav>
    <article className="legal-document">
      <header className="legal-header">
        <p className="kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{summary}</p>
        <time>{updated}</time>
      </header>
      <div className="legal-content">
        {sections.map((section) => <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
        </section>)}
      </div>
    </article>
    <footer className="legal-footer"><p>Study Desk · 把知识练成自己的</p><div><Link href="/privacy">隐私政策</Link><Link href="/terms">服务条款</Link><a href="https://github.com/JikoSchnee/Study-Desk/issues" target="_blank" rel="noreferrer">联系与反馈</a></div></footer>
  </main>;
}
