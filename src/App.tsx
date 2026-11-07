import { lazy, Suspense, useEffect, useState } from 'react';
import AuthPanel from './features/auth/AuthPanel';

const DashboardPreview = import.meta.env.DEV
  ? lazy(() => import('./features/dashboard/DashboardPreview'))
  : null;

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = window.localStorage.getItem('team-celeris-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('team-celeris-theme', theme);
  }, [theme]);

  const showDashboardDemo =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === 'dashboard';

  if (showDashboardDemo && DashboardPreview) {
    return (
      <Suspense fallback={<p role="status">Abrindo a prévia…</p>}>
        <DashboardPreview />
      </Suspense>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="SolMar Celeris — início">
          <img
            className="brand-logo"
            src="/assets/solmar-celeris-site-logo.png"
            alt="Logo SolMar Celeris"
          />
          <span className="brand-name">SolMar Celeris</span>
        </a>
        <div className="top-actions">
          <span className="connection-pill"><i /> ACESSO RESTRITO</span>
          <button
            className="theme-toggle"
            onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
            title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
            type="button"
          >
            {theme === 'light' ? '☾' : '☼'}
          </button>
        </div>
      </header>

      <main id="inicio" className="auth-main">
        <section className="auth-story" aria-label="Sobre o espaço da equipe">
          <img className="auth-app-wordmark" src="/assets/teamceleris-app-wordmark.png" alt="Team Celeris" />
          <h1>O próximo marco começa <em>aqui.</em></h1>
          <p className="intro-copy">Um espaço compartilhado para acompanhar as entregas, as semanas e o avanço do barco solar.</p>
        </section>

        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="auth-panel-top">
            <span className="auth-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z" /><path d="M12 14v3" /></svg>
            </span>
            <span className="auth-overline">PORTAL DA EQUIPE</span>
          </div>
          <AuthPanel theme={theme} onThemeChange={setTheme} />
        </section>
      </main>

      <footer className="page-footer" aria-label="Identidade do projeto">
        <img className="page-footer-logo" src="/assets/solmar-celeris-site-logo.png" alt="Logo oficial SolMar Celeris" />
        <span className="footer-workspace-label">SOLMAR CELERIS WORKSPACE</span>
        <span className="footer-line" />
        <span className="footer-institution">UFCI/RJ</span>
      </footer>
    </div>
  );
}
