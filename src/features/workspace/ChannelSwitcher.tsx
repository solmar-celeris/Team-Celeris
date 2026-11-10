import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronDown, Cpu, Globe2, Laptop, LockKeyhole, Megaphone, Menu, Plus, Ship, Users, Wallet, Zap, Pencil, Check, X, Folder, Wrench, FlaskConical, CalendarDays, BookOpen, Settings, MessageCircle, Trash2 } from 'lucide-react';
import type { Area, MemberProfile } from './domain';
import './channel-switcher.css';

export type WorkspaceChannel = { id: string; slug: string; name: string; icon: string; is_open: boolean; area_id: string | null };
type Props = { client: SupabaseClient; userId: string; isAdmin: boolean; areas: Area[]; members: Pick<MemberProfile, 'user_id' | 'full_name' | 'status'>[]; onChange: (channel: WorkspaceChannel) => void };
const icons = { globe: Globe2, ship: Ship, zap: Zap, cpu: Cpu, users: Users, megaphone: Megaphone, wallet: Wallet, laptop: Laptop, folder: Folder, wrench: Wrench, flask: FlaskConical, calendar: CalendarDays, book: BookOpen, settings: Settings, chat: MessageCircle } as const;
const iconOptions = Object.entries(icons) as [keyof typeof icons, (typeof icons)[keyof typeof icons]][];
const protectedChannelSlugs = ['geral', 'mecanica-naval', 'eletrica', 'eletronica', 'gestao-de-pessoas', 'marketing', 'administrativo-financeiro', 'ti'];
function ChannelIcon({ name }: { name: string }) { const Icon = icons[name as keyof typeof icons] ?? Globe2; return <Icon size={16} aria-hidden="true" />; }

export default function ChannelSwitcher({ client, userId, isAdmin, areas, members, onChange }: Props) {
  const [channels, setChannels] = useState<WorkspaceChannel[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingPrivacy, setEditingPrivacy] = useState(false);
  const [editingIcon, setEditingIcon] = useState(false);
  const [iconChoice, setIconChoice] = useState('globe');
  const [privacyOpen, setPrivacyOpen] = useState(true);
  const [name, setName] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [areaId, setAreaId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [channelMemberIds, setChannelMemberIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => channels.find((channel) => channel.id === selectedId) ?? channels[0], [channels, selectedId]);
  const load = useCallback(async () => {
    const { data, error } = await client.from('workspace_channels').select('id,slug,name,icon,is_open,area_id').order('name');
    if (error) { setNotice('Não foi possível carregar os canais. Aplique a migration de canais.'); return; }
    const list = ((data ?? []) as WorkspaceChannel[]).sort((a, b) => a.slug === 'geral' ? -1 : b.slug === 'geral' ? 1 : a.name.localeCompare(b.name, 'pt-BR'));
    setChannels(list);
    setSelectedId((current) => list.some((item) => item.id === current) ? current : list.find((item) => item.slug === 'geral')?.id ?? list[0]?.id ?? '');
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (selected) onChange(selected);
  }, [selected?.id, selected?.is_open, selected?.name, selected?.area_id, selected?.slug, selected?.icon, onChange]);
  useEffect(() => {
    const channel = client.channel(`workspace-channels-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_channels' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_channel_members' }, () => { void load(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, load, userId]);
  useEffect(() => {
    let active = true;
    async function loadChannelMembers() {
      if (!selected || selected.is_open || !isAdmin) { setChannelMemberIds([]); return; }
      const { data } = await client.from('workspace_channel_members').select('user_id').eq('channel_id', selected.id);
      if (active) setChannelMemberIds((data ?? []).map((item) => item.user_id));
    }
    void loadChannelMembers();
    return () => { active = false; };
  }, [client, isAdmin, selected?.id, selected?.is_open]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  async function createChannel(event: FormEvent) {
    event.preventDefault(); if (!isAdmin || !name.trim() || busy) return;
    setBusy(true); setNotice('');
    const slug = name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await client.from('workspace_channels').insert({ slug: `${slug}-${Date.now().toString().slice(-5)}`, name: name.trim(), icon: 'globe', is_open: isOpen, area_id: areaId || null, created_by: userId }).select('id,slug,name,icon,is_open,area_id').single();
    if (error) setNotice(error.message.includes('workspace_channels_area_unique') ? 'Já existe um canal vinculado a essa área.' : 'Não foi possível criar o canal. Verifique a migration e os dados.');
    else { const channel = data as WorkspaceChannel; setChannels((current) => [...current, channel]); setSelectedId(channel.id); setName(''); setAreaId(''); setIsOpen(true); setCreating(false); setNotice('Canal criado.'); }
    setBusy(false);
  }
  async function savePrivacy() {
    if (!selected || !isAdmin || busy) return;
    if (selected.slug === 'geral' && !privacyOpen) { setNotice('O canal Geral deve permanecer aberto.'); return; }
    setBusy(true); setNotice('');
    const { error } = await client.from('workspace_channels').update({ is_open: privacyOpen, updated_at: new Date().toISOString() }).eq('id', selected.id);
    if (error) setNotice('Não foi possível atualizar a privacidade. Verifique as migrations e a permissão de administrador.');
    else { setChannels((current) => current.map((channel) => channel.id === selected.id ? { ...channel, is_open: privacyOpen } : channel)); setEditingPrivacy(false); setNotice('Privacidade do canal atualizada.'); }
    setBusy(false);
  }
  async function saveIcon() {
    if (!selected || !isAdmin || busy) return;
    setBusy(true); setNotice('');
    const { error } = await client.from('workspace_channels').update({ icon: iconChoice, updated_at: new Date().toISOString() }).eq('id', selected.id);
    if (error) setNotice(`Não foi possível alterar o ícone: ${error.message}`);
    else {
      setChannels((current) => current.map((channel) => channel.id === selected.id ? { ...channel, icon: iconChoice } : channel));
      setEditingIcon(false); setNotice('Ícone do canal atualizado.');
    }
    setBusy(false);
  }
  async function deleteChannel() {
    if (!selected || !isAdmin || busy || protectedChannelSlugs.includes(selected.slug)) return;
    const confirmed = window.confirm(`Excluir o canal “${selected.name}”? Esta ação é permanente e também removerá os vínculos e arquivos associados ao canal.`);
    if (!confirmed) return;
    setBusy(true); setNotice('');
    const deletedId = selected.id;
    // Remove primeiro os objetos do Storage para não deixar arquivos órfãos.
    const { data: channelFiles, error: filesError } = await client.from('workspace_channel_files').select('storage_path').eq('channel_id', deletedId);
    if (filesError) {
      setNotice(`Não foi possível verificar os arquivos do canal: ${filesError.message}`);
      setBusy(false);
      return;
    }
    const storagePaths = (channelFiles ?? []).map((file) => file.storage_path).filter((path): path is string => Boolean(path));
    if (storagePaths.length) {
      const { error: storageError } = await client.storage.from('workspace-channel-files').remove(storagePaths);
      if (storageError) {
        setNotice(`Não foi possível remover os arquivos armazenados: ${storageError.message}`);
        setBusy(false);
        return;
      }
    }
    const { error } = await client.from('workspace_channels').delete().eq('id', deletedId);
    if (error) setNotice(`Não foi possível excluir o canal: ${error.message}`);
    else {
      const remaining = channels.filter((channel) => channel.id !== deletedId);
      setChannels(remaining);
      setSelectedId(remaining.find((channel) => channel.slug === 'geral')?.id ?? remaining[0]?.id ?? '');
      setEditingIcon(false); setEditingPrivacy(false);
      setNotice('Canal excluído.');
    }
    setBusy(false);
  }
  async function removeMember(targetUserId: string) {
    if (!selected || !isAdmin || busy) return; setBusy(true);
    const { error } = await client.from('workspace_channel_members').delete().eq('channel_id', selected.id).eq('user_id', targetUserId);
    setNotice(error ? 'Não foi possível remover o membro.' : 'Acesso ao canal removido.');
    if (!error) setChannelMemberIds((current) => current.filter((id) => id !== targetUserId)); setBusy(false);
  }
  async function addMember() {
    if (!selected || !memberId || !isAdmin || busy) return;
    const targetUserId = memberId;
    setBusy(true);
    setNotice('');
    // A migration concede INSERT, mas não UPDATE nesta tabela. Portanto,
    // upsert() falha porque exige também a permissão de UPDATE.
    const { error } = await client.from('workspace_channel_members').insert({
      channel_id: selected.id,
      user_id: targetUserId,
      added_by: userId,
    });
    if (error) {
      setNotice(error.code === '23505'
        ? 'Este integrante já tem acesso ao canal.'
        : `Não foi possível adicionar o membro: ${error.message}`);
    } else {
      setChannelMemberIds((current) => current.includes(targetUserId) ? current : [...current, targetUserId]);
      setNotice('Membro adicionado ao canal.');
      setMemberId('');
    }
    setBusy(false);
  }
  return <div className="channel-switcher" ref={root}>
    <button type="button" className="channel-switcher-trigger" aria-label={`Canais. Canal atual: ${selected?.name ?? 'não selecionado'}`} title="Canais" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="channel-switcher-icon channel-switcher-desktop-icon">{selected ? <ChannelIcon name={selected.icon} /> : <Menu size={16} />}</span>
      <span className="channel-switcher-icon channel-switcher-mobile-icon"><Menu size={17} /></span>
      <span className="channel-switcher-label"><small className="channel-switcher-mobile-title">CANAIS</small><small className="channel-switcher-desktop-title">CANAL ATUAL</small><strong>{selected?.name ?? 'Canais'}</strong></span>
      <ChevronDown size={15} />
    </button>
    {open && <div className="channel-switcher-menu" role="menu">
      <p className="channel-switcher-caption">SELECIONE UM CANAL</p>
      {channels.map((channel) => <button type="button" role="menuitem" key={channel.id} className={`channel-switcher-option${channel.id === selectedId ? ' is-active' : ''}`} onClick={() => { setSelectedId(channel.id); setOpen(false); }}>
        <ChannelIcon name={channel.icon} /><span>{channel.name}</span>{channel.is_open ? <Globe2 size={12} /> : <LockKeyhole size={12} />}
      </button>)}
      {selected && selected.slug !== 'geral' && !selected.area_id && <p className="channel-switcher-notice">Canal sem área vinculada: use o Manual para publicar conteúdo próprio. Atividades, comunicados e arquivos são organizados pelos canais de área.</p>}
      {selected && isAdmin && <div className="channel-switcher-admin">
        <div className="channel-switcher-privacy"><strong>Privacidade: {selected.is_open ? 'Aberto' : 'Privado'}</strong>{editingPrivacy ? <><label className="channel-switcher-check"><input type="checkbox" checked={privacyOpen} disabled={selected.slug === 'geral'} onChange={(event) => setPrivacyOpen(event.target.checked)} /> Aberto para todos os membros</label><div className="channel-switcher-privacy-actions"><button type="button" onClick={() => setEditingPrivacy(false)} disabled={busy}><X size={13}/> Cancelar</button><button type="button" onClick={() => void savePrivacy()} disabled={busy}><Check size={13}/> Salvar privacidade</button></div></> : <button type="button" onClick={() => { setPrivacyOpen(selected.is_open); setEditingPrivacy(true); }}><Pencil size={13}/> Alterar privacidade</button>}</div>
        <div className="channel-switcher-icon-editor"><strong>Ícone do canal</strong>{editingIcon ? <><div className="channel-switcher-icon-options">{iconOptions.map(([key, Icon]) => <button type="button" key={key} className={iconChoice === key ? 'is-selected' : ''} aria-label={`Ícone ${key}`} title={key} onClick={() => setIconChoice(key)}><Icon size={17}/></button>)}</div><div className="channel-switcher-privacy-actions"><button type="button" onClick={() => setEditingIcon(false)} disabled={busy}><X size={13}/> Cancelar</button><button type="button" onClick={() => void saveIcon()} disabled={busy}><Check size={13}/> Salvar ícone</button></div></> : <button type="button" onClick={() => { setIconChoice(selected.icon); setEditingIcon(true); }}><Pencil size={13}/> Alterar ícone</button>}</div>
        {!protectedChannelSlugs.includes(selected.slug) && <button type="button" className="channel-switcher-delete" onClick={() => void deleteChannel()} disabled={busy}><Trash2 size={14}/> Excluir canal</button>}
        {!selected.is_open && channelMemberIds.length > 0 && <div className="channel-switcher-members"><small>Membros com acesso</small>{channelMemberIds.map((id) => <div key={id}><span>{members.find((member) => member.user_id === id)?.full_name || 'Integrante'}</span><button type="button" onClick={() => void removeMember(id)} disabled={busy}>Remover</button></div>)}</div>}
        {!selected.is_open && <><label>Adicionar membro<select value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Selecione...</option>{members.filter((member) => member.status === 'active' && !channelMemberIds.includes(member.user_id)).map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || 'Integrante'}</option>)}</select></label>
        <button type="button" onClick={() => void addMember()} disabled={!memberId || busy}>Adicionar</button></>}
      </div>}
      {isAdmin && !creating && <button type="button" className="channel-switcher-create" onClick={() => setCreating(true)}><Plus size={15} /> Criar canal</button>}
      {creating && <form className="channel-switcher-form" onSubmit={(event) => void createChannel(event)}>
        <label>Nome do canal<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Projetos especiais" required maxLength={60} /></label>
        <label>Área vinculada (opcional)<select value={areaId} onChange={(event) => setAreaId(event.target.value)}><option value="">Sem área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        <label className="channel-switcher-check"><input type="checkbox" checked={isOpen} onChange={(event) => setIsOpen(event.target.checked)} /> Canal aberto para todos</label>
        <div><button type="button" onClick={() => setCreating(false)}>Cancelar</button><button type="submit" disabled={busy || !name.trim()}>{busy ? 'Criando…' : 'Criar'}</button></div>
      </form>}
      {notice && <p className="channel-switcher-notice" role="status">{notice}</p>}
    </div>}
  </div>;
}
