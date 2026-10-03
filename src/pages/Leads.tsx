import { useEffect, useState } from 'react';
import { formatBrPhone } from '../../shared/phone';
import { api } from '../api';

type Lead = {
  id: string; public_ref: string; buyer_name: string; buyer_phone: string; created_at: string; diagnostic_interest_at: string | null;
  public_name_ok: boolean; career: string; moment: string | null; daily_time: string | null; utm_content: string | null; utm_term: string | null; days_done: number;
  interest_detail?: { want?: string } | null;
};

const WANT: Record<string, string> = { roteiro: 'Roteiro passo a passo', cursos: 'Cursos que valem a pena', vagas: 'Primeiras oportunidades', mentoria: 'Conversar com profissional' };


const MOMENT: Record<string, string> = { first: 'Primeira área', change: 'Mudar de área', explore: 'Explorar sem sair' };
const dt = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function csv(rows: Lead[]) {
  const head = ['data', 'nome', 'whatsapp', 'codigo', 'primeiro_caminho', 'momento', 'tempo_dia', 'interesse_diagnostico', 'quer', 'dias_plano', 'anuncio', 'conjunto'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((l) => [dt(l.created_at), l.buyer_name, `+${l.buyer_phone}`, l.public_ref, l.career, MOMENT[l.moment ?? ''] ?? '', l.daily_time ?? '',
    l.diagnostic_interest_at ? dt(l.diagnostic_interest_at) : 'não', WANT[l.interest_detail?.want ?? ''] ?? '', l.days_done, l.utm_content ?? '', l.utm_term ?? ''].map(esc).join(';'));
  return '﻿' + [head.join(';'), ...lines].join('\n');
}

export function Leads() {
  const [onlyInterest, setOnlyInterest] = useState(false);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLeads(null);
    setSel(new Set());
    api<{ leads: Lead[] }>('GET', `/api/admin/leads${onlyInterest ? '?interest=1' : ''}`).then((r) => setLeads(r.leads)).catch((e) => setError((e as Error).message));
  }, [onlyInterest, reload]);

  function toggle(id: string) {
    setSel((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function purge() {
    if (!sel.size) return;
    const typed = window.prompt(`Apagar ${sel.size} lead(s) de vez, com respostas, pedidos e acessos? Isso não pode ser desfeito.\n\nDigite APAGAR para confirmar:`);
    if (typed !== 'APAGAR') return;
    setBusy(true);
    setError(null);
    try {
      const r = await api('POST', '/api/admin/leads/purge', { order_ids: [...sel], confirm: 'APAGAR' });
      setNotice(`${r.sessions} teste(s) apagado(s).`);
      setReload((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  function download() {
    if (!leads) return;
    const url = URL.createObjectURL(new Blob([csv(leads)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-mapa-da-carreira${onlyInterest ? '-interessados' : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = leads?.length ?? 0;
  const interested = leads?.filter((l) => l.diagnostic_interest_at).length ?? 0;

  return (
    <div>
      <div className="viz-toolbar">
        <div className="viz-presets" role="group" aria-label="Filtro">
          <button type="button" aria-pressed={!onlyInterest} onClick={() => setOnlyInterest(false)}>Todos</button>
          <button type="button" aria-pressed={onlyInterest} onClick={() => setOnlyInterest(true)}>Só interessados no diagnóstico</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn secondary" style={{ width: 'auto', minHeight: 40, color: '#b42318' }} onClick={purge} disabled={!sel.size || busy}>
            {busy ? 'Apagando…' : `Apagar selecionados${sel.size ? ` (${sel.size})` : ''}`}
          </button>
          <button type="button" className="btn secondary" style={{ width: 'auto', minHeight: 40 }} onClick={download} disabled={!leads?.length}>Exportar CSV</button>
        </div>
      </div>
      {error && <div className="status error">{error}</div>}
      {notice && <div className="status ok" role="status">{notice}</div>}
      {!leads ? <div className="spinner dark" /> : (
        <>
          <p className="small muted">{total} lead(s){!onlyInterest && ` · ${interested} com interesse no diagnóstico`}. Mostrando os 1.000 mais recentes.</p>
          <div className="viz-table-wrap">
            <table className="admin">
              <thead><tr><th><input type="checkbox" aria-label="Selecionar todos" checked={leads.length > 0 && sel.size === leads.length}
                onChange={(e) => setSel(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())} /></th><th>Data</th><th>Nome</th><th>WhatsApp</th><th>1º caminho</th><th>Momento</th><th>Interesse</th><th>Quer</th><th>Plano</th><th>Anúncio</th></tr></thead>
              <tbody>
                {leads.length === 0 && <tr><td colSpan={10} className="muted">Nenhum lead ainda.</td></tr>}
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" aria-label={`Selecionar ${l.buyer_name}`} checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
                    <td>{dt(l.created_at)}</td>
                    <td>{l.buyer_name}</td>
                    <td><a href={`https://wa.me/${l.buyer_phone}?text=${encodeURIComponent(`Olá, ${l.buyer_name.split(' ')[0]}! Vi que você fez o Mapa da Carreira`)}`} target="_blank" rel="noreferrer">{formatBrPhone(l.buyer_phone)}</a></td>
                    <td>{l.career}</td>
                    <td>{MOMENT[l.moment ?? ''] ?? '—'}</td>
                    <td>{l.diagnostic_interest_at ? <strong style={{ color: '#006300' }}>Sim · {dt(l.diagnostic_interest_at)}</strong> : 'Não'}</td>
                    <td>{WANT[l.interest_detail?.want ?? ''] ?? '—'}</td>
                    <td>{l.days_done}/7</td>
                    <td>{l.utm_content ?? '(direto)'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
