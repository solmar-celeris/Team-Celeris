import './dashboard-preview.css';

const metrics = [
  { label: 'Atividades', value: '58', note: 'itens de exemplo', tone: 'blue' },
  { label: 'Concluídas', value: '24', note: '44% das válidas', tone: 'green' },
  { label: 'Em andamento', value: '13', note: 'na semana demonstrativa', tone: 'sky' },
  { label: 'Atrasadas', value: '4', note: 'pedem atenção', tone: 'orange' },
];

const activities = [
  { code: 'MEC-08', title: 'Revisão do conjunto de propulsão', area: 'Mecânica Naval', due: '10 nov', status: 'Em andamento', tone: 'sky' },
  { code: 'ENE-04', title: 'Conferir dimensionamento do painel', area: 'Energia', due: '11 nov', status: 'Pendente', tone: 'orange' },
  { code: 'TEL-02', title: 'Validar coleta de telemetria', area: 'Telemetria', due: '12 nov', status: 'Concluída', tone: 'green' },
];

const weeklyBars = [36, 47, 43, 58, 51, 68, 61, 74, 66, 82, 76, 52];

const navItems = [
  { number: '01', label: 'Semana' },
  { number: '02', label: 'Painel' },
  { number: '03', label: 'Atividades' },
  { number: '04', label: 'Arquivos' },
  { number: '05', label: 'Comunicados' },
];

export default function DashboardPreview() {
  return (
    <div className="dashboard-demo">
      <div className="demo-notice" role="status">
        <span className="demo-notice-mark" aria-hidden="true">i</span>
        <p><strong>Prévia visual · dados fictícios.</strong> Esta tela não está conectada ao Supabase e não representa dados reais da equipe.</p>
        <a href="/" className="demo-exit">Voltar ao login</a>
      </div>

      <header className="demo-header">
        <a className="demo-brand" href="/" aria-label="SolMar Celeris — voltar ao login">
          <img src="/manus-storage/celeris-logo_054fb93a.png" alt="Logo SolMar Celeris" />
          <span className="demo-brand-caption">UFCI/RJ <small>GESTÃO DA EQUIPE</small></span>
        </a>
        <div className="demo-header-right">
          <span className="demo-cycle"><i aria-hidden="true" /> CICLO SEMANAL</span>
          <div className="demo-user"><span className="demo-avatar">SC</span><span><strong>Conta demonstrativa</strong><small>Sem sessão real</small></span></div>
        </div>
      </header>

      <div className="demo-layout">
        <aside className="demo-sidebar" aria-label="Navegação demonstrativa">
          <p className="demo-side-label">ESPAÇO DA EQUIPE</p>
          <nav className="demo-nav">
            {navItems.map((item) => (
              <button key={item.label} type="button" className={`demo-nav-item${item.label === 'Painel' ? ' is-active' : ''}`} aria-current={item.label === 'Painel' ? 'page' : undefined}>
                <span className="demo-nav-number">{item.number}</span>{item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="demo-main">
          <section className="demo-welcome">
            <div>
              <p className="demo-eyebrow">SEMANA DE DEMONSTRAÇÃO · 09–15 NOV 2026</p>
              <h1>Bom dia, equipe.</h1>
              <p className="demo-subtitle">Uma visão rápida do que avançou e do que merece atenção nesta semana.</p>
            </div>
            <button className="demo-week-select" type="button" disabled><span>SEMANA</span><strong>01 <small>de 60</small></strong><i aria-hidden="true">⌄</i></button>
          </section>

          <section className="demo-metrics" aria-label="Indicadores de exemplo">
            {metrics.map((metric, index) => (
              <article key={metric.label} className={`demo-metric tone-${metric.tone}`}>
                <div className="demo-metric-head"><span>{metric.label}</span><span className="demo-metric-index">0{index + 1}</span></div>
                <strong className="demo-metric-value">{metric.value}</strong>
                <span className="demo-metric-note">{metric.note}</span>
              </article>
            ))}
          </section>

          <div className="demo-insight-row">
            <section className="demo-card demo-execution-card">
              <div className="demo-card-heading"><div><p className="demo-card-kicker">RITMO DA EQUIPE</p><h2>Execução semanal</h2></div><span className="demo-card-tag">EXEMPLO</span></div>
              <div className="demo-execution-content">
                <div className="demo-progress-ring" role="img" aria-label="52 por cento de execução de exemplo"><div><strong>52<span>%</span></strong><small>execução</small></div></div>
                <div className="demo-execution-copy"><strong>Semana em movimento</strong><p>24 concluídas de 46 atividades esperadas e aplicáveis nesta demonstração.</p><div className="demo-legend"><span><i className="legend-done" /> Concluídas</span><span><i className="legend-open" /> Em aberto</span></div></div>
              </div>
              <div className="demo-weekly-chart" role="img" aria-label="Barras ilustrativas das últimas doze semanas">
                {weeklyBars.map((height, index) => <span key={`${height}-${index}`} className={index === weeklyBars.length - 1 ? 'is-current' : ''} style={{ height: `${height}%` }} title={`Semana ${index + 1}: dado demonstrativo`} />)}
              </div>
              <div className="demo-chart-caption"><span>12 semanas</span><span>Agora</span></div>
            </section>

            <section className="demo-card demo-core-card">
              <div className="demo-card-heading"><div><p className="demo-card-kicker">ACOMPANHAMENTO</p><h2>Visão por núcleo</h2></div><span className="demo-more" aria-hidden="true">···</span></div>
              <div className="demo-core-row"><div className="demo-core-heading"><span><i className="core-dot core-management" />Núcleo de Gestão</span><strong>68%</strong></div><div className="demo-bar-track"><span className="demo-bar-fill fill-management" style={{ width: '68%' }} /></div><small>12 de 18 atividades no ritmo</small></div>
              <div className="demo-core-row"><div className="demo-core-heading"><span><i className="core-dot core-engineering" />Núcleo de Engenharia</span><strong>54%</strong></div><div className="demo-bar-track"><span className="demo-bar-fill fill-engineering" style={{ width: '54%' }} /></div><small>22 de 40 atividades no ritmo</small></div>
              <div className="demo-core-foot"><span>4 atrasadas</span><span>·</span><span>3 semanas sem atualização</span></div>
            </section>
          </div>

          <section className="demo-card demo-activity-card">
            <div className="demo-card-heading demo-activity-heading"><div><p className="demo-card-kicker">PRÓXIMOS PASSOS</p><h2>Atividades em destaque</h2></div><button type="button" className="demo-view-all" disabled>Ver todas <span aria-hidden="true">→</span></button></div>
            <div className="demo-activity-list">
              {activities.map((activity) => (
                <article key={activity.code} className="demo-activity-row">
                  <span className="demo-activity-code">{activity.code}</span>
                  <div className="demo-activity-name"><strong>{activity.title}</strong><span>{activity.area}</span></div>
                  <time dateTime={`2026-11-${activity.due.split(' ')[0]}`}>Prazo <strong>{activity.due}</strong></time>
                  <span className={`demo-status status-${activity.tone}`}><i />{activity.status}</span>
                </article>
              ))}
            </div>
            <p className="demo-table-footnote">Nomes, prazos e indicadores acima são ilustrativos; os controles não salvam alterações.</p>
          </section>

          <footer className="demo-footer"><span>UFCI/RJ</span><i />SolMar Celeris <small>· PAINEL EM DEMONSTRAÇÃO</small></footer>
        </main>
      </div>
    </div>
  );
}
