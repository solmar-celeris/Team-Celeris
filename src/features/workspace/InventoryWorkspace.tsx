import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeftRight, Boxes, CheckCircle2, ClipboardList, HardDrive, MapPin, Monitor, Package, Plus, RefreshCw, Search, ShieldCheck, Tag, X } from 'lucide-react';
import './inventory-workspace.css';

type Area = { id: string; name: string };
type Category = { id: string; item_type: 'asset' | 'consumable'; name: string; description: string; is_active: boolean };
type Location = { id: string; name: string; location_type: string; area_id: string | null; is_active: boolean };
type Item = { id: string; item_type: 'asset' | 'consumable'; code: string; name: string; description: string; category_id: string; unit: string; minimum_quantity: number; is_active: boolean };
type Asset = { id: string; item_id: string; asset_tag: string; serial_number: string; brand: string; model: string; acquisition_date: string | null; acquisition_value: number; current_estimated_value: number; condition: string; status: string; area_id: string | null; location_id: string | null; assigned_to: string | null; notes: string };
type Balance = { item_id: string; location_id: string; quantity: number };
type Movement = { id: string; movement_type: string; source_location_id: string | null; destination_location_id: string | null; area_id: string | null; reason: string; notes: string; created_at: string };
type Member = { user_id: string; full_name: string };

type Props = { client: SupabaseClient; userId: string; isAdmin: boolean };

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const quantity = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(value || 0));
const conditionLabels: Record<string, string> = { new: 'Novo', good: 'Bom', fair: 'Regular', damaged: 'Danificado', inoperative: 'Inoperante' };
const assetStatusLabels: Record<string, string> = { available: 'Disponível', in_use: 'Em uso', loaned: 'Emprestado', maintenance: 'Em manutenção', damaged: 'Danificado', written_off: 'Baixado' };
const movementLabels: Record<string, string> = { entry: 'Entrada', exit: 'Saída', transfer: 'Transferência', return: 'Devolução', adjustment_in: 'Ajuste de entrada', adjustment_out: 'Ajuste de saída' };

export default function InventoryWorkspace({ client, userId, isAdmin }: Props) {
  const [section, setSection] = useState<'overview' | 'stock' | 'assets' | 'movements' | 'registers'>('overview');
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<'item' | 'asset' | 'category' | 'location' | 'movement' | null>(null);
  const [itemType, setItemType] = useState<'asset' | 'consumable'>('consumable');
  const [itemForm, setItemForm] = useState({ code: '', name: '', description: '', category_id: '', unit: 'unidade', minimum_quantity: '0' });
  const [assetForm, setAssetForm] = useState({ item_id: '', asset_tag: '', serial_number: '', brand: '', model: '', acquisition_date: '', acquisition_value: '0', current_estimated_value: '0', condition: 'good', status: 'available', area_id: '', location_id: '', assigned_to: '', notes: '' });
  const [categoryForm, setCategoryForm] = useState({ item_type: 'consumable' as 'asset' | 'consumable', name: '', description: '' });
  const [locationForm, setLocationForm] = useState({ name: '', description: '' });
  const [movementForm, setMovementForm] = useState({ movement_type: 'entry', item_id: '', quantity: '1', source_location_id: '', destination_location_id: '', area_id: '', reason: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const results = await Promise.all([
        client.from('inventory_items').select('*').order('name'),
        client.from('inventory_categories').select('*').order('name'),
        client.from('inventory_locations').select('*').order('name'),
        client.from('inventory_assets').select('*').order('asset_tag'),
        client.from('inventory_stock_balances').select('item_id,location_id,quantity'),
        client.from('inventory_movements').select('*').order('created_at', { ascending: false }).limit(100),
        client.from('areas').select('id,name').eq('is_active', true).order('name'),
        client.from('profiles').select('user_id,full_name').eq('status', 'active').order('full_name'),
      ]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      setItems((results[0].data ?? []) as Item[]);
      setCategories((results[1].data ?? []) as Category[]);
      setLocations((results[2].data ?? []) as Location[]);
      setAssets((results[3].data ?? []) as Asset[]);
      setBalances((results[4].data ?? []) as Balance[]);
      setMovements((results[5].data ?? []) as Movement[]);
      setAreas((results[6].data ?? []) as Area[]);
      setMembers((results[7].data ?? []) as Member[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os dados do Inventário.');
    } finally { setLoading(false); }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area.name])), [areas]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.user_id, member.full_name])), [members]);
  const activeCategories = categories.filter((category) => category.is_active && category.item_type === itemType);
  const consumables = items.filter((item) => item.item_type === 'consumable' && item.is_active);
  const assetItems = items.filter((item) => item.item_type === 'asset' && item.is_active);
  const activeLocations = locations.filter((location) => location.is_active);
  const stockRows = consumables.map((item) => {
    const rows = balances.filter((balance) => balance.item_id === item.id);
    const total = rows.reduce((sum, balance) => sum + Number(balance.quantity), 0);
    return { item, total, rows, low: Number(item.minimum_quantity) > 0 && total <= Number(item.minimum_quantity) };
  });
  const filteredStock = stockRows.filter(({ item }) => (item.name + ' ' + item.code).toLowerCase().includes(search.toLowerCase()));
  const filteredAssets = assets.filter((asset) => {
    const item = itemById.get(asset.item_id);
    return (item?.name + ' ' + asset.asset_tag + ' ' + asset.serial_number).toLowerCase().includes(search.toLowerCase());
  });
  const totalAssetValue = assets.reduce((sum, asset) => sum + Number(asset.current_estimated_value), 0);
  const lowStockCount = stockRows.filter((row) => row.low).length;

  function openItem(type: 'asset' | 'consumable') {
    setItemType(type); setItemForm({ code: '', name: '', description: '', category_id: '', unit: 'unidade', minimum_quantity: '0' }); setDialog('item'); setError(''); setNotice('');
  }
  function openMovement(type = 'entry') {
    setMovementForm({ movement_type: type, item_id: '', quantity: '1', source_location_id: '', destination_location_id: '', area_id: '', reason: '', notes: '' }); setDialog('movement'); setError(''); setNotice('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!isAdmin) return;
    setSaving(true); setError(''); setNotice('');
    try {
      if (dialog === 'item') {
        if (!itemForm.category_id) throw new Error('Escolha uma categoria para continuar.');
        const { error: saveError } = await client.from('inventory_items').insert({ ...itemForm, item_type: itemType, minimum_quantity: Number(itemForm.minimum_quantity || 0), created_by: userId, updated_by: userId });
        if (saveError) throw saveError;
        setNotice('Cadastro do item concluído. Agora você pode registrar o patrimônio ou a primeira entrada no estoque.');
      } else if (dialog === 'asset') {
        const { error: saveError } = await client.from('inventory_assets').insert({ ...assetForm, acquisition_date: assetForm.acquisition_date || null, area_id: assetForm.area_id || null, location_id: assetForm.location_id || null, assigned_to: assetForm.assigned_to || null, acquisition_value: Number(assetForm.acquisition_value || 0), current_estimated_value: Number(assetForm.current_estimated_value || 0), created_by: userId, updated_by: userId });
        if (saveError) throw saveError;
        setNotice('Patrimônio cadastrado com sucesso.');
      } else if (dialog === 'category') {
        const { error: saveError } = await client.from('inventory_categories').insert({ ...categoryForm, created_by: userId });
        if (saveError) throw saveError;
        setNotice('Categoria criada.');
      } else if (dialog === 'location') {
        const { error: saveError } = await client.from('inventory_locations').insert({ name: locationForm.name, description: locationForm.description, location_type: 'other', created_by: userId });
        if (saveError) throw saveError;
        setNotice('Local de armazenamento criado.');
      } else if (dialog === 'movement') {
        const type = movementForm.movement_type;
        const source = ['exit', 'transfer', 'adjustment_out'].includes(type) ? movementForm.source_location_id : null;
        const destination = ['entry', 'return', 'adjustment_in', 'transfer'].includes(type) ? movementForm.destination_location_id : null;
        const { error: saveError } = await client.rpc('inventory_record_stock_movement', {
          p_movement_type: type, p_item_id: movementForm.item_id, p_quantity: Number(movementForm.quantity),
          p_reason: movementForm.reason, p_source_location_id: source, p_destination_location_id: destination,
          p_area_id: movementForm.area_id || null, p_notes: movementForm.notes,
        });
        if (saveError) throw saveError;
        setNotice('Movimentação registrada e saldo atualizado.');
      }
      setDialog(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar. Confira os campos e tente novamente.'); }
    finally { setSaving(false); }
  }

  async function removeLocation(location: Location) {
    if (!isAdmin || !window.confirm(`Excluir o local "${location.name}"? O local deixará de aparecer nos cadastros, mas os registros históricos serão preservados.`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      // Desativação lógica evita falhas de chave estrangeira e preserva todo o histórico.
      const { data, error: updateError } = await client
        .from('inventory_locations')
        .update({ is_active: false })
        .eq('id', location.id)
        .eq('is_active', true)
        .select('id');
      if (updateError) throw updateError;
      if (!data?.length) throw new Error('O local não foi alterado. Verifique se sua conta continua com permissão de administrador.');
      setNotice('Local excluído da lista. O histórico e os vínculos existentes foram preservados.');
      await load();
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : 'Erro desconhecido ao excluir o local.';
      setError(`Não foi possível excluir o local: ${message}`);
    } finally { setSaving(false); }
  }

  async function updateAsset(asset: Asset, patch: Partial<Asset>, eventType: string, reason: string) {
    if (!isAdmin) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const update = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
      const { error: updateError } = await client.from('inventory_assets').update(update).eq('id', asset.id);
      if (updateError) throw updateError;
      const { error: eventError } = await client.from('inventory_asset_events').insert({
        asset_id: asset.id, event_type: eventType, from_area_id: asset.area_id, to_area_id: patch.area_id ?? asset.area_id,
        from_location_id: asset.location_id, to_location_id: patch.location_id ?? asset.location_id,
        from_responsible_id: asset.assigned_to, to_responsible_id: patch.assigned_to ?? asset.assigned_to,
        previous_value: asset.current_estimated_value, new_value: patch.current_estimated_value ?? asset.current_estimated_value,
        reason, created_by: userId,
      });
      if (eventError) throw eventError;
      setNotice('Dados do patrimônio atualizados.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar o patrimônio.'); }
    finally { setSaving(false); }
  }

  const tabs = [
    { id: 'overview', label: 'Visão geral', icon: HardDrive },
    { id: 'stock', label: 'Estoque', icon: Boxes },
    { id: 'assets', label: 'Patrimônio', icon: MonitorIcon },
    { id: 'movements', label: 'Movimentações', icon: ArrowLeftRight },
    { id: 'registers', label: 'Cadastros', icon: ClipboardList },
    { id: 'ecoceleris', label: 'EcoCeleris', icon: Package },
  ] as const;

  return <section className="inventory-workspace" aria-label="Gestão integrada de patrimônio e estoque">
    <div className="inventory-welcome">
      <div className="inventory-welcome-icon"><Package /></div>
      <div><span className="inventory-eyebrow">GESTÃO INTEGRADA</span><h2>Inventário da equipe</h2><p>Consulte os materiais, acompanhe os equipamentos e saiba onde cada bem está guardado.</p></div>
      <button type="button" className="inventory-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Atualizar</button>
    </div>
    <div className="inventory-guide"><ShieldCheck size={18} /><p><strong>{isAdmin ? 'Perfil administrador:' : 'Perfil de consulta:'}</strong> {isAdmin ? 'você pode cadastrar itens, registrar movimentações e atualizar o patrimônio.' : 'você pode consultar os registros e saldos. Cadastros e saídas são realizados somente por administradores.'}</p></div>
    {error && <div className="inventory-message is-error" role="alert">{error}</div>}
    {notice && <div className="inventory-message is-success" role="status">{notice}</div>}
    <nav className="inventory-tabs" aria-label="Seções do inventário">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} type="button" className={section === tab.id ? 'is-active' : ''} onClick={() => { setSection(tab.id); setSearch(''); setError(''); setNotice(''); }}><Icon size={16} />{tab.label}</button>; })}</nav>
    {loading ? <div className="inventory-loading"><span /> Carregando os registros do Inventário…</div> : <>
      {section === 'overview' && <div className="inventory-overview">
        <div className="inventory-stat-grid">
          <article><span>Itens cadastrados</span><strong>{items.filter((item) => item.is_active).length}</strong><small>Materiais e equipamentos</small></article>
          <article><span>Patrimônios</span><strong>{assets.length}</strong><small>Equipamentos individualizados</small></article>
          <article><span>Valor estimado</span><strong>{money(totalAssetValue)}</strong><small>Valor atual do patrimônio</small></article>
          <article className={lowStockCount ? 'is-warning' : ''}><span>Estoque no mínimo</span><strong>{lowStockCount}</strong><small>Itens que precisam de atenção</small></article>
        </div>
        <div className="inventory-overview-grid">
          <article className="inventory-panel"><div className="inventory-panel-title"><Boxes /><div><h3>Estoque por material</h3><p>Quantidade disponível em todos os locais.</p></div></div>
            {stockRows.length ? <div className="inventory-compact-list">{stockRows.slice(0, 6).map(({ item, total, low }) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.code}</small></span><b className={low ? 'is-low' : ''}>{quantity(total)} {item.unit}</b></div>)}</div> : <Empty text="Ainda não há materiais cadastrados." />}
          </article>
          <article className="inventory-panel"><div className="inventory-panel-title"><HardDrive /><div><h3>Distribuição do patrimônio</h3><p>Equipamentos por situação.</p></div></div>
            <div className="inventory-status-list">{Object.entries(assetStatusLabels).map(([key, label]) => <div key={key}><span>{label}</span><strong>{assets.filter((asset) => asset.status === key).length}</strong></div>)}</div>
          </article>
        </div>
        <article className="inventory-panel"><div className="inventory-panel-title"><MapPin /><div><h3>Locais de armazenamento</h3><p>Armários e prateleira do Laboratório de automação.</p></div></div><div className="inventory-location-grid">{activeLocations.map((location) => <div key={location.id}><MapPin size={15} /><span><strong>{location.name}</strong><small>{'Local de armazenamento'}</small></span></div>)}</div></article>
      </div>}
      {section === 'stock' && <div className="inventory-section"><div className="inventory-section-head"><div><h3>Estoque de materiais</h3><p>Acompanhe o saldo por material e local de armazenamento.</p></div>{isAdmin && <button className="inventory-primary" onClick={() => openItem('consumable')}><Plus size={16} /> Cadastrar material</button>}</div>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar material ou código…" />
        {filteredStock.length ? <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Material</th><th>Categoria</th><th>Saldo total</th><th>Mínimo</th><th>Locais</th><th>Situação</th>{isAdmin && <th>Ação</th>}</tr></thead><tbody>{filteredStock.map(({ item, total, rows, low }) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.code}</small></td><td>{categoryById.get(item.category_id)?.name ?? '—'}</td><td><b>{quantity(total)} {item.unit}</b></td><td>{quantity(Number(item.minimum_quantity))}</td><td>{rows.filter((row) => Number(row.quantity) > 0).map((row) => <small key={row.location_id}>{locationById.get(row.location_id)?.name}: {quantity(Number(row.quantity))}</small>) .filter(Boolean).length ? rows.filter((row) => Number(row.quantity) > 0).map((row) => <small key={row.location_id}>{locationById.get(row.location_id)?.name}: {quantity(Number(row.quantity))}</small>) : 'Sem saldo'}</td><td><span className={low ? 'inventory-pill is-warning' : 'inventory-pill is-ok'}>{low ? 'Abaixo do mínimo' : 'Regular'}</span></td>{isAdmin && <td><button className="inventory-text-action" onClick={() => { setMovementForm({ movement_type: 'entry', item_id: item.id, quantity: '1', source_location_id: '', destination_location_id: '', area_id: '', reason: '', notes: '' }); setDialog('movement'); }}>Movimentar</button></td>}</tr>)}</tbody></table></div> : <Empty text="Nenhum material encontrado. Cadastre o primeiro material para começar." />}
      </div>}
      {section === 'assets' && <div className="inventory-section"><div className="inventory-section-head"><div><h3>Patrimônio permanente</h3><p>Equipamentos individualizados, com valores, conservação, setor e responsável.</p></div>{isAdmin && <div className="inventory-head-actions"><button className="inventory-secondary" onClick={() => openItem('asset')}><Plus size={15} /> Novo tipo</button><button className="inventory-primary" onClick={() => { setAssetForm({ item_id: assetItems[0]?.id ?? '', asset_tag: '', serial_number: '', brand: '', model: '', acquisition_date: '', acquisition_value: '0', current_estimated_value: '0', condition: 'good', status: 'available', area_id: '', location_id: '', assigned_to: '', notes: '' }); setDialog('asset'); }}><Plus size={16} /> Cadastrar patrimônio</button></div>}</div>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar equipamento, etiqueta ou número de série…" />
        {filteredAssets.length ? <div className="inventory-asset-grid">{filteredAssets.map((asset) => { const item = itemById.get(asset.item_id); return <article className="inventory-asset-card" key={asset.id}><div className="inventory-asset-card-top"><span className="inventory-asset-icon"><Monitor /></span><span className="inventory-pill">{assetStatusLabels[asset.status] ?? asset.status}</span></div><h4>{item?.name ?? 'Equipamento'}</h4><p>{asset.brand} {asset.model}</p><div className="inventory-asset-facts"><span>Etiqueta<strong>{asset.asset_tag}</strong></span><span>Setor<strong>{asset.area_id ? areaById.get(asset.area_id) ?? '—' : 'Não definido'}</strong></span><span>Responsável<strong>{asset.assigned_to ? memberById.get(asset.assigned_to) ?? '—' : 'Não atribuído'}</strong></span><span>Conservação<strong>{conditionLabels[asset.condition] ?? asset.condition}</strong></span></div><div className="inventory-asset-value"><span>Valor de aquisição <b>{money(Number(asset.acquisition_value))}</b></span><span>Valor atual estimado <strong>{money(Number(asset.current_estimated_value))}</strong></span></div>{isAdmin && <div className="inventory-asset-actions"><button type="button" onClick={() => { const next = window.prompt('Informe o novo valor estimado (R$):', String(asset.current_estimated_value)); if (next !== null && Number.isFinite(Number(next)) && Number(next) >= 0) void updateAsset(asset, { current_estimated_value: Number(next) }, 'value_updated', 'Atualização do valor estimado'); }}>Atualizar valor</button><button type="button" onClick={() => { const next = window.prompt('Observação sobre a situação do equipamento:', asset.notes); if (next !== null) void updateAsset(asset, { notes: next }, 'condition_changed', 'Atualização cadastral'); }}>Editar observação</button></div>}</article>; })}</div> : <Empty text="Nenhum patrimônio cadastrado. Cadastre primeiro o tipo de equipamento e depois sua etiqueta patrimonial." />}
      </div>}
      {section === 'movements' && <div className="inventory-section"><div className="inventory-section-head"><div><h3>Histórico de movimentações</h3><p>Registro cronológico das entradas, saídas, transferências e devoluções.</p></div>{isAdmin && <button className="inventory-primary" onClick={() => openMovement()}><Plus size={16} /> Nova movimentação</button>}</div>
        {movements.length ? <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Data</th><th>Tipo</th><th>Motivo</th><th>Origem</th><th>Destino</th><th>Setor</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{new Date(movement.created_at).toLocaleString('pt-BR')}</td><td><span className="inventory-pill">{movementLabels[movement.movement_type] ?? movement.movement_type}</span></td><td>{movement.reason}</td><td>{movement.source_location_id ? locationById.get(movement.source_location_id)?.name ?? '—' : '—'}</td><td>{movement.destination_location_id ? locationById.get(movement.destination_location_id)?.name ?? '—' : '—'}</td><td>{movement.area_id ? areaById.get(movement.area_id) ?? '—' : '—'}</td></tr>)}</tbody></table></div> : <Empty text="Ainda não existem movimentações registradas." />}
      </div>}
      {section === 'registers' && <div className="inventory-section"><div className="inventory-section-head"><div><h3>Cadastros básicos</h3><p>Organize as categorias e os locais antes de registrar materiais e patrimônio.</p></div></div>
        <div className="inventory-register-grid"><article className="inventory-panel"><div className="inventory-panel-title"><Tag /><div><h3>Categorias</h3><p>Classifique equipamentos e materiais.</p></div></div><div className="inventory-register-list">{categories.map((category) => <div key={category.id}><span><strong>{category.name}</strong><small>{category.item_type === 'asset' ? 'Patrimônio' : 'Material de consumo'}{!category.is_active ? ' · Inativa' : ''}</small></span>{isAdmin && category.is_active && <button onClick={async () => { const { error } = await client.from('inventory_categories').update({ is_active: false }).eq('id', category.id); if (error) setError(error.message); else void load(); }}>Desativar</button>}</div>)}</div>{isAdmin && <button className="inventory-secondary" onClick={() => { setCategoryForm({ item_type: 'consumable', name: '', description: '' }); setDialog('category'); }}><Plus size={15} /> Nova categoria</button>}</article>
        <article className="inventory-panel"><div className="inventory-panel-title"><MapPin /><div><h3>Locais de armazenamento</h3><p>Locais físicos. Setores são apenas a área de atuação dos membros, não locais de guarda.</p></div></div><div className="inventory-register-list">{locations.filter((location) => location.is_active).map((location) => <div key={location.id}><span><strong>{location.name}</strong><small>Local de armazenamento</small></span>{isAdmin && <button type="button" className="inventory-text-action" onClick={() => void removeLocation(location)}>Excluir</button>}</div>)}</div>{isAdmin && <button className="inventory-secondary" onClick={() => { setLocationForm({ name: '', description: '' }); setDialog('location'); }}><Plus size={15} /> Adicionar local</button>}</article></div>
      </div>}
    </>}
    {dialog && <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialog(null); }}><section className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-modal-title"><header><div><span className="inventory-eyebrow">CADASTRO DO INVENTÁRIO</span><h3 id="inventory-modal-title">{dialog === 'item' ? itemType === 'asset' ? 'Novo tipo de equipamento' : 'Novo material de consumo' : dialog === 'asset' ? 'Novo patrimônio' : dialog === 'category' ? 'Nova categoria' : dialog === 'location' ? 'Novo local' : 'Registrar movimentação'}</h3></div><button type="button" aria-label="Fechar" onClick={() => !saving && setDialog(null)}><X /></button></header>
      <div className="inventory-modal-help"><CheckCircle2 size={17} /><p>{dialog === 'item' ? 'Preencha os dados básicos. O código deve ser único e fácil de identificar.' : dialog === 'asset' ? 'Cada equipamento recebe uma etiqueta patrimonial própria, mesmo que existam várias unidades do mesmo modelo.' : dialog === 'movement' ? 'Escolha o material, a quantidade e o local. O sistema valida o saldo antes de confirmar.' : 'Use nomes claros para facilitar a consulta de toda a equipe.'}</p></div>
      <form onSubmit={submit} className="inventory-form">
        {dialog === 'item' && <><label>Código de identificação *<input required maxLength={40} value={itemForm.code} onChange={(e) => setItemForm({ ...itemForm, code: e.target.value.toUpperCase() })} placeholder="Ex.: MAT-001" /></label><label>Nome do item *<input required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="Ex.: Cabo USB" /></label><label>Categoria *<select required value={itemForm.category_id} onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}><option value="">Selecione uma categoria</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{activeCategories.length === 0 && <small>Cadastre uma categoria primeiro na seção Cadastros.</small>}</label><label>Unidade<input required maxLength={24} value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} placeholder="unidade, caixa, metro…" /></label>{itemType === 'consumable' && <label>Quantidade mínima<input type="number" min="0" step="0.001" value={itemForm.minimum_quantity} onChange={(e) => setItemForm({ ...itemForm, minimum_quantity: e.target.value })} /></label>}<label className="span-2">Descrição<textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} /></label></>}
        {dialog === 'asset' && <><label>Tipo de equipamento *<select required value={assetForm.item_id} onChange={(e) => setAssetForm({ ...assetForm, item_id: e.target.value })}><option value="">Selecione o tipo</option>{assetItems.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select>{!assetItems.length && <small>Cadastre antes um tipo de equipamento na seção Patrimônio.</small>}</label><label>Etiqueta patrimonial *<input required value={assetForm.asset_tag} onChange={(e) => setAssetForm({ ...assetForm, asset_tag: e.target.value.toUpperCase() })} placeholder="Ex.: PAT-001" /></label><label>Marca<input value={assetForm.brand} onChange={(e) => setAssetForm({ ...assetForm, brand: e.target.value })} /></label><label>Modelo<input value={assetForm.model} onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })} /></label><label>Número de série<input value={assetForm.serial_number} onChange={(e) => setAssetForm({ ...assetForm, serial_number: e.target.value })} /></label><label>Data de aquisição<input type="date" value={assetForm.acquisition_date} onChange={(e) => setAssetForm({ ...assetForm, acquisition_date: e.target.value })} /></label><label>Valor de aquisição (R$)<input type="number" min="0" step="0.01" value={assetForm.acquisition_value} onChange={(e) => setAssetForm({ ...assetForm, acquisition_value: e.target.value })} /></label><label>Valor atual estimado (R$)<input type="number" min="0" step="0.01" value={assetForm.current_estimated_value} onChange={(e) => setAssetForm({ ...assetForm, current_estimated_value: e.target.value })} /></label><label>Setor<select value={assetForm.area_id} onChange={(e) => setAssetForm({ ...assetForm, area_id: e.target.value })}><option value="">Não definido</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label>Local de armazenamento<select value={assetForm.location_id} onChange={(e) => setAssetForm({ ...assetForm, location_id: e.target.value })}><option value="">Não definido</option>{activeLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Responsável<select value={assetForm.assigned_to} onChange={(e) => setAssetForm({ ...assetForm, assigned_to: e.target.value })}><option value="">Sem responsável</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</select></label><label>Conservação<select value={assetForm.condition} onChange={(e) => setAssetForm({ ...assetForm, condition: e.target.value })}>{Object.entries(conditionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Situação<select value={assetForm.status} onChange={(e) => setAssetForm({ ...assetForm, status: e.target.value })}>{Object.entries(assetStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="span-2">Observações<textarea value={assetForm.notes} onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })} /></label></>}
        {dialog === 'category' && <><label>Tipo de cadastro<select value={categoryForm.item_type} onChange={(e) => setCategoryForm({ ...categoryForm, item_type: e.target.value as 'asset' | 'consumable' })}><option value="consumable">Material de consumo</option><option value="asset">Patrimônio / equipamento</option></select></label><label>Nome da categoria *<input required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Ex.: Ferramentas" /></label><label className="span-2">Descrição<textarea value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></label></>}
        {dialog === 'location' && <><label>Nome do local *<input required value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} placeholder="Ex.: Oficina de manutenção" /></label><label className="span-2">Descrição<textarea value={locationForm.description} onChange={(e) => setLocationForm({ ...locationForm, description: e.target.value })} /></label></>}
        {dialog === 'movement' && <><label>Tipo de movimentação<select value={movementForm.movement_type} onChange={(e) => setMovementForm({ ...movementForm, movement_type: e.target.value, source_location_id: '', destination_location_id: '' })}>{Object.entries(movementLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Material *<select required value={movementForm.item_id} onChange={(e) => setMovementForm({ ...movementForm, item_id: e.target.value })}><option value="">Selecione um material</option>{consumables.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label><label>Quantidade *<input required type="number" min="0.001" step="0.001" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })} /></label>{['exit', 'transfer', 'adjustment_out'].includes(movementForm.movement_type) && <label>Local de origem *<select required value={movementForm.source_location_id} onChange={(e) => setMovementForm({ ...movementForm, source_location_id: e.target.value })}><option value="">Selecione</option>{activeLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}{['entry', 'return', 'adjustment_in', 'transfer'].includes(movementForm.movement_type) && <label>Local de destino *<select required value={movementForm.destination_location_id} onChange={(e) => setMovementForm({ ...movementForm, destination_location_id: e.target.value })}><option value="">Selecione</option>{activeLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}<label>Setor relacionado<select value={movementForm.area_id} onChange={(e) => setMovementForm({ ...movementForm, area_id: e.target.value })}><option value="">Não se aplica</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label className="span-2">Motivo da movimentação *<input required minLength={3} value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })} placeholder="Ex.: Reposição de materiais para atividade" /></label><label className="span-2">Observações<textarea value={movementForm.notes} onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })} /></label></>}
        {error && <p className="inventory-form-error span-2" role="alert">{error}</p>}
        <div className="inventory-form-actions span-2"><button type="button" className="inventory-secondary" onClick={() => setDialog(null)} disabled={saving}>Cancelar</button><button type="submit" className="inventory-primary" disabled={saving || (dialog === 'item' && activeCategories.length === 0) || (dialog === 'asset' && assetItems.length === 0)}>{saving ? 'Salvando…' : 'Salvar cadastro'}</button></div>
      </form></section></div>}
  </section>;
}

function MonitorIcon() { return <HardDrive size={16} />; }
function Empty({ text }: { text: string }) { return <div className="inventory-empty"><Package size={25} /><strong>Nenhum registro por aqui</strong><p>{text}</p></div>; }
function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="inventory-search"><Search size={16} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>; }
