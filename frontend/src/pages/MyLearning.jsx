import { useEffect, useState } from 'react';
import { api, inr } from '../api';
import { useAuth } from '../auth';

const TABS = ['Overview', 'Performance', 'Material', 'Certificates', 'Interests', 'Fee'];

export default function MyLearning() {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [mats, setMats] = useState([]);
  const [ints, setInts] = useState([]);
  const [certs, setCerts] = useState([]);
  const [share, setShare] = useState('');
  const { user } = useAuth();

  const load = () => {
    api.dashboard().then(setD).catch((e) => setErr(e.message));
    api.materials().then(setMats).catch(() => {});
    api.interests().then(setInts).catch(() => {});
    api.certificates().then(setCerts).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const send = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.shareInterest({ body: share });
      setShare('');
      setMsg('✓ Shared — visible only to your trainers');
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  if (err) return <div className="err">{err}</div>;
  if (!d) return <div className="loading">Loading my learning…</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>My Learning</h2>
          <p className="sub">
            {d.student?.name} · {d.student?.customer_name} · Attendance {d.attendancePct}%
          </p>
        </div>
      </div>

      {msg && <div className="okmsg">{msg}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="cards">
            <div className="card">
              <h4>Profile</h4>
              <b className="sm">{d.student?.name}</b>
              <p className="meta">{d.student?.email}<br />{d.student?.customer_name}</p>
            </div>
            <div className="card"><h4>Batches</h4><b>{d.enrollments.length}</b></div>
            <div className="card"><h4>Attendance</h4><b>{d.attendancePct}%</b></div>
            <div className="card">
              <h4>Avg Score</h4>
              <b>{d.avg_score ?? '—'}{d.avg_score != null && '%'}</b>
            </div>
          </div>

          <div className="card">
            <h4>Learning Progress</h4>
            <div className="bar lg"><i style={{ width: `${d.attendancePct}%` }} /></div>
            <p className="meta mt" style={{ marginBottom: 0 }}>
              Attendance {d.attendancePct}%
              {d.avg_score != null && ` · Avg score ${d.avg_score}%`}
            </p>
          </div>
        </>
      )}

      {tab === 'Performance' && (
        <div>
          <div className="card">
            <h4>Weak Areas · improve these</h4>
            {(!d.weak_areas || !d.weak_areas.length) && <p className="empty">No assessments yet.</p>}
            <div className="list">
              {d.weak_areas?.map((w, i) => (
                <div className="list-row" key={i}>
                  <span className="grow">{w.topic}</span>
                  <div className={'bar fixed' + (w.pct < 60 ? ' bad' : ' ok')}>
                    <i style={{ width: `${w.pct}%` }} />
                  </div>
                  <b className="amt">{w.pct}%</b>
                </div>
              ))}
            </div>
          </div>

          <div className="card mt">
            <h4>Recent Attendance</h4>
            <div className="list">
              {d.attendance.map((a, i) => (
                <div className="list-row" key={i}>
                  <span className="mono grow">{a.date}</span>
                  <span className="meta">{a.batch_id}</span>
                  <span className={'chip ' + a.status}>{a.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'Material' && (
        <div className="card">
          <h4>Study Material · my batches</h4>
          {mats.length === 0 && <p className="empty">No material yet.</p>}
          {mats.map((m) => (
            <div className="stack" key={m.id}>
              <div className="hstack">
                <b>{m.title}</b>
                <span className="chip">{m.mat_type}</span>
              </div>
              {m.url && (
                <a href={m.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12 }}>
                  {m.url}
                </a>
              )}
              {m.notes && <p className="meta" style={{ margin: '4px 0 0' }}>{m.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'Interests' && (
        <div>
          <div className="card">
            <h4>Share an interest</h4>
            <p className="meta">Only your trainers (and Rampex) can see this — never your college.</p>
            <form onSubmit={send} className="hstack">
              <input
                required
                placeholder="e.g. I want GenAI projects…"
                value={share}
                onChange={(e) => setShare(e.target.value)}
                style={{ flex: '1 1 220px' }}
              />
              <button className="btn">Share</button>
            </form>
          </div>

          <div className="card mt">
            <h4>My shares</h4>
            {ints.length === 0 && <p className="empty">Nothing shared yet.</p>}
            {ints.map((i) => <div className="stack" key={i.id}>{i.body}</div>)}
          </div>
        </div>
      )}

      {tab === 'Fee' && (
        <div className="cards">
          <div className="card"><h4>My Fee · program fees</h4><b>{inr(d.fee)}</b></div>
          <div className="card"><h4>My Dues · share of college outstanding</h4><b>{inr(d.dues)}</b></div>
        </div>
      )}

      <p className="met