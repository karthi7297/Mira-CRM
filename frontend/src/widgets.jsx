import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, registerToast } from './api';
import { useAuth } from './auth';

/* Compact axis numbers: 950 → "950", 8,85,000 → "8.9L". */
const fmtTick = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) < 1000) return String(Math.round(n));
  try {
    return Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(Math.round(n));
  }
};

const resolveLabel = (d, labelKey) => {
  const lab = labelKey
    ? d[labelKey]
    : (d.label ?? d.month ?? d.date ?? d.name ?? d.status ?? d.category ?? d.method ?? d.id);
  const s = String(lab ?? '');
  return s.length > 14 ? s.slice(0, 13) + '…' : s;
};

function BarChart({ data, keys, colors, height = 200, showLegend = true, labelKey = null }) {
  if (!data || !data.length) return <div className="empty">No data available</div>;
  const maxVal = Math.max(...data.flatMap(d => keys.map(k => Number(d[k] || 0))), 1);
  // Fixed viewBox with real padding: the plot never stretches, bars never
  // balloon, and axis labels always have room. `height` = total SVG height.
  const W = 560;
  const padL = 46, padR = 10, padT = 20, padB = 30;
  const plotW = W - padL - padR;
  const plotH = Math.max(60, height - padT - padB);
  const H = padT + plotH + padB;
  const n = data.length, nk = keys.length;
  const groupW = plotW / n;
  const barW = Math.max(8, Math.min(30, (groupW * 0.62) / nk));
  const gapIn = Math.min(6, barW * 0.3);
  const barsW = nk * barW + (nk - 1) * gapIn;
  const baseY = padT + plotH;
  const yOf = (v) => padT + plotH - (Number(v || 0) / maxVal) * plotH;

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
        {/* Gridlines + Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={ratio}>
            <line x1={padL} y1={padT + plotH * (1 - ratio)} x2={W - padR} y2={padT + plotH * (1 - ratio)}
              stroke={ratio === 0 ? '#cbd5e1' : '#e8eaed'} strokeWidth="1" />
            <text x={padL - 8} y={padT + plotH * (1 - ratio) + 4} fontSize="10.5" fill="#78828c" textAnchor="end">
              {fmtTick(maxVal * ratio)}
            </text>
          </g>
        ))}
        {/* Bars */}
        {data.map((d, di) =>
          keys.map((key, ki) => {
            const v = Number(d[key] || 0);
            if (v <= 0) return null;
            const h = Math.max(2, (v / maxVal) * plotH);
            const x = padL + di * groupW + (groupW - barsW) / 2 + ki * (barW + gapIn);
            const r = Math.min(4, barW / 2);
            return (
              <g key={`${di}-${ki}`}>
                <rect x={x} y={baseY - h} width={barW} height={h}
                  fill={colors[ki % colors.length]} rx={r} ry={r}>
                  <title>{`${resolveLabel(d, labelKey)} · ${key}: ${Number(v).toLocaleString('en-IN')}`}</title>
                </rect>
                {nk === 1 && (
                  <text x={x + barW / 2} y={baseY - h - 5} fontSize="10" fontWeight="650" fill="#475569" textAnchor="middle">
                    {fmtTick(v)}
                  </text>
                )}
              </g>
            );
          })
        )}
        {/* X-axis labels */}
        {data.map((d, di) => (
          <text key={di} x={padL + di * groupW + groupW / 2} y={baseY + 19} fontSize="10.5" fill="#414b55" textAnchor="middle">
            <title>{String(labelKey ? d[labelKey] : (d.label ?? d.month ?? d.date ?? d.name ?? d.status ?? d.category ?? d.method ?? d.id ?? ''))}</title>
            {resolveLabel(d, labelKey)}
          </text>
        ))}
      </svg>
      {showLegend && nk > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {keys.map((key, i) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#414b55' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length] }}></span>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LineChart({ data, keys, colors, height = 200, showLegend = true, smooth = true, labelKey = null }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!data || !data.length) return <div className="empty">No data available</div>;
  const maxVal = Math.max(...data.flatMap(d => keys.map(k => Number(d[k] || 0))), 1);
  const minVal = Math.min(...data.flatMap(d => keys.map(k => Number(d[k] || 0))), 0);
  const range = maxVal - minVal || 1;
  // Fixed viewBox with real padding — same discipline as BarChart.
  const W = 560;
  const padL = 46, padR = 10, padT = 14, padB = 30;
  const plotW = W - padL - padR;
  const plotH = Math.max(60, height - padT - padB);
  const H = padT + plotH + padB;
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  const X = (i) => padL + i * stepX;
  const Y = (v) => padT + plotH - ((Number(v || 0) - minVal) / range) * plotH;

  const getPath = (key) => {
    const points = data.map((d, i) => ({ x: X(i), y: Y(d[key]) }));
    if (smooth && points.length > 2) {
      return points.map((p, i) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = points[i - 1];
        const cp1x = (prev.x + p.x) / 2;
        return `C ${cp1x} ${prev.y} ${cp1x} ${p.y} ${p.x} ${p.y}`;
      }).join(' ');
    }
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };
  const areaPath = (key) => `${getPath(key)} L ${X(data.length - 1)} ${padT + plotH} L ${X(0)} ${padT + plotH} Z`;

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
        <defs>
          {keys.map((key, ki) => (
            <linearGradient key={key} id={`${gid}-a${ki}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[ki % colors.length]} stopOpacity="0.22" />
              <stop offset="100%" stopColor={colors[ki % colors.length]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {/* Gridlines + Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={ratio}>
            <line x1={padL} y1={padT + plotH * (1 - ratio)} x2={W - padR} y2={padT + plotH * (1 - ratio)}
              stroke={ratio === 0 ? '#cbd5e1' : '#e8eaed'} strokeWidth="1" />
            <text x={padL - 8} y={padT + plotH * (1 - ratio) + 4} fontSize="10.5" fill="#78828c" textAnchor="end">
              {fmtTick(minVal + range * ratio)}
            </text>
          </g>
        ))}
        {/* Area fills */}
        {keys.map((key, ki) => (
          <path key={key} d={areaPath(key)} fill={`url(#${gid}-a${ki})`} />
        ))}
        {/* Lines */}
        {keys.map((key, ki) => (
          <path
            key={`line-${key}`}
            d={getPath(key)}
            fill="none"
            stroke={colors[ki % colors.length]}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* Data points */}
        {keys.map((key, ki) => (
          <g key={`points-${key}`}>
            {data.map((d, i) => (
              <circle key={i} cx={X(i)} cy={Y(d[key])} r={3.5}
                fill={colors[ki % colors.length]} stroke="#fff" strokeWidth="2">
                <title>{`${resolveLabel(d, labelKey)} · ${key}: ${Number(d[key] || 0).toLocaleString('en-IN')}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {/* X-axis labels */}
        {data.map((d, i) => (
          <text key={i} x={X(i)} y={padT + plotH + 19} fontSize="10.5" fill="#414b55" textAnchor="middle">
            {resolveLabel(d, labelKey)}
          </text>
        ))}
      </svg>
      {showLegend && keys.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {keys.map((key, i) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#414b55' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length] }}></span>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PieChart({ data, labelKey = 'label', valueKey = 'value', colors, height = 200 }) {
  if (!data || !data.length) return <div className="empty">No data available</div>;
  const total = data.reduce((sum, d) => sum + Number(d[valueKey] || 0), 0);
  const radius = Math.min(height, 200) / 2 - 10;
  const cx = 150;
  const cy = height / 2;
  
  let currentAngle = -90;
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'center', flexWrap: 'wrap', width: '100%' }}>
      <svg viewBox={`0 0 300 ${height}`} style={{ width: '100%', height: 'auto', maxWidth: 300, minHeight: 200 }} preserveAspectRatio="xMidYMid meet">
        {data.map((d, i) => {
          const value = Number(d[valueKey] || 0);
          const percentage = total > 0 ? value / total : 0;
          const angle = percentage * 360;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;
          currentAngle = endAngle;
          
          const x1 = cx + radius * Math.cos(startAngle * Math.PI / 180);
          const y1 = cy + radius * Math.sin(startAngle * Math.PI / 180);
          const x2 = cx + radius * Math.cos(endAngle * Math.PI / 180);
          const y2 = cy + radius * Math.sin(endAngle * Math.PI / 180);
          const largeArc = angle > 180 ? 1 : 0;
          
          return (
            <path
              key={i}
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={colors[i % colors.length]}
              stroke="#fff"
              strokeWidth="2"
            />
          );
        })}
        <circle cx={cx} cy={cy} r={radius * 0.5} fill="var(--surface)" />
        <text x={cx} y={cy - 4} fontSize="14" fontWeight="700" fill="var(--ink)" textAnchor="middle" fontFamily="var(--font-mono)">{total.toLocaleString('en-IN')}</text>
        <text x={cx} y={cy + 14} fontSize="11" fill="var(--muted)" textAnchor="middle">Total</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: colors[i % colors.length] }}></span>
            <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{d[labelKey]}</span>
            <span style={{ fontWeight: 650, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
              {total > 0 ? Math.round((Number(d[valueKey] || 0) / total) * 100) : 0}% ({Number(d[valueKey] || 0).toLocaleString('en-IN')})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KPICard({ title, value, subtitle, trend, trendUp = true, icon, color = 'var(--accent)', compact = false }) {
  if (compact) {
    return (
      <div className="card kpi-compact" style={{ borderTop: `3px solid ${color}` }}>
        <span className="kpi-title">{title}</span>
        <b className="kpi-val">{value}{trend && (
          <span className={'kpi-trend ' + (trendUp ? 'up' : 'down')}>{trendUp ? '▲' : '▼'} {trend}</span>
        )}</b>
        {subtitle && <span className="kpi-sub">{subtitle}</span>}
      </div>
    );
  }
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h4>{title}</h4>
          <b style={{ fontSize: 'clamp(20px, 2.2vw, 26px)', color: 'var(--ink)' }}>{value}</b>
          {subtitle && <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>{subtitle}</small>}
        </div>
        {icon && (
          <div style={{ width: 48, height: 48, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${color}15`, color }}>
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12.5, fontWeight: 600, color: trendUp ? 'var(--ok)' : 'var(--bad)' }}>
          <span>{trendUp ? '▲' : '▼'} {trend}</span>
          <span style={{ color: 'var(--muted)' }}>vs last period</span>
        </div>
      )}
    </div>
  );
}

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    registerToast((msg, kind = 'success') => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, msg, kind }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 6000 : 3200);
    });
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={'toast ' + (i.kind === 'error' ? 'toast-err' : 'toast-ok')}>
          <span className="toast-icon" aria-hidden="true">{i.kind === 'error' ? '✕' : '✓'}</span>
          {i.msg}
        </div>
      ))}
    </div>
  );
}

/* Attendance progress bar — the single standard for every attendance %
   shown in tables and lists (green ≥75, amber 50–74, red <50). */
function AttendanceBar({ value, width = 150 }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  const color = v >= 75 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width, maxWidth: '100%' }}>
      <span style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${v}%`, height: '100%', background: color, borderRadius: 4 }} />
      </span>
      <span style={{ fontWeight: 650, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>{v}%</span>
    </span>
  );
}

export { BarChart, LineChart, PieChart, KPICard, AttendanceBar };

export function CommandPalette() {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [hits, setHits] = useState([]);
  const { user } = useAuth(); const nav = useNavigate();
  useEffect(() => {
    const t = () => { setOpen(o => !o); setQ(''); };
    window.addEventListener('toggle-palette', t);
    return () => { window.removeEventListener('toggle-palette', t); };
  }, []);
  useEffect(() => {
    if (!open || q.length < 2) { setHits([]); return; }
    const needle = q.toLowerCase();
    const jobs = [];
    if (user?.role === 'organization') jobs.push(api.leads(`?search=${encodeURIComponent(q)}`).then(r => r.map(x => ({ label: `${x.id} · ${x.organization}`, to: `/leads/${x.id}` }))).catch(() => []));
    jobs.push(api.customers(`?search=${encodeURIComponent(q)}`).then(r => r.map(x => ({ label: `${x.id} · ${x.name}`, to: user?.role === 'institution' ? '/college' : `/customers/${x.id}` }))).catch(() => []));
    jobs.push(api.batches().then(r => r.filter(b => b.id.toLowerCase().includes(needle)).slice(0, 4).map(b => ({ label: `${b.id} · ${b.program_name}`, to: `/batches/${b.id}` }))).catch(() => []));
    jobs.push(api.invoices().then(r => r.filter(i => i.id.toLowerCase().includes(needle)).slice(0, 4).map(i => ({ label: `${i.id} · ${i.customer_name}`, to: `/invoices/${i.id}` }))).catch(() => []));
    // Student records are a trainer's own list — nobody else can open /students.
    if (user?.role === 'trainer') jobs.push(api.students().then(r => r.filter(s => s.name.toLowerCase().includes(needle)).slice(0, 4).map(s => ({ label: `${s.id} · ${s.name}`, to: '/students' }))).catch(() => []));
    Promise.all(jobs).then(a => setHits(a.flat().slice(0, 12)));
  }, [q, open, user?.role]);
  if (!open) return null;
  const scope = user?.role === 'trainer' ? 'leads, colleges, batches, invoices, students' : 'colleges, batches, invoices';
  return <div className="modal" onClick={() => setOpen(false)}><div onClick={e => e.stopPropagation()}>
    <input autoFocus className="palette-input" placeholder={`Search ${scope}… (Esc closes)`} value={q} onChange={e => setQ(e.target.value)}
      onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && hits[0]) { nav(hits[0].to); setOpen(false); } }} />
    {hits.map((h, i) => <div key={i} className="palette-item" onClick={() => { nav(h.to); setOpen(false); }}>{h.label}</div>)}
    {q.length >= 2 && hits.length === 0 && <p className="palette-empty">No matches.</p>}
  </div></div>;
}
