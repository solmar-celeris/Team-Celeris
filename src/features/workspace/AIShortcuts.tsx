import { ArrowUpRight, Brain, Sparkles, WandSparkles } from 'lucide-react';
import './ai-shortcuts.css';

type AIService = {
  name: string;
  subtitle: string;
  description: string;
  url: string;
  icon: typeof Sparkles;
  accent: string;
};

const services: AIService[] = [
  {
    name: 'ChatGPT',
    subtitle: 'OpenAI',
    description: 'Assistente para escrita, pesquisa, análise e criação.',
    url: 'https://chatgpt.com/',
    icon: Sparkles,
    accent: 'blue',
  },
  {
    name: 'Claude AI',
    subtitle: 'Anthropic',
    description: 'Assistente para leitura, raciocínio, escrita e programação.',
    url: 'https://claude.ai/',
    icon: Brain,
    accent: 'orange',
  },
  {
    name: 'Manus IA',
    subtitle: 'Manus',
    description: 'Assistente de IA para explorar ideias e realizar tarefas.',
    url: 'https://manus.im/',
    icon: WandSparkles,
    accent: 'ocean',
  },
  {
    name: 'Gemini',
    subtitle: 'Google',
    description: 'Assistente de IA do Google para perguntas e criação.',
    url: 'https://gemini.google.com/app',
    icon: Sparkles,
    accent: 'sky',
  },
];

export default function AIShortcuts() {
  return (
    <section className="ai-shortcuts" aria-labelledby="ai-shortcuts-title">
      <div className="ai-shortcuts-intro">
        <span className="ai-shortcuts-mark" aria-hidden="true"><Sparkles /></span>
        <div>
          <p className="workspace-kicker">FERRAMENTAS EXTERNAS</p>
          <h2 id="ai-shortcuts-title">Inteligência artificial.</h2>
          <p>Abra as plataformas de IA em uma nova aba. O acesso e os recursos disponíveis dependem da conta de cada serviço.</p>
        </div>
      </div>
      <div className="ai-shortcuts-grid">
        {services.map(({ name, subtitle, description, url, icon: Icon, accent }) => (
          <a
            className={`ai-shortcut-card is-${accent}`}
            href={url}
            key={name}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="ai-shortcut-icon" aria-hidden="true"><Icon /></span>
            <span className="ai-shortcut-copy">
              <span className="ai-shortcut-provider">{subtitle}</span>
              <strong>{name}</strong>
              <span className="ai-shortcut-description">{description}</span>
            </span>
            <ArrowUpRight className="ai-shortcut-arrow" aria-hidden="true" />
          </a>
        ))}
      </div>
      <p className="ai-shortcuts-note">As ferramentas abrem em sites externos e não compartilham automaticamente dados ou credenciais do SolMar.</p>
    </section>
  );
}
