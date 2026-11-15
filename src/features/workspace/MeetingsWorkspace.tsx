import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LiveKitRoom, VideoTrack, RoomAudioRenderer, useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { CalendarClock, Check, Copy, LoaderCircle, Mic, MicOff, MonitorUp, Plus, Radio, Share2, Video, VideoOff, X, PhoneOff } from 'lucide-react';
import './meetings-workspace.css';

type MeetingRoom = {
  id: string;
  room_name: string;
  title: string;
  created_by: string;
  status: 'active' | 'ended';
  participant_limit: number;
  created_at: string;
};

type MeetingsWorkspaceProps = {
  client: SupabaseClient;
  userId: string;
  displayName: string;
  onRoomActiveChange: (active: boolean) => void;
  initialRoomId?: string | null;
};

export function MeetingVideoLayout() {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  type PublishedVideoTrack = (typeof tracks)[number] & {
    publication: NonNullable<(typeof tracks)[number]['publication']>;
  };
  const publishedTracks = tracks.filter(
    (track): track is PublishedVideoTrack => Boolean(track.publication?.track),
  );
  // Quando alguém compartilha a tela, prioriza essa transmissão e não monta
  // uma segunda cópia da câmera por cima/ao lado do conteúdo compartilhado.
  const screenTracks = publishedTracks.filter((track) => track.source === Track.Source.ScreenShare);
  const videoTracks = screenTracks.length > 0 ? screenTracks : publishedTracks;
  const uniqueTracks = Array.from(new Map(videoTracks.map((track) => [
    track.publication.trackSid || `${track.participant.identity}-${track.source}`,
    track,
  ] as const)).values());

  if (videoTracks.length === 0) {
    return <div className="meetings-video-empty">Aguardando o vídeo dos participantes…</div>;
  }

  return (
    <div className="meetings-custom-video-grid">
      {uniqueTracks.map((track) => (
        <div
          className="meetings-custom-video-tile"
          key={`${track.participant.identity}-${track.source}`}
        >
          <VideoTrack
            trackRef={track}
            className="meetings-custom-video"
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center',
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function MeetingControls({ onLeave, onShareInvite, onEndMeeting, canEndMeeting = false, inviteCopied = false, variant = 'host' }: { onLeave: () => void; onShareInvite?: () => void; onEndMeeting?: () => void; canEndMeeting?: boolean; inviteCopied?: boolean; variant?: 'host' | 'guest' }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const screenShareLock = useRef(false);
  const toggleScreenShare = async () => {
    if (screenShareLock.current) return;
    screenShareLock.current = true;
    setScreenShareBusy(true);
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (error) {
      console.error('Não foi possível alternar o compartilhamento de tela.', error);
    } finally {
      screenShareLock.current = false;
      setScreenShareBusy(false);
    }
  };

  return (
    <nav className={variant === "host" ? "meetings-call-controls meetings-call-controls-host" : "meetings-call-controls"} aria-label="Controles da reunião">
      <button type="button" className={isMicrophoneEnabled ? 'meetings-control' : 'meetings-control is-off'} aria-label={isMicrophoneEnabled ? 'Desligar microfone' : 'Ligar microfone'} aria-pressed={isMicrophoneEnabled}
        onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}>
        {isMicrophoneEnabled ? <Mic size={22} strokeWidth={1.9} /> : <MicOff size={22} strokeWidth={1.9} />}
        <span>{isMicrophoneEnabled ? 'Microfone' : 'Ativar microfone'}</span>
      </button>
      <button type="button" className={isCameraEnabled ? 'meetings-control' : 'meetings-control is-off'} aria-label={isCameraEnabled ? 'Desligar câmera' : 'Ligar câmera'} aria-pressed={isCameraEnabled}
        onClick={() => void localParticipant.setCameraEnabled(!isCameraEnabled)}>
        {isCameraEnabled ? <Video size={22} strokeWidth={1.9} /> : <VideoOff size={22} strokeWidth={1.9} />}
        <span>{isCameraEnabled ? 'Câmera' : 'Ativar câmera'}</span>
      </button>
      <button type="button" className={isScreenShareEnabled ? 'meetings-control is-active' : 'meetings-control'} aria-label={isScreenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'} aria-pressed={isScreenShareEnabled} disabled={screenShareBusy}
        onClick={() => void toggleScreenShare()}>
        <MonitorUp size={22} strokeWidth={1.9} />
        <span>{isScreenShareEnabled ? 'Parar tela' : 'Compartilhar'}</span>
      </button>
      {onShareInvite && <button type="button" className={inviteCopied ? "meetings-control meetings-control-invite is-copied" : "meetings-control meetings-control-invite"} aria-label={inviteCopied ? "Link copiado" : "Compartilhar convite"} onClick={onShareInvite}>
        {inviteCopied ? <Check className="meetings-copy-success-icon" size={22} strokeWidth={2.5} /> : <Share2 size={22} strokeWidth={1.9} />}<span>{inviteCopied ? "Link copiado" : "Compartilhar convite"}</span>
      </button>}
      <button type="button" className="meetings-control meetings-control-leave" aria-label="Sair do lobby" onClick={onLeave}>
        <X size={22} strokeWidth={1.9} /><span>Sair do lobby</span>
      </button>
      {canEndMeeting && onEndMeeting && <button type="button" className="meetings-control meetings-control-end" aria-label="Encerrar reunião para todos" onClick={onEndMeeting}>
        <PhoneOff size={22} strokeWidth={1.9} /><span>Encerrar reunião</span>
      </button>}
    </nav>
  );
}

export default function MeetingsWorkspace({ client, userId, displayName, onRoomActiveChange, initialRoomId }: MeetingsWorkspaceProps) {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [activeRoom, setActiveRoom] = useState<MeetingRoom | null>(null);
  const [connection, setConnection] = useState<{ token: string; serverUrl: string } | null>(null);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
  const inviteHandled = useRef(false);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await client
      .from('meeting_rooms')
      .select('id,room_name,title,created_by,status,participant_limit,created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else setRooms((data ?? []) as MeetingRoom[]);
    setLoading(false);
  }, [client]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);
  useEffect(() => {
    onRoomActiveChange(Boolean(connection));
    return () => onRoomActiveChange(false);
  }, [connection, onRoomActiveChange]);

  const joinRoom = async (room: MeetingRoom) => {
    setWorking(true);
    setError('');
    try {
      const { data, error: invokeError } = await client.functions.invoke('create-meeting-token', {
        body: { room_id: room.id, display_name: displayName },
      });
      if (invokeError) throw invokeError;
      if (!data?.token || !data?.server_url) throw new Error(data?.error || 'Não foi possível obter acesso à reunião.');
      setActiveRoom(room);
      setConnection({ token: data.token, serverUrl: data.server_url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao entrar na reunião.');
    } finally { setWorking(false); }
  };

  useEffect(() => {
    if (!initialRoomId || loading || inviteHandled.current || connection) return;
    const invitedRoom = rooms.find((room) => room.id === initialRoomId);
    if (invitedRoom) {
      inviteHandled.current = true;
      void joinRoom(invitedRoom);
    } else if (rooms.length > 0) {
      inviteHandled.current = true;
      setError('Esta reunião não está disponível. Ela pode ter sido encerrada ou o convite é inválido.');
    }
  }, [initialRoomId, loading, rooms, connection]);

  const copyInvite = async (room: MeetingRoom) => {
    const inviteUrl = new URL(window.location.href);
    inviteUrl.search = '';
    inviteUrl.searchParams.set('meeting', room.id);
    try {
      await navigator.clipboard.writeText(inviteUrl.toString());
      setCopiedRoomId(room.id);
      window.setTimeout(() => setCopiedRoomId((current) => current === room.id ? null : current), 1000);
    } catch {
      setError('Não foi possível copiar automaticamente. Copie o endereço da página e acrescente ?meeting=' + room.id);
    }
  };

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setWorking(true);
    setError('');
    try {
      const roomName = `celeris-${crypto.randomUUID().replaceAll('-', '')}`;
      const { data, error: insertError } = await client
        .from('meeting_rooms')
        .insert({ room_name: roomName, title: cleanTitle, created_by: userId })
        .select('id,room_name,title,created_by,status,participant_limit,created_at')
        .single();
      if (insertError) throw insertError;
      setTitle('');
      await loadRooms();
      await joinRoom(data as MeetingRoom);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a reunião.');
    } finally { setWorking(false); }
  };

  const leaveRoom = () => {
    setConnection(null);
    setActiveRoom(null);
    void loadRooms();
  };

  const endRoom = async () => {
    if (!activeRoom || activeRoom.created_by !== userId || working) return;
    const confirmed = window.confirm('Encerrar esta reunião para todos os participantes? Ninguém poderá entrar novamente por este convite.');
    if (!confirmed) return;
    setWorking(true);
    setError('');
    try {
      const { error: endError } = await client.functions.invoke('create-meeting-token', {
        body: { action: 'end_room', room_id: activeRoom.id },
      });
      if (endError) throw endError;
      leaveRoom();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível encerrar a reunião.');
    } finally {
      setWorking(false);
    }
  };

  if (connection && activeRoom) {
    return (
      <section className="meetings-workspace meetings-live" aria-label="Sala de reunião">
        <header className="meetings-live-header">
          <div><span className="meetings-eyebrow">REUNIÃO EM ANDAMENTO</span><h2>{activeRoom.title}</h2><p>Até {activeRoom.participant_limit} participantes · Convide membros pelo link da sala</p></div>

        </header>
        {error && <p className="meetings-error" role="alert">{error}</p>}
        <LiveKitRoom token={connection.token} serverUrl={connection.serverUrl} connect audio video
          options={{ adaptiveStream: true, dynacast: true }}
          onDisconnected={leaveRoom} className="meetings-livekit-room">
          <MeetingControls onLeave={leaveRoom} onShareInvite={() => void copyInvite(activeRoom)} onEndMeeting={() => void endRoom()} canEndMeeting={activeRoom.created_by === userId} inviteCopied={copiedRoomId === activeRoom.id} />
          <div className="meetings-video-area">
            <MeetingVideoLayout />
          </div>
          <RoomAudioRenderer />
        </LiveKitRoom>
      </section>
    );
  }

  return (
    <section className="meetings-workspace" aria-labelledby="meetings-title">
      <header className="meetings-intro">
        <div><p className="meetings-eyebrow">PLATAFORMA DE VIDEOCONFERÊNCIA</p><h2 id="meetings-title">Reuniões da equipe</h2><p>Crie uma sala e compartilhe o link. Qualquer pessoa com o convite poderá entrar, mesmo sem conta no Team Celeris.</p></div>
        <span className="meetings-provider"><Video size={16}/> LiveKit</span>
      </header>
      <form className="meetings-create-form" onSubmit={createRoom}>
        <label htmlFor="meeting-title">Nova reunião</label>
        <div><input id="meeting-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Ex.: Reunião semanal da equipe" required />
        <button type="submit" disabled={working || !title.trim()}><Plus size={17}/> Criar reunião</button></div>
      </form>
      {error && <p className="meetings-error" role="alert">{error}</p>}
      <div className="meetings-list-heading"><h3><Radio size={17}/> Salas disponíveis</h3><button type="button" onClick={() => void loadRooms()} disabled={loading}>Atualizar</button></div>
      {loading ? <p className="meetings-empty"><LoaderCircle className="meetings-spinner" size={18}/> Carregando reuniões…</p> :
        rooms.length === 0 ? <p className="meetings-empty">Nenhuma reunião ativa no momento. Crie a primeira sala.</p> :
        <div className="meetings-room-list">{rooms.map(room => <article className="meetings-room-card" key={room.id}>
          <div className="meetings-room-icon"><Video size={19}/></div><div className="meetings-room-info"><strong>{room.title}</strong><span><CalendarClock size={13}/> {new Date(room.created_at).toLocaleString('pt-BR')} · Limite de {room.participant_limit} pessoas</span></div>
          <div className="meetings-room-actions"><button type="button" className={copiedRoomId === room.id ? "meetings-share-button is-copied" : "meetings-share-button"} onClick={() => void copyInvite(room)}>{copiedRoomId === room.id ? <><Check size={14} className="meetings-copy-success-icon"/> Link copiado</> : <><Copy size={14}/> Copiar convite</>}</button><button type="button" onClick={() => void joinRoom(room)} disabled={working}><Video size={15}/> Entrar</button></div>
        </article>)}</div>}
      {working && <p className="meetings-working"><LoaderCircle className="meetings-spinner" size={16}/> Preparando sua reunião…</p>}
    </section>
  );
}
