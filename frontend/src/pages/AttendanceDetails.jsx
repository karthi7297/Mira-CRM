import { useEffect, useState } from 'react';
import { api, downloadCSV } from '../api';
import { useAuth } from '../auth';

export default function AttendanceDetails() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [viewTab, setViewTab] = useState('summary'); // 'summary' | 'log'
  const [selectedBatch, setSelectedBatch] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.attendanceSummary(),
      api.students(),
      api.batches(),
    ])
      .then(([att, stu, b]) => {
        setRecords(att);
        setStudents(stu);
        setBatches(b);
        setLoading(false);
      })
      .catch((err) => {
        setMsg(err.message);
        setLoading(false);
      });
  }, []);

  // Filtered log records
  const filteredLog = records.filter((r) => {
    if (selectedBatch !== 'ALL' && r.batch_id !== selectedBatch) return false;
    if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;
    if (dateFilter && r.date !== dateFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (r.student_name && r.student_name.toLowerCase().includes(q)) ||
        (r.student_id && r.student_id.toLowerCase().includes(q)) ||
        (r.batch_id && r.batch_id.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filtered student summaries
  const filteredStudents = students.filter((s) => {
    if (selectedBatch !== 'ALL' && s.batch_label && !s.batch_label.includes(selectedBatch)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.id && s.id.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalSessionsMarked = records.length;
  const presentRecords = records.filter((r) => r.status === 'PRESENT').length;
  const absentRecords = records.filter((r) => r.status === 'ABSENT').length;
  const overallPct = totalSessionsMarked > 0 ? Math.round((presentRecords / totalSessionsMarked) * 100) : 0;
  const lowAttendanceStudents = students.filter((s) => Number(s.attendance || 0) < 75).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Student Attendance Details</h2>
          <p className="sub">
            Monitor institutional classroom attendance rates, daily logs, and students requiring academic follow-up.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {records.length > 0 && (
            <button type="button"
              className="btn ghost no-print"
              onClick={() =>
                downloadCSV(
                  'student_attendance_details.csv',
                  filteredLog.map((r) => ({
                    Date: r.date,
                    StudentID: r.student_id,
                    StudentName: r.student_name,
                    Batch: r.batch_id,
                    Status: r.status,
                    MarkedAt: r.marked_at,
                  }))
                )
              }
            >
              Export Log CSV
            </button>
          )}
        </div>
      </div>

      {msg && <div className="err">{msg}</div>}

      <div className="cards">
        <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
          <h4>Overall Attendance</h4>
          <b style={{ color: overallPct >= 75 ? '#16a34a' : '#d97706' }}>{overallPct}%</b>
          <small>{presentRecords} present out of {totalSessionsMarked} session entries</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <h4>Present Records</h4>
          <b style={{ color: '#059669' }}>{presentRecords}</b>
          <small>Marked PRESENT</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h4>Absences Recorded</h4>
          <b style={{ color: '#dc2626' }}>{absentRecords}</b>
          <small>Marked ABSENT</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h4>Low Attendance Alert (&lt;75%)</h4>
          <b style={{ color: lowAttendanceStudents > 0 ? '#b45309' : '#059669' }}>
            {lowAttendanceStudents}
          </b>
          <small>Students below required threshold</small>
        </div>
      </div>

      {/* Tabs and Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0 14px', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button"
            className={`btn sm ${viewTab === 'summary' ? '' : 'ghost'}`}
            onClick={() => setViewTab('summary')}
          >
            Student Attendance Summary ({filteredStudents.length})
          </button>
          <button type="button"
            className={`btn sm ${viewTab === 'log' ? '' : 'ghost'}`}
            onClick={() => setViewTab('log')}
          >
            Detailed Daily Log ({filteredLog.length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
          >
            <option value="ALL">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} ({b.program_name || 'Batch'})
              </option>
            ))}
          </select>

          {viewTab === 'log' && (
            <>
              <select
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="PRESENT">Present</option>
                <option value="ABSENT">Absent</option>
                <option value="LATE">Late</option>
              </select>
              <input
                type="date"
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
              {dateFilter && (
                <button type="button" className="btn sm ghost" onClick={() => setDateFilter('')}>Clear Date</button>
              )}
            </>
          )}

          <input
            className="search-input"
            style={{ maxWidth: 220, margin: 0 }}
            placeholder="Search student…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading attendance details…</div>
      ) : viewTab === 'summary' ? (
        <div>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Student Name</th>
                <th>Enrolled Batch</th>
                <th>Program</th>
                <th>Attendance %</th>
                <th>Status</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s) => {
                const att = Number(s.attendance || 0);
                const isGood = att >= 75;
                const isMid = att >= 50 && att < 75;
                return (
                  <tr key={s.id}>
                    <td className="mono">{s.id}</td>
                    <td><b>{s.name}</b></td>
                    <td>{s.batch_label || '—'}</td>
                    <td>{s.program || '—'}</td>
                    <td style={{ width: 180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, att)}%`,
                              height: '100%',
                              background: isGood ? '#10b981' : isMid ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{att}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={'chip ' + (isGood ? 'PRESENT' : isMid ? 'LATE' : 'ABSENT')}>
                        {isGood ? 'REGULAR' : isMid ? 'BORDERLINE' : 'DEFICIT'}
                      </span>
                    </td>
                    <td className="meta">{s.email || '—'}{s.phone ? ` · ${s.phone}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredStudents.length === 0 && <p className="empty">No students found matching your criteria.</p>}
        </div>
      ) : (
        <div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Student ID</th>
                <th>Student Name</th>
                <th>Batch</th>
                <th>Status</th>
                <th>Marked At</th>
              </tr>
            </thead>
            <tbody>
              {filteredLog.map((r, i) => (
                <tr key={`${r.student_id}-${r.date}-${i}`}>
                  <td><b>{r.date}</b></td>
                  <td className="mono">{r.student_id}</td>
                  <td><b>{r.student_name}</b></td>
                  <td>{r.batch_id}</td>
                  <td>
                    <span className={'chip ' + r.status}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{r.marked_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLog.length === 0 && <p className="empty">No attendance log entries matching filter.</p>}
        </div>
      )}
    </div>
  );
}
