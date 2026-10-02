import { useEffect, useState } from 'react';
import { formatBrPhone } from '../../shared/phone';
import { api } from '../api';

type Lead = {
  id: string; public_ref: string; buyer_name: string; buyer_phone: string; created_at: string; diagnostic_interest_at: string | null;
  public_name_ok: boolean; career: string; moment: string | null; daily_time: string | null; utm_content: string | null; utm_term: string | null; days_done: number;
};

const MOMENT: Record<string, string> = { first: 'Primeira área', change: 'Mudar de área', explore: 'Explorar sem sair' };
const dt = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function csv(rows: Lead[]) {
  const head = ['data', 'nome', 'whatsapp', 'codigo', 'primeiro_caminho', 'momento', 'tempo_dia', 'interesse_diagnostico', 'dias_plano', 'anuncio', 'conjunto'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((l) => [dt(l.created_at), l.buyer_name, `+${l.buyer_phone}`, l.public_ref, l.career, MOMENT[l.moment ?? ''] ?? '', l.daily_time ?? '',
    l.diagnostic_interest_at ? dt(l.diagnostic_interest_at) : 'não', l.days_done, l.utm_content ?? '', l.utm_term ?? ''].map(esc).join(';'));
  return '﻿' + [head.join(';'), ...lines].join('\n');
}

export function Leads() {
  const [onlyInterest, setOnlyInterest] = useState(false);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLeads(null);
    api<{ leads: Lead[] }>('GET', `/api/admin/leads${onlyInterest ? '?interest=1' : ''}`).then((r) => setLeads(r.leads)).catch((e) => setError((e as Error).message));
  }, [onlyInterest]);

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
        <button type="button" className="btn secondary" style={{ width: 'auto', minHeight: 40 }} onClick={download} disabled={!leads?.length}>Exportar CSV</button>
      </div>
      {error && <div className="status error">{error}</div>}
      {!leads ? <div className="spinner dark" /> : (
        <>
          <p className="small muted">{total} lead(s){!onlyInterest && ` · ${interested} com interesse no diagnóstico`}. Mostrando os 1.000 mais recentes.</p>
          <div className="viz-table-wrap">
            <table className="admin">
              <thead><tr><th>Data</th><th>Nome</th><th>WhatsApp</th><th>1º caminho</th><th>Momento</th><th>Interesse</th><th>Plano</th><th>Anúncio</th></tr></thead>
              <tbody>
                {leads.length === 0 && <tr><td colSpan={8} className="muted">Nenhum lead ainda.</td></tr>}
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>{dt(l.created_at)}</td>
                    <td>{l.buyer_name}</td>
                    <td><a href={`https://wa.me/${l.buyer_phone}?text=${encodeURIComponent(`Olá, ${l.buyer_name.split(' ')[0]}! Vi que você fez o Mapa da Carreira`)}`} target="_blank" rel="noreferrer">{formatBrPhone(l.buyer_phone)}</a></td>
                    <td>{l.career}</td>
                    <td>{MOMENT[l.moment ?? ''] ?? '—'}</td>
                    <td>{l.diagnostic_interest_at ? <strong style={{ color: '#006300' }}>Sim · {dt(l.diagnostic_interest_at)}</strong> : 'Não'}</td>
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
