import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, inr } from '../api';
import { useAuth } from '../auth';

function filterInstitutionLeaves(leaves, customerId) {
  return leaves.filter(l => l.customer_id === customerId);
}

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'CONVERTED', 'LOST'];
const KANBAN_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'CONVERTED'];

const STAGE_COLORS = {
  NEW: '#3b82f6',
  CONTACTED: '#f59e0b',
  QUALIFIED: '#8b5cf6',
  PROPOSAL: '#ec4899',
  CONVERTED: '#16a34a',
  LOST: '#64748b',
};

const STAGE_LABELS = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  CONVERTED: 'Converted',
  LOST: 'Lost',
};

function getPropensity(lead) {
  let score = 25;
  if (lead.expected_students >= 100) score += 25;
  else if (lead.expected_students >= 50) score += 15;
  if (lead.source === 'Referral') score += 25;
  else if (lead.source === 'Website') score += 20;
  else if (lead.source === 'LinkedIn') score += 10;
  if (lead.status === 'PROPOSAL') score += 35;
  else if (lead.status === 'QUALIFIED') score += 25;
  else if (lead.status === 'CONTACTED') score += 10;
  if (lead.status === 'CONVERTED') return { score: 100, label: 'Won', color: '#16a34a', action: 'Customer Active' };
  score = Math.min(score, 98);
  let label = 'Low';
  let color = '#64748b';
  let action = 'Initiate discovery call';
  if (score >= 70) {
    label = 'High';
    color = '#16a34a';
    action = lead.status === 'PROPOSAL' ? 'Ready to convert' : 'Issue proposal';
  } else if (score >= 45) {
    label = 'Medium';
    color = '#d97706';
    action = 'Schedule syllabus walkthrough';
  }
  return { score, label, color, action };
}

export function Leads() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('ALL');
  const [view, setView] = useState('kanban');
  const [show, setShow] = useState(false);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');

  const load = () =>
    api.leads(`?search=${encodeURIComponent(q)}&status=${st === 'ALL' ? '' : st}`).then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.createLead(f);
      setShow(false);
      setF({});
      setMsg('✓ Lead created successfully');
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const advanceStatus = async (leadId, nextStatus) => {
    try {
      await api.patchLead(leadId, { status: nextStatus });
      setMsg(`✓ Moved lead to ${nextStatus}`);
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  // KPI calculations
  const totalLeads = rows.length;
  const pipelineValue = rows.reduce((acc, l) => acc + Number(l.expected_value || 0), 0);
  const convertedLeads = rows.filter(l => l.status === 'CONVERTED').length;
  const conversionRate = totalLeads ? Math.round((convertedLeads / totalLeads) * 100) : 0;
  const autoLeads = rows.filter(l => l.source === 'Website' || l.source === 'Online').length;

  const nextStageMap = { NEW: 'CONTACTED', CONTACTED: 'QUALIFIED', QUALIFIED: 'PROPOSAL', PROPOSAL: 'CONVERTED' };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Leads Pipeline</h2>
          <p className="sub">Lead management · Auto-captured enquiries · Conversion propensity radar</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg">
            <button type="button" className={view === 'kanban' ? 'on' : ''} onClick={() => setView('kanban')}>Kanban</button>
            <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
          </div>
          <select
            className="select-sm"
            value={st}
            onChange={(e) => setSt(e.target.value)}
            style={{ minWidth: 140 }}
          >
            <option value="ALL">All Statuses</option>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          <input
            className="search-input"
            placeholder="Search leads…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button className="btn ghost" onClick={load}>Filter</button>
          <button className="btn" onClick={() => setShow(true)}>+ New Lead</button>
        </div>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      {/* KPI Cards */}
      <div className="cards">
        <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <h4>Total Leads</h4><b>{totalLeads}</b><small>{autoLeads} auto-captured</small></div>
        <div className="card" style={{ borderLeft: '4px solid var(--info)' }}>
          <h4>Pipeline Value</h4><b>{inr(pipelineValue)}</b><small>Across all stages</small></div>
        <div className="card" style={{ borderLeft: '4px solid var(--ok)' }}>
          <h4>Conversion Rate</h4><b>{conversionRate}%</b><small>{convertedLeads} converted</small></div>
        <div className="card" style={{ borderLeft: '4px solid var(--warn)' }}>
          <h4>Avg Propensity</h4>
          <b>
            {totalLeads
              ? Math.round(rows.reduce((a, l) => a + getPropensity(l).score, 0) / totalLeads)
              : 0}%
          </b>
          <small>Weighted score</small>
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="kanban-board">
          {KANBAN_STAGES.map((stage) => {
            const stageLeads = rows.filter((l) => l.status === stage);
            const stageValue = stageLeads.reduce((acc, l) => acc + Number(l.expected_value || 0), 0);
            const nextStage = nextStageMap[stage];
            const stageColor = STAGE_COLORS[stage];

            return (
              <div className="kanban-col" key={stage} style={{ '--sc': stageColor }}>
                <div className="kanban-col-head" style={{ background: `${stageColor}15` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span className="chip" style={{ background: stageColor, color: '#fff' }}>{STAGE_LABELS[stage]}</span>
                    <span className="kanban-count">{stageLeads.length}</span>
                  </div>
                  <span className="kanban-val">{inr(stageValue)}</span>
                </div>

                <div className="kanban-cards">
                  {stageLeads.map((l) => {
                    const prop = getPropensity(l);
                    const isAuto = l.source === 'Website' || l.source === 'Online';

                    return (
                      <div className="kanban-card" key={l.id} draggable onDragStart={(e) => e.dataTransfer.setData('leadId', l.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('leadId'); if (id !== l.id) advanceStatus(id, stage); }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span className="mono" style={{ fontSize: 11, color: '#64748b' }}>{l.id}</span>
                          {isAuto && <span className="chip" style={{ background: '#dbeafe', color: '#1e40af', fontSize: 10, padding: '1px 6px' }}>⚡ AUTO</span>}
                        </div>
                        <h4 style={{ margin: '4px 0 2px' }}>
                          <Link to={'/leads/' + l.id} style={{ color: '#0f172a', textDecoration: 'none' }}>{l.organization}</Link>
                        </h4>
                        <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0' }}>{l.contact_person} · {l.program || 'General'}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 4px' }}>
                          <b style={{ fontSize: 14 }}>{inr(l.expected_value)}</b>
                          <span style={{ fontSize: 11, fontWeight: 600, color: prop.color }}>{prop.score}% {prop.label}</span>
                        </div>
                        <p style={{ fontSize: 11, color: '#475569', background: '#f8fafc', padding: '4px 8px', borderRadius: 6, margin: '4px 0 8px' }}>
                          👉 {prop.action}
                        </p>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
                          <Link to={'/leads/' + l.id} className="btn ghost sm">Details →</Link>
                          {nextStage && (
                            <button className="btn sm" onClick={() => advanceStatus(l.id, nextStage)}>
                              Move to {STAGE_LABELS[nextStage]} →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {stageLeads.length === 0 && <p className="empty" style={{ fontSize: 12, padding: '16px 0', color: '#94a3b8' }}>Drop leads here</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Lead ID</th><th>Company</th><th>Contact</th><th>Program</th>
                <th>Status</th><th>Propensity</th><th>Value</th><th>Source</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const prop = getPropensity(l);
                const isAuto = l.source === 'Website' || l.source === 'Online';
                const stageColor = STAGE_COLORS[l.status];
                return (
                  <tr key={l.id}>
                    <td>
                      {l.id} {isAuto && <span className="chip" style={{ background: '#dbeafe', color: '#1e40af', fontSize: 10 }}>⚡ AUTO</span>}
                    </td>
                    <td><b>{l.organization}</b></td>
                    <td>{l.contact_person}</td>
                    <td>{l.program || '—'}</td>
                    <td>
                      <select
                        className="select-sm"
                        value={l.status}
                        onChange={(e) => advanceStatus(l.id, e.target.value)}
                        style={{ background: stageColor, color: '#fff', borderColor: stageColor, minWidth: 130 }}
                      >
                        {LEAD_STATUSES.map(s => <option key={s} value={s} style={{ background: '#fff', color: '#000' }}>{STAGE_LABELS[s]}</option>)}
                      </select>
                    </td>
                    <td><span style={{ color: prop.color, fontWeight: 600, fontSize: 12 }}>{prop.score}% {prop.label}</span></td>
                    <td>{inr(l.expected_value)}</td>
                    <td>{l.source || '—'}</td>
                    <td><Link to={'/leads/' + l.id} className="btn ghost sm">Open</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty">No leads match this filter yet.</p>}
        </>
      )}

      {show && (
        <div className="modal">
          <div>
            <h3>Create New Lead</h3>
            <form onSubmit={create} className="form">
              <input required placeholder="Organization *" value={f.organization || ''} onChange={(e) => setF({ ...f, organization: e.target.value })} />
              <input required placeholder="Contact Person *" value={f.contact_person || ''} onChange={(e) => setF({ ...f, contact_person: e.target.value })} />
              <input placeholder="Email" value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <input placeholder="Phone" value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              <input placeholder="Requirement" value={f.requirement || ''} onChange={(e) => setF({ ...f, requirement: e.target.value })} />
              <input placeholder="Program" value={f.program || ''} onChange={(e) => setF({ ...f, program: e.target.value })} />
              <input placeholder="Expected Students" type="number" value={f.expected_students || ''} onChange={(e) => setF({ ...f, expected_students: +e.target.value })} />
              <input placeholder="Expected Value" type="number" value={f.expected_value || ''} onChange={(e) => setF({ ...f, expected_value: +e.target.value })} />
              <input placeholder="Source" value={f.source || ''} onChange={(e) => setF({ ...f, source: e.target.value })} />
              <input placeholder="Owner" value={f.owner || ''} onChange={(e) => setF({ ...f, owner: e.target.value })} />
              <span>
                <button className="btn" type="submit">Create Lead</button>
                <button type="button" className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
              </span>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function LeadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [l, setL] = useState(null);
  const [msg, setMsg] = useState('');
  const [fu, setFu] = useState({ method: 'Call' });

  const load = () => api.lead(id).then(setL).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [id]);

  if (!l) return <div className={msg ? 'err' : 'loading'}>{msg || 'Loading lead…'}</div>;

  const qualify = async (status) => {
    try { await api.patchLead(id, { status }); setMsg(`✓ Status → ${status}`); load(); }
    catch (e) { setMsg(e.message); }
  };
  const addFu = async (e) => {
    e.preventDefault();
    try { await api.followup(id, fu); setFu({ method: 'Call' }); setMsg('✓ Follow-up saved'); load(); }
    catch (ex) { setMsg(ex.message); }
  };
  const convert = async () => {
    try { const c = await api.convert(id); setMsg(`✓ Converted → ${c.id}`); nav('/customers/' + c.id); }
    catch (ex) { setMsg(ex.message); }
  };

  return (
    <div>
      <Link to="/leads" className="back">← Leads</Link>

      <div className="page-head">
        <div>
          <h2>{l.organization}</h2>
          <p className="sub">{l.id} · Owner {l.owner || '—'}</p>
        </div>
        <span className={'chip ' + l.status}>{l.status}</span>
      </div>

      {msg && <div className="okmsg">{msg}</div>}

      {(() => {
        const prop = getPropensity(l);
        const isAuto = l.source === 'Website' || l.source === 'Online';
        return (
          <div className="card" style={{ marginBottom: 16, borderLeft: `5px solid ${prop.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0 }}>Lead Intelligence & Conversion Propensity</h4>
                <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                  Heuristic analysis based on ticket size ({l.expected_students || 0} students), source ({l.source || 'Direct'}), and pipeline stage.
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: prop.color }}>{prop.score}%</span>
                <span className="chip" style={{ marginLeft: 8, background: '#f1f5f9', color: prop.color }}>{prop.label} Propensity</span>
              </div>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 13, background: '#eff6ff', color: '#1e40af', padding: '4px 10px', borderRadius: 6 }}>
                ⚡ Next Best Action: <b>{prop.action}</b>
              </span>
              {isAuto && (
                <span style={{ fontSize: 12, background: '#f0fdf4', color: '#166534', padding: '4px 10px', borderRadius: 6 }}>
                  ✓ Inbound auto-captured web enquiry
                </span>
              )}
            </div>
          </div>
        );
      })()}

      <div className="grid2">
        <div className="card">
          <h4>Contact Information</h4>
          <dl className="kv">
            <div><dt>Contact</dt><dd>{l.contact_person}</dd></div>
            <div><dt>Email</dt><dd>{l.email || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{l.phone || '—'}</dd></div>
            <div><dt>Requirement</dt><dd>{l.requirement || '—'}</dd></div>
            <div><dt>Expected</dt><dd>{l.expected_students || 0} students · {inr(l.expected_value)}</dd></div>
            <div><dt>Program</dt><dd>{l.program || '—'}</dd></div>
          </dl>

          <div className="hstack">
            {['CONTACTED', 'QUALIFIED', 'PROPOSAL'].map((s) => (
              <button key={s} className="btn ghost" onClick={() => qualify(s)}>{s}</button>
            ))}
          </div>
          <div className="mt">
            <button className="btn" onClick={convert} disabled={!['QUALIFIED', 'PROPOSAL'].includes(l.status)}>
              Convert to Customer
            </button>
          </div>
        </div>

        <div className="card">
          <h4>Follow-ups</h4>
          <form onSubmit={addFu} className="form">
            <input type="date" value={fu.date || ''} onChange={(e) => setFu({ ...fu, date: e.target.value })} />
            <select value={fu.method} onChange={(e) => setFu({ ...fu, method: e.target.value })}>
              <option>Call</option><option>Email</option><option>Visit</option><option>WhatsApp</option>
            </select>
            <input placeholder="Notes" value={fu.notes || ''} onChange={(e) => setFu({ ...fu, notes: e.target.value })} />
            <input placeholder="Next action" value={fu.next_action || ''} onChange={(e) => setFu({ ...fu, next_action: e.target.value })} />
            <span><button className="btn" type="submit">Add Follow-up</button></span>
          </form>

          {l.followups?.length ? (
            <div className="tl">
              {l.followups.map((x) => (
                <div key={x.id}>
                  <b>{x.date}</b> · {x.method} — {x.notes} <i>→ {x.next_action}</i>
                </div>
              ))}
            </div>
          ) : <p className="empty">No follow-ups logged yet.</p>}
        </div>
      </div>
    </div>
  );
}

export function Customers() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const navigate = useNavigate();
  useEffect(() => { api.customers().then(setRows); }, []);

  const list = rows.filter((c) => {
    if (typeFilter !== 'ALL' && c.type !== typeFilter) return false;
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const types = ['Enterprise', 'SMB', 'Direct'];

  return (
    <div>
      <div className="page-head">
        <h2>Institutions</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className="select-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ minWidth: 140 }}
          >
            <option value="ALL">All Types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="search-input" placeholder="Search institutions…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Type</th><th></th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} onClick={() => navigate('/customers/' + c.id)} style={{ cursor: 'pointer' }}>
              <td>{c.id}</td>
              <td><b>{c.name}</b></td>
              <td>{c.contact_person}</td>
              <td>{c.type}</td>
              <td>
                <Link to={'/customers/' + c.id} onClick={(e) => e.stopPropagation()}>
                  View Details →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 && <p className="empty">No customers yet. Convert a qualified lead first.</p>}
    </div>
  );
}

export function Customer360({ fixedId }) {
  const { user } = useAuth();
  const { id: paramId } = useParams();
  const id = fixedId || paramId;
  const [c, setC] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [msg, setMsg] = useState('');
  const [leaveRequests, setLeaveRequests] = useState([]);

  const isInstitution = user?.role === 'institution';
  const TABS = isInstitution
    ? ['Overview', 'Training', 'Students', 'Attendance', 'Finance', 'Leave', 'Activity']
    : ['Overview', 'Training', 'Students', 'Attendance', 'Finance', 'Activity'];

  useEffect(() => { api.customer(id).then(setC).catch((e) => setMsg(e.message)); }, [id]);

  useEffect(() => {
    if (isInstitution && tab === 'Leave') {
      api.leaveRequests()
        .then((data) => {
          const institutionLeaves = data.filter(l => l.customer_id === id);
          setLeaveRequests(institutionLeaves);
        })
        .catch(() => setLeaveRequests([]));
    }
  }, [tab, id, isInstitution]);

  if (!c) return <div className={msg ? 'err' : 'loading'}>{msg || 'Loading customer 360…'}</div>;

  const topStudents = c.topStudents || [];

  return (
    <div>
      {!fixedId && <Link to="/customers" className="back">← Institutions</Link>}

      <div className="page-head">
        <div>
          <h2>{c.name}</h2>
          <p className="sub">{c.id} · {c.type}</p>
        </div>
        <span className={'chip risk-' + c.risk}>Risk {c.risk}</span>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="cards">
            <div className="card">
              <h4>Contact</h4>
              <b className="sm">{c.contact_person}</b>
              <p className="meta">{c.email}<br />{c.phone}<br />From lead: {c.lead_id || '—'}</p>
            </div>
            <div className="card"><h4>Active Programs</h4><b>{c.summary.programs}</b></div>
            <div className="card"><h4>Students</h4><b>{c.summary.students}</b></div>
            <div className="card"><h4>Revenue</h4><b>{inr(c.summary.revenue)}</b></div>
          </div>

          <div className="cards" style={{ marginTop: 14 }}>
            <div className="card"><h4>Collected</h4><b>{inr(c.summary.collected)}</b></div>
            <div className="card"><h4>Outstanding</h4><b>{inr(c.summary.outstanding)}</b></div>
            <div className="card"><h4>Net Position</h4><b>{inr(c.summary.net)}</b></div>
            <div className="card">
              <h4>Collection Risk</h4>
              <span className={'chip risk-' + c.risk}>{c.risk}</span>
              <p className="meta">Onboarded {String(c.created_at || '').slice(0, 10) || '—'}</p>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div>
                <h4 style={{ margin: 0 }}>Top 10 Students</h4>
                <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                  Ranked by attendance, then average assessment score.
                </p>
              </div>
              <Link to="/students" className="btn sm ghost">Open Student Roster →</Link>
            </div>

            {topStudents.length === 0 ? (
              <p className="empty">No students enrolled in this institution yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Rank</th>
                    <th>Student</th>
                    <th>Batch</th>
                    <th>Avg Score</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {topStudents.map((s, i) => {
                    const rankColor = ['#b45309', '#64748b', '#92400e'][i] || '#64748b';
                    const hasScore = s.avg_score !== null && s.avg_score !== undefined;
                    return (
                      <tr key={s.id}>
                        <td>
                          <span
                            className="chip"
                            style={{
                              background: i < 3 ? `${rankColor}1a` : '#f1f5f9',
                              color: i < 3 ? rankColor : '#64748b',
                              fontWeight: 700,
                            }}
                          >
                            #{i + 1}
                          </span>
                        </td>
                        <td>
                          <b>{s.name}</b>
                          <small style={{ display: 'block', color: '#64748b' }}>{s.email || s.id}</small>
                        </td>
                        <td className="mono">{s.batch_id || '—'}</td>
                        <td>
                          {hasScore ? (
                            <>
                              <b>{s.avg_score}%</b>
                              <small style={{ display: 'block', color: '#94a3b8' }}>
                                {s.graded} assessment{s.graded === 1 ? '' : 's'} graded
                              </small>
                            </>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 13 }}>Not graded yet</span>
                          )}
                        </td>
                        <td>
                          <b>{s.sessions ? `${s.attendance}%` : '—'}</b>
                          <small style={{ display: 'block', color: '#94a3b8' }}>
                            {s.sessions} session{s.sessions === 1 ? '' : 's'}
                          </small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'Training' && (
        <>
          <table>
            <thead><tr><th>Batch</th><th>Program</th><th>Trainer</th><th>Students</th></tr></thead>
            <tbody>
              {c.batches.map((b) => (
                <tr key={b.id}>
                  <td><Link to={'/batches/' + b.id}>{b.id}</Link></td>
                  <td>{b.program_name}</td>
                  <td>{b.trainer_name}</td>
                  <td>{b.student_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.batches.length === 0 && <p className="empty">No batches delivered yet.</p>}
        </>
      )}

      {tab === 'Students' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Enrolled Students ({c.students.length})</h4>
            <Link to="/students" className="btn sm">Manage & Add Students →</Link>
          </div>
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
            <tbody>
              {c.students.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.id}</td>
                  <td><b>{s.name}</b></td>
                  <td>{s.email || '—'}</td>
                  <td><Link to="/students" className="btn sm ghost">View Details</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.students.length === 0 && <p className="empty">No students enrolled yet. Go to Students to register learners.</p>}
        </>
      )}

      {tab === 'Attendance' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: 0 }}>Attendance Tracking & Reports</h4>
              <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                View complete student attendance rates, low-attendance interventions, and daily logs.
              </p>
            </div>
            <Link to="/attendance-details" className="btn">Open Full Attendance Details →</Link>
          </div>
        </div>
      )}

      {tab === 'Finance' && (
        <div>
          <h4>Quotations</h4>
          <table>
            <thead><tr><th>ID</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {c.quotations.map((q) => (
                <tr key={q.id}>
                  <td>{q.id}</td>
                  <td>{inr(q.total)}</td>
                  <td><span className={'chip ' + q.status}>{q.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>Invoices</h4>
          <table>
            <thead><tr><th>ID</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {c.invoices.map((i) => (
                <tr key={i.id}>
                  <td>{i.id}</td>
                  <td>{inr(i.total)}</td>
                  <td>{inr(i.paid)}</td>
                  <td><b>{inr(i.outstanding)}</b></td>
                  <td><span className={'chip ' + i.status}>{i.status}</span></td>
                  <td><Link to={'/invoices/' + i.id}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>Payments</h4>
          <table>
            <thead><tr><th>ID</th><th>Invoice</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              {c.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td><td>{p.invoice_id}</td><td><b>{inr(p.amount)}</b></td><td>{p.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Leave' && isInstitution && (
        <div className="card">
          <h4>Trainer Leave Requests</h4>
          <p className="meta" style={{ marginBottom: 16 }}>
            View leave applications submitted by trainers assigned to your institution's batches.
          </p>
          {leaveRequests.length === 0 ? (
            <p className="empty">No leave requests found for this institution.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Trainer</th>
                  <th>Leave Type</th>
                  <th>Period</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Applied Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leaveRequests.map((lr) => (
                  <tr key={lr.id}>
                    <td className="mono">{lr.id}</td>
                    <td>
                      <b>{lr.trainer_name}</b>
                      <small style={{ display: 'block', color: '#64748b' }}>{lr.trainer_id}</small>
                    </td>
                    <td>
                      <span className="chip" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                        {lr.type}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>
                        {lr.from_date} {lr.from_date !== lr.to_date ? `→ ${lr.to_date}` : ''}
                      </span>
                    </td>
                    <td><b>{lr.days} d</b></td>
                    <td style={{ maxWidth: 220, fontSize: 13, color: '#334155' }}>
                      {lr.reason || '—'}
                    </td>
                    <td style={{ fontSize: 13, color: '#64748b' }}>{lr.applied_on}</td>
                    <td>
                      <span className={'chip ' + (lr.status === 'APPROVED' ? 'PRESENT' : lr.status === 'PENDING' ? 'LATE' : 'ABSENT')}>
                        {lr.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Activity' && (
        <div className="card">
          <h4>Timeline</h4>
          <div className="tl" style={{ marginTop: 0 }}>
            {c.lead && <div>Lead {c.lead.id} created ({c.lead.status})</div>}
            {c.followups.map((f) => <div key={f.id}>{f.date} · {f.method} — {f.notes}</div>)}
            {c.batches.map((b) => <div key={b.id}>Batch {b.id} started</div>)}
            {c.invoices.map((i) => <div key={i.id}>Invoice {i.id} · {inr(i.total)}</div>)}
            {c.payments.map((p) => <div key={p.id}>Payment {p.id} · {inr(p.amount)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
