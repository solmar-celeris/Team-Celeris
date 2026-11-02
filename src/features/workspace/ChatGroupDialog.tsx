import { useState, type FormEvent } from 'react';
import { UserPlus, X } from 'lucide-react';
import type { MemberProfile } from './domain';
import './chat-group-dialog.css';

type ChatGroupDialogProps = {
  mode: 'create' | 'add-members';
  members: Pick<MemberProfile, 'user_id' | 'full_name'>[];
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (value: { name: string; memberIds: string[] }) => void;
};

export default function ChatGroupDialog({ mode, members, busy, error, onCancel, onSubmit }: ChatGroupDialogProps) {
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const isCreating = mode === 'create';

  function toggleMember(userId: string) {
    setMemberIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedName = name.trim();
    if (isCreating && (cleanedName.length < 2 || cleanedName.length > 80)) return;
    if (!isCreating && memberIds.length === 0) return;
    onSubmit({ name: cleanedName, memberIds });
  }

  return (
    <div className="chat-group-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onCancel(); }}>
      <form className="chat-group-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-group-dialog-title" onSubmit={submit}>
        <header className="chat-group-dialog-heading">
          <div>
            <span className="chat-group-dialog-icon"><UserPlus aria-hidden="true" /></span>
            <h2 id="chat-group-dialog-title">{isCreating ? 'Criar grupo' : 'Adicionar pessoas'}</h2>
          </div>
          <button type="button" className="chat-group-dialog-close" onClick={onCancel} disabled={busy} aria-label="Fechar diálogo"><X aria-hidden="true" /></button>
        </header>

        {isCreating && (
          <label className="chat-group-dialog-name">
            <span>Nome do grupo</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} minLength={2} required placeholder="Ex.: Projeto da bateria" />
            <small>{name.trim().length}/80 caracteres</small>
          </label>
        )}

        <fieldset className="chat-group-member-picker" disabled={busy}>
          <legend>{isCreating ? 'Pessoas para adicionar' : 'Escolha as pessoas'}</legend>
          {members.length === 0 ? (
            <p className="chat-group-no-members">{isCreating ? 'Nenhuma outra conta ativa disponível. Você entrará automaticamente no grupo.' : 'Todas as contas ativas disponíveis já estão neste grupo.'}</p>
          ) : (
            <div className="chat-group-member-list">
              {members.map((member, index) => (
                <label className="chat-group-member-option" key={member.user_id}>
                  <input autoFocus={!isCreating && index === 0} type="checkbox" checked={memberIds.includes(member.user_id)} onChange={() => toggleMember(member.user_id)} />
                  <span className="chat-group-member-avatar" aria-hidden="true">{member.full_name.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'I'}</span>
                  <span>{member.full_name.trim() || 'Integrante'}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <p className="chat-group-privacy-note">Somente integrantes do grupo e Administradores ativos podem ver a conversa. O criador entra automaticamente.</p>
        {error && <p className="chat-group-dialog-error" role="alert">{error}</p>}
        <footer className="chat-group-dialog-actions">
          <button type="button" className="chat-group-dialog-cancel" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="submit" className="chat-group-dialog-submit" disabled={busy || (isCreating && name.trim().length < 2) || (!isCreating && memberIds.length === 0)}>
            {busy ? 'Salvando…' : isCreating ? 'Criar grupo' : 'Adicionar selecionados'}
          </button>
        </footer>
      </form>
    </div>
  );
}
