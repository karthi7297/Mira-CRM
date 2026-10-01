import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr } from '../api';
import { useAuth } from '../auth';
import { BarChart, LineChart, PieChart, KPICard, AttendanceBar } from '../widgets';

function TrendChart({ data }) {
  if (!data || !data.length) return <p style={{ fontSize: 13 }}>No trend data yet.</p>;
  const max = Math.max(1, ...data.map(m => Math.max(m.billed, m.collected)));
  return (<>
    <div className="trend">{data.map(m => (
      <div className="col" key={m.month}>
        <div className="bars">
          <div className="bar b" title={`Billed ${inr(m.billed)}`} style={{ height: `${Math.max(3, (m.billed / max) * 118)}px` }} />
          <div className="bar c" title={`Collected ${inr(m.collected)}`} style={{ height: `${Math.max(3, (m.collected / max) * 118)}px` }} />
        </div>
        <small>{m.month.slice(5)}</small>
      </div>))}</div>
    <p style={{ fontSize: 12 }}><span style={{ color: '#1d4ed8' }}>■</span> Billed <span style={{ color: '#16a34a' }}>■</span> Collected</p>
  </>);
}

function Feed({ items }) {
  if (!items || !items.length) return <div className="feed-empty">No recent activity</div>;
  const icon = { lead: '🎯', invoice: '🧾', payment: '💰', attendance: '📋' };
  return (
    <div className="feed">
      {items.slice(0, 8).map((e, i) => (
        <div key={i} className="feed-item">
          <span className="feed-icon">{icon[e.type] || '•'}</span>
          <span className="feed-label">{e.label}</span>
          <span className="feed-time">{String(e.at || '').slice(0, 10)}</span>
        </div>
      ))}
    </div>
  );
}

const Empty = ({ children }) => <p className="empty">{children}</p>;

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [trend, setTrend] = useState([]);
  const [feed, setFeed] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    api.dashboard().then(setD).catch((e) => setErr(e.message));
    // trend is org/institution-scoped and activity is not for students — calling
    // them for other roles just produces a 403 in the console.
    if (user?.role === 'organization' || user?.role === 'institution') {
      api.trend().then(setTrend).catch(() => {});
    }
    if (user?.role !== 'student') {
      api.activity().then(setFeed).catch(() => {});
    }
  }, [user?.role]);

  if (err) return <div className="err">{err}</div>;
  if (!d) return <div className="loading">Loading dashboard…</div>;

  const firstName = user?.name?.split(' ')[0];

  /* ---- Institution (college management): own college overview ---- */
  if (d.role === 'institution') {
    return (
      <div>
        <div className="page-head">
          <div>
            <h2>{d.customer?.name}</h2>
            <p className="sub">College portal · training delivered by Rampex.</p>
          </div>
          <Link className="btn ghost" to="/college">Open College 360 →</Link>
        </div>

        <div className="cards">
          <div className="card"><h4>Students</h4><b>{d.studentCount}</b></div>
          <div className="card"><h4>Batches</h4><b>{d.batches.length}</b></div>
          <div className="card"><h4>Billed</h4><b>{inr(d.revenue)}</b></div>
          <div className="card"><h4>Paid</h4><b>{inr(d.collected)}</b></div>
          <div className="card"><h4>Outstanding</h4><b>{inr(d.outstanding)}</b></div>
        </div>

        <div className="grid2">
          <div className="card">
            <h4>My Batches · Rampex delivery</h4>
            {d.batches.length === 0 && <Empty>No batches assigned yet.</Empty>}
            <div className="list">
              {d.batches.map((b) => (
                <div className="list-row" key={b.id}>
                  <Link className="mono" to={'/batches/' + b.id}>{b.id}</Link>
                  <span className="grow meta">
                    {b.program_name} · {b.trainer_name} · {b.student_count} students
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h4>Outstanding Invoices</h4>
            {d.outstandingInvoices.length === 0 && <Empty>All clear — nothing outstanding.</Empty>}
            <div className="list">
              {d.outstandingInvoices.map((i) => (
                <div className="list-row" key={i.id}>
                  <Link className="mono" to={'/invoices/' + i.id}>{i.id}</Link>
                  <span className="grow meta">{i.program || 'Training'}</span>
                  <b className="amt">{inr(i.outstanding)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid2">
          <div className="card">
            <h4>Batch Performance · my college</h4>
            {(!d.batch_performance || !d.batch_performance.length) && <Empty>No batches yet.</Empty>}
            <div className="list">
              {(d.batch_performance || []).map((b) => (
                <div className="list-row" key={b.batch_id}>
                  <Link className="mono" to={'/batches/' + b.batch_id}>{b.batch_id}</Link>
                  <span className="grow meta">{b.program} · {b.students} students</span>
                  <AttendanceBar value={b.attendance} width={130} />
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h4>Top Students · my college</h4>
            {(!d.top_students || !d.top_students.length) && <Empty>No data yet.</Empty>}
            <div className="list">
              {(d.top_students || []).map((t, i) => (
                <div className="list-row" key={t.student_id}>
                  <span className="grow">#{i + 1} {t.name}</span>
                  <span className="meta">{t.avg_score ?? '—'}{t.avg_score != null && '%'}</span>
                  <AttendanceBar value={t.attendance} width={120} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h4>Live Activity</h4>
          <Feed items={feed} />
        </div>
      </div>
    );
  }

  /* ---- Trainer (Rampex staff): assigned batches ---- */
  if (d.role === 'trainer') {
    return (
      <div>
        <div className="page-head">
          <div>
            <h2>Good afternoon, {firstName}</h2>
            <p className="sub">Rampex trainer · your assigned batches across institutions.</p>
          </div>
          <Link className="btn ghost" to="/attendance">Mark attendance →</Link>
        </div>

        <div className="cards">
          <div className="card"><h4>My Batches</h4><b>{d.activeBatches}</b></div>
          <div className="card"><h4>Students</h4><b>{d.totalStudents}</b></div>
          <div className="card"><h4>Avg Attendance</h4><b>{d.avgAttendance}%</b></div>
        </div>

        <div className="card">
          <h4>My Batches</h4>
          {d.batches.length === 0 && <Empty>No batches assigned to you yet.</Empty>}
          <div className="list">
            {d.batches.map((b) => (
              <div className="list-row" key={b.id}>
                <Link className="mono" to={'/batches/' + b.id}>{b.id}</Link>
                <span className="grow meta">
                  {b.program_name} · {b.customer_name} · {b.student_count} students
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---- Student: point them at My Learning ---- */
  if (d.role === 'student') {
    return (
      <div>
        <h2>Hi, {firstName}</h2>
        <p className="sub">Your learning lives here.</p>
        <p style={{ marginTop: 18 }}>
          <Link className="btn" to="/learning">Open My Learning →</Link>
        </p>
      </div>
    );
  }

  /* ---- Organization (Rampex): the whole platform ---- */
  const maxPipe = Math.max(1, ...d.byStatus.map((s) => s.count));
  const collectionRate = d.revenue ? Math.round((d.collected / d.revenue) * 100) : 0;

  // Prepare chart data
  const leadStatusData = d.byStatus.map(s => ({ status: s.status, count: s.count }));
  const collectionMix = [
    { label: 'Collected', value: d.collected },
    { label: 'Outstanding', value: d.outstanding },
  ].filter(x => x.value > 0);
  
  const expenseCategories = [
    { label: 'Trainer', value: d.trainerExpense || 0 },
    { label: 'Venue', value: d.venueExpense || 0 },
    { label: 'Travel', value: d.travelExpense || 0 },
    { label: 'Accommodation', value: d.accommodationExpense || 0 },
    { label: 'Materials', value: d.materialsExpense || 0 },
    { label: 'Marketing', value: d.marketingExpense || 0 },
    { label: 'Operations', value: d.operationsExpense || 0 },
    { label: 'Other', value: d.otherExpense || 0 },
  ].filter(c => c.value > 0);

  const institutionRevenue = (d.institutions || []).map(x => ({
    name: x.name,
    billed: x.billed,
    collected: x.collected,
    outstanding: x.outstanding,
  })).filter(i => i.billed > 0);

  const revenueChartData = trend.length > 0 ? trend.slice(-12).map(t => ({
    month: t.month.slice(5),
    billed: t.billed,
    collected: t.collected
  })) : [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Good afternoon, {firstName}</h2>
          <p className="sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · Here&rsquo;s what&rsquo;s happening across Rampex.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn ghost" to="/reports">Reports →</Link>
          <Link className="btn" to="/leads">+ New Lead</Link>
        </div>
      </div>

      <div className="cards kpi-strip">
        <KPICard compact title="Revenue" value={inr(d.revenue)} subtitle={`${collectionRate}% collected`} color="var(--accent)" />
        <KPICard compact title="Collected" value={inr(d.collected)} subtitle={`${d.recentPayments?.length || 0} payments`} color="var(--ok)" />
        <KPICard compact title="Outstanding" value={inr(d.outstanding)} subtitle={`${d.outstandingInvoices?.length || 0} invoices`} color="var(--warn)" />
        <KPICard compact title="Net Position" value={inr(d.net)} subtitle={d.revenue ? `${Math.round((d.net / d.revenue) * 100)}% margin` : '—'} color={d.net >= 0 ? 'var(--ok)' : 'var(--bad)'} />
        <KPICard compact title="Leads" value={d.totalLeads} subtitle={`${d.conversionRate}% conversion`} color="var(--accent)" />
        <KPICard compact title="Students" value={d.totalStudents} subtitle={`${d.activeBatches} batches`} color="var(--info)" />
        <KPICard compact title="Trainers" value={d.totalTrainers} subtitle="Active" color="var(--ok)" />
        <KPICard compact title="Expenses" value={inr(d.expenses)} subtitle="Operating costs" color="var(--info)" />
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>Lead Pipeline by Status</h4>
          <div style={{ marginTop: 8 }}>
            {leadStatusData.length > 0 ? (
              <BarChart
                data={leadStatusData}
                keys={['count']}
                colors={['#3b82f6', '#f59e0b', '#16a34a', '#8b5cf6', '#ef4444', '#64748b']}
                height={160}
                showLegend={false}
                labelKey="status"
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No lead data</div>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Collection Efficiency · {collectionRate}% collected</h4>
          <div style={{ marginTop: 8 }}>
            {collectionMix.length > 0 ? (
              <PieChart
                data={collectionMix}
                labelKey="label"
                valueKey="value"
                colors={['#16a34a', '#f59e0b']}
                height={160}
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No revenue data</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>Expense Breakdown</h4>
          <div style={{ marginTop: 8 }}>
            {expenseCategories.length > 0 ? (
              <PieChart
                data={expenseCategories}
                labelKey="label"
                valueKey="value"
                colors={['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#94a3b8', '#ef4444']}
                height={170}
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No expense data</div>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Top Institutions by Revenue</h4>
          <div style={{ marginTop: 8 }}>
            {institutionRevenue.length > 0 ? (
              <BarChart
                data={institutionRevenue.slice(0, 8)}
                keys={['billed', 'collected', 'outstanding']}
                colors={['#3b82f6', '#16a34a', '#f59e0b']}
                height={170}
                labelKey="name"
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No institution data</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h4 style={{ margin: 0 }}>Revenue Trend · 12 months</h4>
            <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: 'var(--muted)' }}>
              <span><span style={{ color: '#3b82f6' }}>■</span> Billed <b style={{ marginLeft: 4 }}>{inr(d.revenue)}</b></span>
              <span><span style={{ color: '#16a34a' }}>■</span> Collected <b style={{ marginLeft: 4 }}>{inr(d.collected)}</b></span>
              <span><span style={{ color: '#f59e0b' }}>■</span> Outstanding <b style={{ marginLeft: 4 }}>{inr(d.outstanding)}</b></span>
            </div>
          </div>
          <div style={{ marginTop: 8, flex: 1 }}>
            {revenueChartData.length > 0 ? (
              <LineChart
                data={revenueChartData}
                keys={['billed', 'collected']}
                colors={['#3b82f6', '#16a34a']}
                height={170}
                labelKey="month"
              />
            ) : (
              <TrendChart data={trend} />
            )}
          </div>
        </div>

        <div className="card">
          <h4>Live Activity</h4>
          <div className="list scroll" style={{ border: 0, boxShadow: 'none' }}>
            <Feed items={feed} />
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>Active Batches</h4>
            <Link to="/batches" className="btn sm ghost">All batches →</Link>
          </div>
          {d.batches.length === 0 && <Empty>No active batches right now.</Empty>}
          <div className="list scroll">
            {d.batches.map((b) => (
              <div className="list-row" key={b.id}>
                <Link className="mono" to={'/batches/' + b.id}>{b.id}</Link>
                <span className="grow meta">
                  {b.program_name} · {b.student_count} students · {b.trainer_name}
                </span>
                <span className={'chip ' + b.status}>{b.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>Outstanding Payments</h4>
            <Link to="/collections" className="btn sm ghost">Collections →</Link>
          </div>
          {d.outstandingInvoices.length === 0 && <Empty>Every invoice is settled.</Empty>}
          <div className="list scroll">
            {d.outstandingInvoices.map((i) => (
              <div className="list-row" key={i.id}>
                <span className="grow">
                  <Link to={'/customers/' + i.customer_id}>{i.customer_name}</Link>
                  <span className="meta mono"> · {i.id}</span>
                </span>
                <b className="amt">{inr(i.outstanding)}</b>
                <span className="meta">{i.due_date ? `Due: ${i.due_date}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h4 style={{ margin: 0 }}>Institutions · Platform View</h4>
          <Link to="/customers" className="btn sm ghost">All institutions →</Link>
        </div>
        {(d.institutions || []).length === 0 && <Empty>No institutions yet.</Empty>}
        {(d.institutions || []).length > 0 && (
          <table>
            <thead><tr><th>Institution</th><th>Students</th><th>Batches</th><th>Attend.</th><th>Billed</th><th>Collected</th><th>Outstanding</th></tr></thead>
            <tbody>
              {(d.institutions || []).map((x) => (
                <tr key={x.id}>
                  <td><Link to={'/customers/' + x.id}><b>{x.name}</b></Link> <span className="meta">· {x.type}</span></td>
                  <td>{x.students}</td>
                  <td>{x.batches}</td>
                  <td style={{ minWidth: 150 }}><AttendanceBar value={x.attendance} width={120} /></td>
                  <td>{inr(x.billed)}</td>
                  <td style={{ color: 'var(--ok)' }}><b>{inr(x.collected)}</b></td>
                  <td><b className="amt">{inr(x.outstanding)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="meta" style={{ marginTop: 12 }}><Link to="/reports">Top students + performance reports →</Link> · <Link to="/collections">Collections queue →</Link></p>
      </div>
    </div>
  );
}
