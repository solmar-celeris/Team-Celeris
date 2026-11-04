import { useState } from 'react';
import { ArrowUpRight, Brain, Palette, Sparkles, WandSparkles, type LucideIcon } from 'lucide-react';
import recordPrompt from './prompts/registro-de-atividades.md?raw';
import popPrompt from './prompts/procedimento-operacional-padrao.md?raw';
import './ai-shortcuts.css';

type AIService = {
  name: string;
  subtitle: string;
  description: string;
  url: string;
  icon: LucideIcon;
  logo?: string;
  accent: string;
};

const services: AIService[] = [
  {
    name: 'ChatGPT',
    subtitle: 'OpenAI',
    description: 'Assistente para escrita, pesquisa, análise e criação.',
    url: 'https://chatgpt.com/',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPo8DkvRLinkEbv59RTuQUPshPpongI_S55dVBQjo0MA&s=10',
    icon: Sparkles,
    accent: 'blue',
  },
  {
    name: 'Claude AI',
    subtitle: 'Anthropic',
    description: 'Assistente para leitura, raciocínio, escrita e programação.',
    url: 'https://claude.ai/',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTQ5HPalIyZmovDrPi-FaNYiZuEtv3EtiJSznA3VGdO6zxuuLkeDk6fROMI&s=10',
    icon: Brain,
    accent: 'orange',
  },
  {
    name: 'Manus IA',
    subtitle: 'Manus',
    description: 'Assistente de IA para explorar ideias e realizar tarefas.',
    url: 'https://manus.im/',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSdD70EmoWGGA3DAYRQv6d_9Jpa2LFK2IVKAi-70A85rA&s=10',
    icon: WandSparkles,
    accent: 'ocean',
  },
  {
    name: 'Gemini',
    subtitle: 'Google',
    description: 'Assistente de IA do Google para perguntas e criação.',
    url: 'https://gemini.google.com/app',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTSntqd-Z7ClE9ubKSLIHpY1CBq5DNOFQkKDgYqo0mLnw&s=10',
    icon: Sparkles,
    accent: 'sky',
  },
  {
    name: 'Canva',
    subtitle: 'Design e colaboração',
    description: 'Acesse o Canva; o login Google depende da sessão já autorizada no aparelho.',
    url: 'https://www.canva.com/',
    icon: Palette,
    accent: 'canva',
  },
];

const prompts = [
  { id: 'registro', title: 'Registro de Atividades', description: 'Organize relatos, fotos, áudios e documentos no template oficial de registro.', content: recordPrompt },
  { id: 'pop', title: 'Procedimento Operacional Padrão (POP)', description: 'Elabore um POP novo ou revise um procedimento sem perder o histórico.', content: popPrompt },
];

function ServiceMark({ service }: { service: AIService }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const Icon = service.icon;
  return (
    <span className="ai-shortcut-icon" aria-hidden="true">
      {service.logo && !logoFailed
        ? <img className="ai-shortcut-logo" src={service.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} />
        : <Icon />}
    </span>
  );
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('A cópia foi bloqueada pelo navegador. Selecione o texto do prompt e copie manualmente.');
}

export default function AIShortcuts() {
  const [copyMessage, setCopyMessage] = useState('');

  async function handleCopy(title: string, content: string) {
    try {
      await copyText(content);
      setCopyMessage(`${title} copiado. Cole o texto na plataforma de IA que preferir.`);
    } catch {
      setCopyMessage('O navegador bloqueou a cópia. Abra o prompt abaixo e copie o texto manualmente.');
    }
  }

  return (
    <section className="ai-shortcuts" aria-labelledby="ai-shortcuts-title">
      <div className="ai-shortcuts-intro">
        <span className="ai-shortcuts-mark" aria-hidden="true"><Sparkles /></span>
        <div>
          <p className="workspace-kicker">FERRAMENTAS EXTERNAS</p>
          <h2 id="ai-shortcuts-title">Inteligência artificial.</h2>
          <p>Abra uma plataforma ou copie os prompts institucionais de documentação. O acesso e os recursos disponíveis dependem da conta de cada serviço.</p>
        </div>
      </div>
      <div className="ai-shortcuts-grid">
        {services.map((service) => (
          <a
            className={`ai-shortcut-card is-${service.accent}`}
            href={service.url}
            key={service.name}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ServiceMark service={service} />
            <span className="ai-shortcut-copy">
              <span className="ai-shortcut-provider">{service.subtitle}</span>
              <strong>{service.name}</strong>
              <span className="ai-shortcut-description">{service.description}</span>
            </span>
            <ArrowUpRight className="ai-shortcut-arrow" aria-hidden="true" />
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        ))}
      </div>
      <p className="ai-shortcuts-note">Os atalhos abrem sites externos e não compartilham automaticamente dados ou credenciais do SolMar. No Canva, o login com Google só pode reutilizar uma conta que já esteja conectada no navegador/aparelho e autorizada no Canva; este atalho não contorna a autenticação.</p>

      <section className="ai-prompt-library" aria-labelledby="ai-prompt-library-title">
        <div className="ai-prompt-library-heading">
          <div>
            <p className="workspace-kicker">DOCUMENTAÇÃO SOLMAR CELERIS</p>
            <h3 id="ai-prompt-library-title">Prompts oficiais para documentação</h3>
            <p>Os textos abaixo incluem as regras completas do projeto. Copie o prompt desejado e cole-o na plataforma de IA que estiver usando.</p>
          </div>
        </div>
        <div className="ai-prompt-list">
          {prompts.map((prompt) => (
            <details className="ai-prompt-card" key={prompt.id}>
              <summary>
                <span><strong>{prompt.title}</strong><small>{prompt.description}</small></span>
                <span className="ai-prompt-toggle" aria-hidden="true">+</span>
              </summary>
              <div className="ai-prompt-content">
                <div className="ai-prompt-actions">
                  <button type="button" className="workspace-save-button" onClick={() => void handleCopy(prompt.title, prompt.content)}>Copiar prompt completo</button>
                  <a href={prompt.id === 'registro'
                    ? 'https://docs.google.com/document/d/1rBBxJRcyNiBY7Fy9eibpBSZ_ctgmzyfL/edit?usp=drive_link&ouid=115852090288971314938&rtpof=true&sd=true'
                    : 'https://docs.google.com/document/d/1MRQZyQyggwlgq2oXCwoQ4JMCVHc4yI23/edit?usp=drive_link&ouid=115852090288971314938&rtpof=true&sd=true'}
                    target="_blank" rel="noopener noreferrer">Abrir template oficial ↗</a>
                </div>
                <pre>{prompt.content}</pre>
              </div>
            </details>
          ))}
        </div>
        {copyMessage && <p className="ai-copy-feedback" role="status">{copyMessage}</p>}
        <p className="ai-shortcuts-note">A pasta de destino indicada é uma orientação. Não afirmamos que arquivos foram salvos no Drive sem acesso e autorização para executar essa ação.</p>
      </section>
    </section>
  );
}
