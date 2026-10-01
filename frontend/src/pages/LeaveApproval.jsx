import { useEffect, useState } from 'react';
import { api, toast, toastError } from '../api';
import { useAuth } from '../auth';
import { check, ok, req, num, Ferr } from '../validate';

export default function LeaveApproval() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [fe, setFe] = useState({});
  const [f, setF] = useState({
    trainer_id: 'TR-001',
    trainer_name: 'Arun Kumar',
    type: 'Casual Leave',
    days: 1,
    reason: '',
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
  });

  const load = () => {
    setLoading(true);
    api.leaveRequests()
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((err) => {
        setMsg(err.message);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (id, action) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.updateLeaveRequest(id, action);
      toast(`Leave request ${id} ${action === 'approve' ? 'approved' : 'rejected'}`);
      load();
    } catch (ex) {
      toastError(ex.message);
      setMsg(ex.message);
    }
  };

  const handleActionChange = (id, action) => {
    if (!action) return;
    handleAction(id, action);
    // Reset the select after action
    setTimeout(() => {
      // The row will be re-rendered after load()
    }, 100);
  };

  const submitLeave = async (e) => {
    e.preventDefault();
    const errs = check({
      from_date: [req('From date')],
      to_date: [req('To date')],
      days: [req('Number of days'), num('Number of days', { min: 0.5 })],
      reason: [req('Reason')],
    }, f);
    setFe(errs);
    if (!ok(errs)) return;
    if (busy) return;
    if (!String(f.reason || '').trim()) { setMsg('Please give a reason for the leave'); return; }
    if (f.to_date < f.from_date) { setMsg('End date cannot be before the start date'); return; }
    if (!(+f.days > 0)) { setMsg('Number of days must be greater than 0'); return; }
    setBusy(true);
    try {
      await api.createLeaveRequest(f);
      toast('Leave application submitted successfully');
      setShowApply(false);
      setF({
        trainer_id: 'TR-001',
        trainer_name: 'Arun Kumar',
        type: 'Casual Leave',
        days: 1,
        reason: '',
        from_date: new Date().toISOString().slice(0, 10),
        to_date: new Date().toISOString().slice(0, 10),
      });
      load();
    } catch (ex) {
      setMsg(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = rows.filter((r) => r.status === 'PENDING').length;
  const approvedCount = rows.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount = rows.filter((r) => r.status === 'REJECTED').length;

  const filtered = rows.filter((r) => {
    if (filter !== 'ALL' && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.trainer_name.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Staff Leave Approvals</h2>
          <p className="sub">Review, approve or decline leave applications submitted by trainers and faculty.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn ghost" onClick={() => setShowApply(true)}>+ Simulate Leave Application</button>
        </div>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <div className="cards">
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h4>Pending Approvals</h4>
          <b style={{ color: '#d97706' }}>{pendingCount}</b>
          <small>Action required</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <h4>Approved</h4>
          <b style={{ color: '#059669' }}>{approvedCount}</b>
          <small>Active & past approved leaves</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h4>Rejected</h4>
          <b style={{ color: '#dc2626' }}>{rejectedCount}</b>
          <small>Declined applications</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid var(--info, #2c4f8c)' }}>
          <h4>Total Applications</h4>
          <b>{rows.length}</b>
          <small>Academic year 2026</small>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 14px', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((tab) => (
            <button type="button"
              key={tab}
              className={`btn sm ${filter === tab ? '' : 'ghost'}`}
              onClick={() => setFilter(tab)}
            >
              {tab === 'ALL' ? 'All Requests' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              {tab === 'PENDING' && pendingCount > 0 && ` (${pendingCount})`}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          style={{ maxWidth: 300, margin: 0 }}
          placeholder="Search by trainer or reason…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading leave requests…</div>
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
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lr) => (
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
                <td style={{ whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500 }}>
                  {lr.from_date}
                  {lr.from_date !== lr.to_date ? ` → ${lr.to_date}` : ''}
                </td>
                <td><b>{lr.days} d</b></td>
                <td style={{ maxWidth: 220, fontSize: 13, lineHeight: 1.45, overflowWrap: 'break-word', color: '#334155' }}>
                  {lr.reason || '—'}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 13, color: '#64748b' }}>{lr.applied_on}</td>
                <td>
                  <span className={'chip ' + (lr.status === 'APPROVED' ? 'PRESENT' : lr.status === 'PENDING' ? 'LATE' : 'ABSENT')}>
                    {lr.status}
                  </span>
                </td>
                <td>
                  {lr.status === 'PENDING' ? (
                    <select
                      className="select-sm"
                      style={{ minWidth: 130 }}
                      value=""
                      onChange={(e) => handleActionChange(lr.id, e.target.value)}
                    >
                      <option value="">Select Action…</option>
                      <option value="approve">✓ Approve</option>
                      <option value="reject">✕ Reject</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Processed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && filtered.length === 0 && (
        <p className="empty">No leave requests match the current filter.</p>
      )}

      {showApply && (
        <div className="modal">
          <div>
            <h3>Simulate / Apply Leave Request</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Submit a trainer leave request to test the approval workflow.
            </p>
            <form onSubmit={submitLeave} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Trainer</label>
              <select
                value={f.trainer_id}
                onChange={(e) => {
                  const id = e.target.value;
                  const name = id === 'TR-001' ? 'Arun Kumar' : 'Divya Rao';
                  setF({ ...f, trainer_id: id, trainer_name: name });
                }}
              >
                <option value="TR-001">Arun Kumar (AI/ML)</option>
                <option value="TR-002">Divya Rao (Full Stack)</option>
              </select>

              <label style={{ fontSize: 13, fontWeight: 600 }}>Leave Type</label>
              <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option>Casual Leave</option>
                <option>Sick Leave</option>
                <option>Earned Leave</option>
                <option>Comp Off</option>
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>From Date</label>
                  <input
                    type="date"
                    required
                    value={f.from_date}
                    onChange={(e) => setF({ ...f, from_date: e.target.value })}
                    aria-invalid={!!fe.from_date}
                  />
                  <Ferr fe={fe} name="from_date" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>To Date</label>
                  <input
                    type="date"
                    required
                    value={f.to_date}
                    onChange={(e) => setF({ ...f, to_date: e.target.value })}
                    aria-invalid={!!fe.to_date}
                  />
                  <Ferr fe={fe} name="to_date" />
                </div>
              </div>

              <label style={{ fontSize: 13, fontWeight: 600 }}>Number of Days</label>
              <div>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  required
                  value={f.days}
                  onChange={(e) => setF({ ...f, days: e.target.value })}
                  aria-invalid={!!fe.days}
                />
                <Ferr fe={fe} name="days" />
              </div>

              <label style={{ fontSize: 13, fontWeight: 600 }}>Reason</label>
              <div>
                <input
                  required
                  placeholder="Reason for leave"
                  value={f.reason}
                  onChange={(e) => setF({ ...f, reason: e.target.value })}
                  aria-invalid={!!fe.reason}
                />
                <Ferr fe={fe} name="reason" />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit Request'}</button>
                <button type="button" className="btn ghost" onClick={() => setShowApply(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
