import { useEffect } from 'react';
import { Camera, MonitorUp, Mic, Users, Video } from 'lucide-react';
import './meetings-workspace.css';

type MeetingsWorkspaceProps = {
  displayName: string;
  onRoomActiveChange: (active: boolean) => void;
};

const plannedFeatures = [
  { icon: Users, title: 'Salas para até 30 pessoas', description: 'Entrada restrita a membros ativos do Team Celeris.' },
  { icon: Mic, title: 'Áudio e vídeo', description: 'Controles individuais de microfone e câmera.' },
  { icon: MonitorUp, title: 'Compartilhamento de tela', description: 'Apresentação de telas e janelas durante a reunião.' },
  { icon: Camera, title: 'Controles da reunião', description: 'Participantes, permissões e chat em tempo real.' },
];

export default function MeetingsWorkspace({ displayName, onRoomActiveChange }: MeetingsWorkspaceProps) {
  useEffect(() => {
    onRoomActiveChange(false);
  }, [onRoomActiveChange]);

  return (
    <section className="meetings-workspace" aria-labelledby="meetings-title">
      <header className="meetings-intro">
        <div>
          <p className="meetings-eyebrow">PLATAFORMA PRÓPRIA</p>
          <h2 id="meetings-title">Reuniões da equipe</h2>
          <p>Um espaço de videoconferência integrado ao Team Celeris, com infraestrutura própria e acesso pela conta da equipe.</p>
        </div>
        <span className="meetings-provider"><Video size={16} aria-hidden="true" /> SolMar Celeris</span>
      </header>
      <section className="meetings-native-card" aria-label="Recursos planejados para as reuniões">
        <div className="meetings-native-card-heading">
          <span className="meetings-form-eyebrow">EM IMPLANTAÇÃO</span>
          <h3>Reuniões nativas do Team Celeris</h3>
          <p>Olá, {displayName.trim() || 'integrante'}. Estamos preparando os recursos abaixo para as reuniões da equipe.</p>
        </div>
        <div className="meetings-feature-grid">
          {plannedFeatures.map(({ icon: Icon, title, description }) => (
            <article className="meetings-feature" key={title}>
              <span className="meetings-feature-icon"><Icon size={17} aria-hidden="true" /></span>
              <div><strong>{title}</strong><p>{description}</p></div>
            </article>
          ))}
        </div>
        <div className="meetings-capacity">
          <div><strong>30 participantes</strong><span>Capacidade planejada por sala</span></div>
          <span className="meetings-capacity-track"><span /></span>
        </div>
      </section>
    </section>
  );
}
