import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr } from '../api';
import { useAuth } from '../auth';

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
  if (!items || !items.length) return <p style={{ fontSize: 13 }}>No recent activity.</p>;
  const icon = { lead: '🎯', invoice: '🧾', payment: '💰', attendance: '📋' };
  return <div className="feed">{items.map((e, i) => <div key={i}>{icon[e.type] || '•'} {e.label} <small style={{ color: '#94a3b8' }}>{String(e.at || '').slice(0, 10)}</small></div>)}</div>;
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
                  <b className="amt">{b.attendance}%</b>
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
                  <span className="meta">{t.attendance}% · {t.avg_score ?? '—'}{t.avg_score != null && '%'}</span>
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

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Good afternoon, {firstName}</h2>
          <p className="sub">Here's what's happening across Rampex today.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card"><h4>Total Leads</h4><b>{d.totalLeads}</b></div>
        <div className="card"><h4>Conversion</h4><b>{d.conversionRate}%</b></div>
        <div className="card"><h4>Students</h4><b>{d.totalStudents}</b></div>
        <div className="card"><h4>Active Batches</h4><b>{d.activeBatches}</b></div>
        <div className="card"><h4>Revenue</h4><b>{inr(d.revenue)}</b></div>
        <div className="card"><h4>Collected</h4><b>{inr(d.collected)}</b></div>
        <div className="card"><h4>Outstanding</h4><b>{inr(d.outstanding)}</b></div>
        <div className="card">
          <h4>Net Position</h4>
          <b>{inr(d.net)}</b>
          <small>collected − expenses {inr(d.expenses)}</small>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h4>Lead Pipeline</h4>
          <div className="list">
            {d.byStatus.map((s) => (
              <div className="list-row" key={s.status}>
                <span className={'chip ' + s.status}>{s.status}</span>
                <div className="bar"><i style={{ width: `${(s.count / maxPipe) * 100}%` }} /></div>
                <b className="amt">{s.count}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h4>Revenue vs Collection</h4>
          <div className="card-head-row">
            <span>Collection rate</span>
            <b className="amt">{collectionRate}%</b>
          </div>
          {[
            ['Revenue', d.revenue, ''],
            ['Collected', d.collected, 'ok'],
            ['Outstanding', d.outstanding, 'warn'],
          ].map(([label, value, tone]) => (
            <div className="stack" key={label}>
              <div className="row-between">
                <span>{label}</span>
                <b className="amt">{inr(value)}</b>
              </div>
              <div className={'bar lg ' + tone}>
                <i style={{ width: `${d.revenue ? (value / d.revenue) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h4>Active Batches</h4>
          {d.batches.length === 0 && <Empty>No active batches right now.</Empty>}
          <div className="list">
            {d.batches.map((b) => (
              <div className="list-row" key={b.id}>
                <Link className="mono" to={'/batches/' + b.id}>{b.id}</Link>
                <span className="grow meta">
                  {b.program_name} · {b.student_count} students
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h4>Outstanding Payments</h4>
          {d.outstandingInvoices.length === 0 && <Empty>Every invoice is settled.</Empty>}
          <div className="list">
            {d.outstandingInvoices.map((i) => (
              <div className="list-row" key={i.id}>
                <span className="grow">
                  <Link to={'/customers/' + i.customer_id}>{i.customer_name}</Link>
                  <span className="meta mono"> · {i.id}</span>
                </span>
                <b className="amt">{inr(i.outstanding)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h4>Revenue Trend · billed vs collected</h4>
          <TrendChart data={trend} />
        </div>

        <div className="card">
          <h4>Live Activity</h4>
          <Feed items={feed} />
        </div>
      </div>

      <div className="card">
        <h4>Institutions · platform view</h4>
        <div className="list">
          {(d.institutions || []).map((x) => (
            <div className="list-row" key={x.id}>
              <span className="grow">
                <Link to={'/customers/' + x.id}>{x.name}</Link>
                <span className="meta mono"> · {x.type} · {x.students} students · {x.batches} batches</span>
              </span>
              <span className="meta">{inr(x.billed)} / {inr(x.collected)} / <b className="amt">{inr(x.outstanding)}</b> · {x.attendance}%</span>
            </div>
          ))}
        </div>
        <p className="meta"><Link to="/reports">Top students + performance reports →</Link> · <Link to="/collections">Collections queue →</Link></p>
      </div>
    </div>
  );
}
