import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, registerToast } from './api';
import { useAuth } from './auth';

function BarChart({ data, keys, colors, height = 200, showLegend = true }) {
  if (!data || !data.length) return <div className="empty">No data available</div>;
  const maxVal = Math.max(...data.flatMap(d => keys.map(k => Number(d[k] || 0))), 1);
  const barWidth = 32;
  const gap = 12;
  const chartWidth = data.length * (barWidth * keys.length + gap) - gap;
  const viewBoxWidth = Math.max(chartWidth, 400);
  
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8, width: '100%' }}>
      <svg viewBox={`0 0 ${viewBoxWidth} ${height + 40}`} style={{ width: '100%', height: 'auto', minWidth: '100%', maxWidth: '100%' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="gridLines" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="transparent" />
            <stop offset="100%" stop-color="rgba(200, 200, 200, 0.3)" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <line key={i} x1="0" y1={height * (1 - ratio)} x2={chartWidth} y2={height * (1 - ratio)} stroke="#e3e4df" strokeWidth="1" strokeDasharray="4,4" />
        ))}
        {/* Y-axis labels */}
        {[0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <text key={i} x="-8" y={height * (1 - ratio) + 4} fontSize="11" fill="#78828c" textAnchor="end" fontFamily="var(--font-mono)">
            {(maxVal * ratio).toLocaleString('en-IN')}
          </text>
        ))}
        {/* Bars */}
        {data.map((d, di) => 
          keys.map((key, ki) => (
            <rect
              key={`${di}-${ki}`}
              x={di * (barWidth * keys.length + gap) + ki * barWidth}
              y={height - (Number(d[key] || 0) / maxVal) * height}
              width={barWidth}
              height={Math.max(1, (Number(d[key] || 0) / maxVal) * height)}
              fill={colors[ki % colors.length]}
              rx={4}
              ry={4}
            />
          ))
        )}
        {/* X-axis labels */}
        {data.map((d, di) => (
          <text key={di} x={di * (barWidth * keys.length + gap) + (barWidth * keys.length) / 2} y={height + 20} fontSize="11" fill="#414b55" textAnchor="middle" fontFamily="var(--font-mono)">
            {d.month || d.label || d.date || `Item ${di + 1}`}
          </text>
        ))}
      </svg>
      {showLegend && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {keys.map((key, i) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#414b55' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: colors[i % colors.length] }}></span>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LineChart({ data, keys, colors, height = 200, showLegend = true, smooth = true }) {
  if (!data || !data.length) return <div className="empty">No data available</div>;
  const maxVal = Math.max(...data.flatMap(d => keys.map(k => Number(d[k] || 0))), 1);
  const minVal = Math.min(...data.flatMap(d => keys.map(k => Number(d[k] || 0))), 0);
  const range = maxVal - minVal || 1;
  const stepX = data.length > 1 ? 400 / (data.length - 1) : 0;
  const chartWidth = data.length > 1 ? (data.length - 1) * stepX : 400;
  const viewBoxWidth = Math.max(chartWidth, 400);
  
  const getPath = (key) => {
    const points = data.map((d, i) => ({
      x: i * stepX,
      y: height - ((Number(d[key] || 0) - minVal) / range) * height
    }));
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

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8, width: '100%' }}>
      <svg viewBox={`0 0 ${viewBoxWidth} ${height + 40}`} style={{ width: '100%', height: 'auto', minWidth: '100%', maxWidth: '100%' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(23, 164, 147, 0.15)" />
            <stop offset="100%" stop-color="rgba(23, 164, 147, 0)" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <line key={i} x1="0" y1={height * (1 - ratio)} x2={data.length * stepX} y2={height * (1 - ratio)} stroke="#e3e4df" strokeWidth="1" strokeDasharray="4,4" />
        ))}
        {/* Y-axis labels */}
        {[0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <text key={i} x="-8" y={height * (1 - ratio) + 4} fontSize="11" fill="#78828c" textAnchor="end" fontFamily="var(--font-mono)">
            {(minVal + range * ratio).toLocaleString('en-IN')}
          </text>
        ))}
        {/* Area fills */}
        {keys.map((key, ki) => (
          <path
            key={key}
            d={getPath(key) + ` L ${data.length * stepX} ${height} L 0 ${height} Z`}
            fill={`url(#areaGradient)`}
            stroke={colors[ki % colors.length]}
            strokeWidth="0"
            opacity={0.3}
          />
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
              <circle
                key={i}
                cx={i * stepX}
                cy={height - ((Number(d[key] || 0) - minVal) / range) * height}
                r={4}
                fill={colors[ki % colors.length]}
                stroke="#fff"
                strokeWidth="2"
              />
            ))}
          </g>
        ))}
        {/* X-axis labels */}
        {data.map((d, i) => (
          <text key={i} x={i * stepX} y={height + 20} fontSize="11" fill="#414b55" textAnchor="middle" fontFamily="var(--font-mono)">
            {d.month || d.label || d.date || `W${i + 1}`}
          </text>
        ))}
      </svg>
      {showLegend && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {keys.map((key, i) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#414b55' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: colors[i % colors.length] }}></span>
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

function KPICard({ title, value, subtitle, trend, trendUp = true, icon, color = 'var(--accent)' }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h4>{title}</h4>
          <b style={{ fontSize: 'clamp(24px, 2.8vw, 32px)', color: 'var(--ink)' }}>{value}</b>
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

export { BarChart, LineChart, PieChart, KPICard };

export function CommandPalette() {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [hits, setHits] = useState([]);
  const { user } = useAuth(); const nav = useNavigate();
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); setQ(''); } };
    const t = () => { setOpen(o => !o); setQ(''); };
    window.addEventListener('keydown', h);
    window.addEventListener('toggle-palette', t);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('toggle-palette', t); };
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
