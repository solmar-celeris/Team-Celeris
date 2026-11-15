import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import { CalendarClock, LoaderCircle, Plus, Radio, Video, X } from 'lucide-react';
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
};

export default function MeetingsWorkspace({ client, userId, displayName, onRoomActiveChange }: MeetingsWorkspaceProps) {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [activeRoom, setActiveRoom] = useState<MeetingRoom | null>(null);
  const [connection, setConnection] = useState<{ token: string; serverUrl: string } | null>(null);

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
    if (!activeRoom) return;
    const { error: updateError } = await client.from('meeting_rooms')
      .update({ status: 'ended' }).eq('id', activeRoom.id);
    if (updateError) setError(updateError.message);
    else leaveRoom();
  };

  if (connection && activeRoom) {
    return (
      <section className="meetings-workspace meetings-live" aria-label="Sala de reunião">
        <header className="meetings-live-header">
          <div><span className="meetings-eyebrow">REUNIÃO EM ANDAMENTO</span><h2>{activeRoom.title}</h2><p>Até {activeRoom.participant_limit} participantes</p></div>
          <div className="meetings-live-actions">
            {activeRoom.created_by === userId && <button type="button" className="meetings-end-button" onClick={() => void endRoom()}>Encerrar reunião</button>}
            <button type="button" className="meetings-leave-button" onClick={leaveRoom}><X size={16}/> Sair</button>
          </div>
        </header>
        {error && <p className="meetings-error" role="alert">{error}</p>}
        <LiveKitRoom token={connection.token} serverUrl={connection.serverUrl} connect audio video
          options={{ adaptiveStream: true, dynacast: true }}
          onDisconnected={leaveRoom} className="meetings-livekit-room">
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </section>
    );
  }

  return (
    <section className="meetings-workspace" aria-labelledby="meetings-title">
      <header className="meetings-intro">
        <div><p className="meetings-eyebrow">PLATAFORMA DE VIDEOCONFERÊNCIA</p><h2 id="meetings-title">Reuniões da equipe</h2><p>Crie uma sala ou entre em uma reunião ativa. O acesso é restrito aos membros ativos do Team Celeris.</p></div>
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
          <button type="button" onClick={() => void joinRoom(room)} disabled={working}><Video size={15}/> Entrar</button>
        </article>)}</div>}
      {working && <p className="meetings-working"><LoaderCircle className="meetings-spinner" size={16}/> Preparando sua reunião…</p>}
    </section>
  );
}
