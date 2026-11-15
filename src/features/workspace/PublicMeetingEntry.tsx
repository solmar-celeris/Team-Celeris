import { useState, type FormEvent } from 'react';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { Video } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { MeetingControls, MeetingVideoLayout } from './MeetingsWorkspace';
import './meetings-workspace.css';

export default function PublicMeetingEntry({ roomId }: { roomId: string }) {
  const [displayName, setDisplayName] = useState('');
  const [connection, setConnection] = useState<{ token: string; serverUrl: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const enter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !displayName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-meeting-token', {
        body: { room_id: roomId, display_name: displayName.trim().slice(0, 80) },
      });
      if (invokeError) throw invokeError;
      if (!data?.token || !data?.server_url) throw new Error(data?.error || 'Não foi possível entrar nesta reunião.');
      setConnection({ token: data.token, serverUrl: data.server_url, title: data.room_title || 'Reunião Team Celeris' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar na reunião.');
    } finally {
      setLoading(false);
    }
  };

  if (connection) {
    return (
      <main className="public-meeting-page">
        <header className="public-meeting-header"><strong><Video size={18}/> {connection.title}</strong><span>Team Celeris · Acesso por convite</span></header>
        <LiveKitRoom token={connection.token} serverUrl={connection.serverUrl} connect audio video
          options={{ adaptiveStream: true, dynacast: true }}
          onDisconnected={() => setConnection(null)} className="meetings-livekit-room public-meetings-livekit-room">
          <MeetingControls variant="guest" onLeave={() => setConnection(null)} />
          <div className="meetings-video-area"><MeetingVideoLayout /></div>
          <RoomAudioRenderer />
        </LiveKitRoom>
      </main>
    );
  }

  return (
    <main className="public-meeting-entry">
      <form onSubmit={enter}>
        <div className="public-meeting-mark"><Video size={24}/></div>
        <p className="meetings-eyebrow">TEAM CELERIS</p>
        <h1>Entrar na reunião</h1>
        <p>Você recebeu um link de acesso. Informe como deseja aparecer para os participantes.</p>
        <label htmlFor="guest-meeting-name">Seu nome</label>
        <input id="guest-meeting-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Digite seu nome" required />
        {error && <p className="meetings-error" role="alert">{error}</p>}
        <button type="submit" disabled={loading || !displayName.trim()}>{loading ? 'Conectando…' : 'Entrar na reunião'}</button>
        <small>Não é necessário criar uma conta para participar por este link.</small>
      </form>
    </main>
  );
}
