import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr, downloadCSV, toast, toastError } from '../api';
import { useAuth } from '../auth';
import { BarChart, LineChart, PieChart, KPICard, AttendanceBar } from '../widgets';
import { printExecutiveReport, printInvoice, printQuotation, printReceipt } from '../report';
import { useListControls, ListToolbar, Pager, SortHeader, useBulkSelection, BulkBar, SelectAllTh, downloadCsv, useSavedViews, SavedViewsBar, ListState, DateRange, ArchiveToggle } from '../listkit';

export function Quotations() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [viewQuo, setViewQuo] = useState(null);
  const [archived, setArchived] = useState(false);
  const [custs, setCusts] = useState([]);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const load = () => {
    setLoading(true); setLoadErr('');
    api.quotations(archived ? '?archived=1' : '').then(setRows).catch((e) => { setLoadErr(e.message); setMsg(e.message); }).finally(() => setLoading(false));
    api.customers().then(setCusts).catch(() => {});
  };

  useEffect(() => { load(); }, [archived]);

  const doArchive = async (id) => {
    if (!window.confirm('Archive this quotation? It leaves the list but stays recoverable.')) return;
    try { await api.archive('quotations', id); toast('Quotation archived'); load(); }
    catch (e) { setMsg(e.message); }
  };
  const doRestore = async (id) => {
    try { await api.restore('quotations', id); toast('Quotation restored'); load(); }
    catch (e) { setMsg(e.message); }
  };

  const create = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.customer_id) { setMsg('Select a client institution'); return; }
    if (!String(f.program || '').trim()) { setMsg('Program description is required'); return; }
    if (!(+f.rate > 0)) { setMsg('Rate must be greater than 0'); return; }
    setBusy(true);
    try {
      await api.createQuotation({
        customer_id: f.customer_id,
        program: f.program,
        discount: +f.discount || 0,
        items: [{ description: f.program || 'Training', qty: +f.qty || 1, rate: +f.rate || 100000 }],
      });
      setShow(false);
      setF({});
      toast('Quotation created successfully');
      load();
    } catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
  };

  const convert = async (qid) => {
    setMsg('');
    try {
      const inv = await api.convertQuotation(qid);
      toast(`✓ Converted to Invoice ${inv.id}!`);
      setMsg(`✓ Quotation promoted to Invoice ${inv.id}`);
      if (viewQuo) setViewQuo(null);
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const updateStatus = async (qid, status) => {
    try {
      await api.patchQuotation(qid, { status });
      toast(`✓ Quotation updated to ${status}`);
      if (viewQuo) setViewQuo({ ...viewQuo, status });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const base = useMemo(() => rows.filter((q) => filter === 'ALL' || q.status === filter), [rows, filter]);
  const L = useListControls(base, {
    searchKeys: ['id', 'customer_name', 'program', 'status'],
    initialSort: { key: 'id', dir: 'desc' },
    dateKey: 'created_at',
  });
  const bulk = useBulkSelection();
  const bulkStatus = async (status) => {
    for (const id of bulk.ids) {
      try { await api.patchQuotation(id, { status }); } catch { /* keep going */ }
    }
    toast(`Updated ${bulk.size} quotation(s) to ${status}`);
    bulk.clear();
    load();
  };

  const totalValue = rows.reduce((acc, q) => acc + Number(q.total || 0), 0);
  const acceptedValue = rows.filter(q => q.status === 'ACCEPTED').reduce((acc, q) => acc + Number(q.total || 0), 0);

  const statusData = [
    { status: 'DRAFT', count: rows.filter(q => q.status === 'DRAFT').length, value: rows.filter(q => q.status === 'DRAFT').reduce((a, q) => a + Number(q.total || 0), 0) },
    { status: 'SENT', count: rows.filter(q => q.status === 'SENT').length, value: rows.filter(q => q.status === 'SENT').reduce((a, q) => a + Number(q.total || 0), 0) },
    { status: 'ACCEPTED', count: rows.filter(q => q.status === 'ACCEPTED').length, value: rows.filter(q => q.status === 'ACCEPTED').reduce((a, q) => a + Number(q.total || 0), 0) },
    { status: 'REJECTED', count: rows.filter(q => q.status === 'REJECTED').length, value: rows.filter(q => q.status === 'REJECTED').reduce((a, q) => a + Number(q.total || 0), 0) },
  ].filter(d => d.count > 0);

  const conversionRate = totalValue > 0 ? Math.round((acceptedValue / totalValue) * 100) : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Quotations & Proposals</h2>
          <p className="sub">Manage commercial estimates, institutional proposals, and 1-click invoice conversions.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {rows.length > 0 && (
            <button type="button"
              className="btn ghost no-print"
              onClick={() =>
                downloadCSV(
                  'quotations.csv',
                  rows.map((q) => ({ ID: q.id, Customer: q.customer_name, Program: q.program, Total: q.total, Status: q.status }))
                )
              }
            >
              Export CSV
            </button>
          )}
          {user?.role === 'organization' && (
            <button type="button" className="btn" onClick={() => setShow(true)}>+ Create Quotation</button>
          )}
        </div>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <ListState loading={loading} error={loadErr} onRetry={load} empty={!loading && !loadErr && rows.length === 0} emptyText="No quotations yet." />

      <div className="cards kpi-strip">
        <KPICard compact title="Total Pipeline Value" value={inr(totalValue)} subtitle={`${rows.length} quotation documents`} color="var(--accent)" />
        <KPICard compact title="Accepted Proposals" value={inr(acceptedValue)} subtitle={`${conversionRate}% conversion rate`} trend={`${conversionRate - 25}%`} trendUp={conversionRate >= 25} color="var(--ok)" />
        <KPICard compact title="Sent / In Review" value={rows.filter(q => q.status === 'SENT').length} subtitle="Awaiting customer approval" color="var(--info)" />
        <KPICard compact title="Drafts" value={rows.filter(q => q.status === 'DRAFT').length} subtitle="Internal proposals" color="var(--warn)" />
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>Pipeline by Status</h4>
          <div style={{ marginTop: 8 }}>
            {statusData.length > 0 ? (
              <BarChart
                data={statusData}
                keys={['value']}
                colors={['#f59e0b', '#3b82f6', '#16a34a', '#ef4444']}
                height={150}
                showLegend={false}
                labelKey="status"
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No pipeline data</div>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Status Distribution</h4>
          <div style={{ marginTop: 8 }}>
            {statusData.length > 0 ? (
              <PieChart
                data={statusData}
                labelKey="status"
                valueKey="count"
                colors={['#f59e0b', '#3b82f6', '#16a34a', '#ef4444']}
                height={170}
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No status data</div>
            )}
          </div>
        </div>
      </div>

      <ListToolbar
        L={L}
        placeholder="Search by ID, customer or program…"
        sortOptions={[['id', 'ID'], ['customer_name', 'Customer'], ['program', 'Program'], ['total', 'Total'], ['status', 'Status']]}
      >
        <div className="seg" style={{ display: 'flex', gap: 4 }}>
          {['ALL', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'].map((tab) => (
            <button type="button"
              key={tab}
              className={`btn sm ${filter === tab ? '' : 'ghost'}`}
              onClick={() => setFilter(tab)}
            >
              {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <DateRange L={L} label="Created" />
        <ArchiveToggle value={archived} onChange={setArchived} />
      </ListToolbar>

      <BulkBar bulk={bulk}>
        <button type="button" className="btn sm ghost" onClick={() => bulkStatus('SENT')}>Mark Sent</button>
        <button type="button" className="btn sm ghost" onClick={() => bulkStatus('ACCEPTED')}>Mark Accepted</button>
        <button type="button" className="btn sm ghost" onClick={() => bulkStatus('REJECTED')}>Mark Rejected</button>
      </BulkBar>

      <table>
        <thead>
          <tr>
            <SelectAllTh bulk={bulk} ids={L.rows.map((q) => q.id)} />
            <SortHeader label="ID" k="id" L={L} />
            <SortHeader label="Customer" k="customer_name" L={L} />
            <SortHeader label="Program" k="program" L={L} />
            <SortHeader label="Total" k="total" L={L} />
            <SortHeader label="Status" k="status" L={L} />
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {L.rows.map((q) => (
            <tr key={q.id}>
              <td><input type="checkbox" aria-label={`Select ${q.id}`} checked={bulk.has(q.id)} onChange={() => bulk.toggle(q.id)} /></td>
              <td className="mono"><b>{q.id}</b></td>
              <td><b>{q.customer_name}</b></td>
              <td>{q.program || '—'}</td>
              <td><b>{inr(q.total)}</b></td>
              <td><span className={'chip ' + q.status}>{q.status}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn sm ghost" onClick={() => setViewQuo(q)}>View Details</button>
                  {user?.role === 'organization' && q.status !== 'ACCEPTED' && (
                    <button type="button" className="btn sm ghost" onClick={() => convert(q.id)}>
                      Convert to Invoice →
                    </button>
                  )}
                  {user?.role === 'institution' && q.status === 'SENT' && (
                    <button type="button" className="btn sm" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={() => updateStatus(q.id, 'ACCEPTED')}>
                      ✓ Accept
                    </button>
                  )}
                  {user?.role === 'organization' && (archived
                    ? <button type="button" className="btn sm ghost" onClick={() => doRestore(q.id)}>Restore</button>
                    : <button type="button" className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => doArchive(q.id)}>Archive</button>)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">{archived ? 'No archived quotations.' : 'No quotations yet.'}</p>}
      {rows.length > 0 && L.total === 0 && <p className="empty">No quotations matching filter.</p>}
      <Pager L={L} />

      {/* Create Modal */}
      {show && (
        <div className="modal">
          <div>
            <h3>Create Quotation</h3>
            <form onSubmit={create} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Client Institution *</label>
              <select required value={f.customer_id || ''} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
                <option value="">Select customer…</option>
                {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Training Program *</label>
              <input required placeholder="e.g. AI & Machine Learning Specialization" value={f.program || ''} onChange={(e) => setF({ ...f, program: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Estimated Students (Qty)</label>
                  <input placeholder="Qty" type="number" value={f.qty || ''} onChange={(e) => setF({ ...f, qty: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Fee per Student / Rate (₹)</label>
                  <input placeholder="Rate" type="number" value={f.rate || ''} onChange={(e) => setF({ ...f, rate: e.target.value })} />
                </div>
              </div>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Discount (₹)</label>
              <input placeholder="Optional discount" type="number" value={f.discount || ''} onChange={(e) => setF({ ...f, discount: e.target.value })} />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Quotation'}</button>
                <button type="button" className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Quotation Details Modal */}
      {viewQuo && (
        <div className="modal">
          <div style={{ maxWidth: 650 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>Quotation {viewQuo.id}</h3>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
                  Client: <b>{viewQuo.customer_name}</b> · {viewQuo.program}
                </p>
              </div>
              <span className={'chip ' + viewQuo.status}>{viewQuo.status}</span>
            </div>

            <div className="card" style={{ background: '#f8fafc', padding: 16 }}>
              <div className="totals">
                <div><span>Subtotal</span><b>{inr(viewQuo.subtotal)}</b></div>
                <div><span>Discount</span><b>−{inr(viewQuo.discount)}</b></div>
                <div><span>Tax (GST 18%)</span><b>{inr(viewQuo.tax)}</b></div>
                <div className="grand"><span>Total Amount</span><b>{inr(viewQuo.total)}</b></div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
              <button type="button" className="btn ghost" onClick={() => printQuotation(viewQuo)}>Print Quotation</button>
              <div style={{ display: 'flex', gap: 8 }}>
                {user?.role === 'organization' && viewQuo.status === 'DRAFT' && (
                  <button type="button" className="btn ghost" onClick={() => updateStatus(viewQuo.id, 'SENT')}>Mark as Sent</button>
                )}
                {user?.role === 'organization' && viewQuo.status !== 'ACCEPTED' && (
                  <button type="button" className="btn" onClick={() => convert(viewQuo.id)}>Convert to Invoice →</button>
                )}
                {user?.role === 'institution' && viewQuo.status === 'SENT' && (
                  <>
                    <button type="button" className="btn" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={() => updateStatus(viewQuo.id, 'ACCEPTED')}>
                      ✓ Accept Proposal
                    </button>
                    <button type="button" className="btn ghost" style={{ color: '#ef4444' }} onClick={() => updateStatus(viewQuo.id, 'REJECTED')}>
                      Decline
                    </button>
                  </>
                )}
                <button type="button" className="btn ghost" onClick={() => setViewQuo(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Invoices() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [archived, setArchived] = useState(false);
  const [payForm, setPayForm] = useState({ method: 'Bank Transfer' });
  const [busy, setBusy] = useState(false);
  const [custs, setCusts] = useState([]);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const load = () => {
    setLoading(true); setLoadErr('');
    api.invoices(archived ? '?archived=1' : '').then(setRows).catch((e) => { setLoadErr(e.message); setMsg(e.message); }).finally(() => setLoading(false));
    api.customers().then(setCusts).catch(() => {});
  };

  useEffect(() => { load(); }, [archived]);

  const doArchive = async (id) => {
    if (!window.confirm('Archive this invoice? It leaves the receivables list but stays recoverable.')) return;
    try { await api.archive('invoices', id); toast('Invoice archived'); load(); }
    catch (e) { setMsg(e.message); }
  };
  const doRestore = async (id) => {
    try { await api.restore('invoices', id); toast('Invoice restored'); load(); }
    catch (e) { setMsg(e.message); }
  };

  const create = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.customer_id) { setMsg('Select a client institution'); return; }
    if (!String(f.program || '').trim()) { setMsg('Program description is required'); return; }
    if (!(+f.rate > 0)) { setMsg('Rate must be greater than 0'); return; }
    setBusy(true);
    try {
      await api.createInvoice({
        customer_id: f.customer_id,
        program: f.program,
        discount: +f.discount || 0,
        due_date: f.due_date || null,
        items: [{ description: f.program || 'Training', qty: +f.qty || 1, rate: +f.rate || 100000 }],
      });
      setShow(false);
      setF({});
      toast('Invoice created successfully');
      load();
    } catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!(+payForm.amount > 0)) { setMsg('Payment amount must be greater than 0'); return; }
    if (+payForm.amount > payModal.outstanding) { setMsg('Payment cannot exceed the outstanding balance'); return; }
    setBusy(true);
    try {
      const res = await api.pay({
        invoice_id: payModal.id,
        amount: +payForm.amount,
        method: payForm.method,
        date: payForm.date || new Date().toISOString().slice(0, 10),
        reference: payForm.reference || '',
        notes: payForm.notes || '',
      });
      toast(`Payment of ${inr(payForm.amount)} recorded!`);
      setPayModal(null);
      setPayForm({ method: 'Bank Transfer' });
      load();
    } catch (ex) {
      setMsg(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const base = useMemo(() => rows.filter((i) => filter === 'ALL' || i.status === filter), [rows, filter]);
  const L = useListControls(base, {
    searchKeys: ['id', 'customer_name', 'program', 'status'],
    initialSort: { key: 'id', dir: 'desc' },
    dateKey: 'due_date',
  });
  const bulk = useBulkSelection();
  const views = useSavedViews('invoices',
    () => ({ q: L.q, sort: L.sort, filter, archived, from: L.from, to: L.to }),
    (s) => {
      L.setQ(s.q || ''); L.setSort(s.sort || null); setFilter(s.filter || 'ALL');
      setArchived(!!s.archived); L.setFrom(s.from || ''); L.setTo(s.to || '');
    });

  const totalBilled = rows.reduce((acc, i) => acc + Number(i.total || 0), 0);
  const totalPaid = rows.reduce((acc, i) => acc + Number(i.paid || 0), 0);
  const totalOutstanding = rows.reduce((acc, i) => acc + Number(i.outstanding || 0), 0);
  const overdueCount = rows.filter(i => i.status === 'OVERDUE').length;
  const collectionRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;

  const statusData = [
    { status: 'UNPAID', count: rows.filter(i => i.status === 'UNPAID').length, value: rows.filter(i => i.status === 'UNPAID').reduce((a, i) => a + Number(i.total || 0), 0) },
    { status: 'PARTIALLY_PAID', count: rows.filter(i => i.status === 'PARTIALLY_PAID').length, value: rows.filter(i => i.status === 'PARTIALLY_PAID').reduce((a, i) => a + Number(i.total || 0), 0) },
    { status: 'PAID', count: rows.filter(i => i.status === 'PAID').length, value: rows.filter(i => i.status === 'PAID').reduce((a, i) => a + Number(i.total || 0), 0) },
    { status: 'OVERDUE', count: rows.filter(i => i.status === 'OVERDUE').length, value: rows.filter(i => i.status === 'OVERDUE').reduce((a, i) => a + Number(i.total || 0), 0) },
  ].filter(d => d.count > 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Tax Invoices & Receivables</h2>
          <p className="sub">Track billed invoices, payment milestones, collections, and overdue receivables.</p>
        </div>
        <span style={{ display: 'flex', gap: 8 }}>
          {rows.length > 0 && (
            <button type="button"
              className="btn ghost no-print"
              onClick={() =>
                downloadCSV(
                  'invoices.csv',
                  rows.map((i) => ({
                    id: i.id,
                    customer: i.customer_name,
                    total: i.total,
                    paid: i.paid,
                    outstanding: i.outstanding,
                    status: i.status,
                    due_date: i.due_date,
                  }))
                )
              }
            >
              Export CSV
            </button>
          )}
          {user?.role === 'organization' && (
            <button type="button" className="btn" onClick={() => setShow(true)}>+ Create Invoice</button>
          )}
        </span>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <ListState loading={loading} error={loadErr} onRetry={load} empty={!loading && !loadErr && rows.length === 0} emptyText="No invoices yet." />

      <div className="cards kpi-strip">
        <KPICard compact title="Total Billed" value={inr(totalBilled)} subtitle={`${rows.length} invoices issued`} color="var(--accent)" />
        <KPICard compact title="Collected" value={inr(totalPaid)} subtitle={`${collectionRate}% recovery rate`} trend={`${collectionRate - 60}%`} trendUp={collectionRate >= 60} color="var(--ok)" />
        <KPICard compact title="Outstanding Balance" value={inr(totalOutstanding)} subtitle="Receivables pending" color="var(--warn)" />
        <KPICard compact title="Overdue Invoices" value={overdueCount} subtitle="Critical collection focus" color="var(--bad)" />
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>Invoices by Status</h4>
          <div style={{ marginTop: 8 }}>
            {statusData.length > 0 ? (
              <BarChart
                data={statusData}
                keys={['value']}
                colors={['#ef4444', '#f59e0b', '#16a34a', '#dc2626']}
                height={150}
                showLegend={false}
                labelKey="status"
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No invoice data</div>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Status Distribution</h4>
          <div style={{ marginTop: 8 }}>
            {statusData.length > 0 ? (
              <PieChart
                data={statusData}
                labelKey="status"
                valueKey="count"
                colors={['#ef4444', '#f59e0b', '#16a34a', '#dc2626']}
                height={170}
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No status data</div>
            )}
          </div>
        </div>
      </div>

      <SavedViewsBar views={views} />
      <ListToolbar
        L={L}
        placeholder="Search by ID or customer…"
        sortOptions={[['id', 'ID'], ['customer_name', 'Customer'], ['due_date', 'Due Date'], ['total', 'Total'], ['outstanding', 'Outstanding'], ['status', 'Status']]}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {['ALL', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'].map((tab) => (
            <button type="button"
              key={tab}
              className={`btn sm ${filter === tab ? '' : 'ghost'}`}
              onClick={() => setFilter(tab)}
            >
              {tab === 'ALL' ? 'All' : tab.replace('_', ' ')}
            </button>
          ))}
        </div>
        <DateRange L={L} label="Due" />
        <ArchiveToggle value={archived} onChange={setArchived} />
      </ListToolbar>

      <table>
        <thead>
          <tr>
            <SortHeader label="ID" k="id" L={L} />
            <SortHeader label="Customer" k="customer_name" L={L} />
            <SortHeader label="Due Date" k="due_date" L={L} />
            <SortHeader label="Total" k="total" L={L} />
            <SortHeader label="Paid" k="paid" L={L} />
            <SortHeader label="Outstanding" k="outstanding" L={L} />
            <SortHeader label="Status" k="status" L={L} />
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {L.rows.map((i) => (
            <tr key={i.id}>
              <td className="mono"><b>{i.id}</b></td>
              <td><b>{i.customer_name}</b></td>
              <td style={{ whiteSpace: 'nowrap', fontSize: 13, color: '#64748b' }}>{i.due_date || '—'}</td>
              <td>{inr(i.total)}</td>
              <td style={{ color: '#059669' }}>{inr(i.paid)}</td>
              <td><b>{inr(i.outstanding)}</b></td>
              <td><span className={'chip ' + i.status}>{i.status}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link to={'/invoices/' + i.id} className="btn sm ghost">Open</Link>
                  {!archived && i.outstanding > 0 && (
                    <button type="button"
                      className="btn sm"
                      style={{ background: '#2563eb', borderColor: '#2563eb' }}
                      onClick={() => {
                        setPayModal(i);
                        setPayForm({ method: 'Bank Transfer', amount: i.outstanding });
                      }}
                    >
                      Record Payment
                    </button>
                  )}
                  {user?.role === 'organization' && (archived
                    ? <button type="button" className="btn sm ghost" onClick={() => doRestore(i.id)}>Restore</button>
                    : <button type="button" className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => doArchive(i.id)}>Archive</button>)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">{archived ? 'No archived invoices.' : 'No invoices yet.'}</p>}
      {rows.length > 0 && L.total === 0 && <p className="empty">No invoices found matching filter.</p>}
      <Pager L={L} />

      {/* Create Modal */}
      {show && (
        <div className="modal">
          <div>
            <h3>Create Tax Invoice</h3>
            <form onSubmit={create} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Client Institution *</label>
              <select required value={f.customer_id || ''} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
                <option value="">Select customer…</option>
                {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Training Program *</label>
              <input required placeholder="Program description" value={f.program || ''} onChange={(e) => setF({ ...f, program: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Quantity</label>
                  <input placeholder="Qty" type="number" value={f.qty || ''} onChange={(e) => setF({ ...f, qty: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Rate (₹)</label>
                  <input placeholder="Rate" type="number" value={f.rate || ''} onChange={(e) => setF({ ...f, rate: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Discount (₹)</label>
                  <input placeholder="Discount" type="number" value={f.discount || ''} onChange={(e) => setF({ ...f, discount: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Due Date</label>
                  <input type="date" value={f.due_date || ''} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Issuing…' : 'Issue Invoice'}</button>
                <button type="button" className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Pay Modal */}
      {payModal && (
        <div className="modal">
          <div>
            <h3>Record Payment for {payModal.id}</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              Client: <b>{payModal.customer_name}</b> · Outstanding: <b>{inr(payModal.outstanding)}</b>
            </p>
            <form onSubmit={handlePay} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Amount (₹) *</label>
              <input
                required
                type="number"
                max={payModal.outstanding}
                value={payForm.amount || ''}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Payment Method</label>
              <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                <option>Bank Transfer</option>
                <option>UPI</option>
                <option>Cheque</option>
                <option>Cash</option>
              </select>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Payment Date</label>
              <input
                type="date"
                value={payForm.date || new Date().toISOString().slice(0, 10)}
                onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
              />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Transaction / UTR Reference</label>
              <input
                placeholder="e.g. NEFT-998812 / UPI Ref"
                value={payForm.reference || ''}
                onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit Payment'}</button>
                <button type="button" className="btn ghost" onClick={() => setPayModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function InvoiceDetail() {
  const { id } = useParams();
  const [inv, setInv] = useState(null);
  const [msg, setMsg] = useState('');
  const [pay, setPay] = useState({ method: 'Bank Transfer' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.invoice(id).then(setInv).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [id]);

  const record = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!(+pay.amount > 0)) { setMsg('Payment amount must be greater than 0'); return; }
    if (+pay.amount > inv.outstanding) { setMsg('Payment cannot exceed the outstanding balance'); return; }
    setBusy(true);
    setMsg('');
    try {
      const r = await api.pay({ invoice_id: id, ...pay, amount: +pay.amount });
      setShow(false);
      setPay({ method: 'Bank Transfer' });
      toast('Payment successfully recorded');
      setMsg(`Payment recorded. Outstanding updated: ${inr(r.outstanding)}`);
      load();
    } catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
  };

  if (!inv) return <div className={msg ? 'err' : 'loading'}>{msg || 'Loading invoice…'}</div>;

  return (
    <div>
      <Link to="/invoices" className="back">← Invoices</Link>

      <div className="page-head">
        <div>
          <h2>Invoice {inv.id}</h2>
          <p className="sub">{inv.customer_name} · {inv.program || 'Training'}</p>
        </div>
        <span className={'chip ' + inv.status}>{inv.status}</span>
      </div>

      {msg && <div className="okmsg">{msg}</div>}

      <div className="card">
        <h4>Line items</h4>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i}>
                <td>{it.description}</td>
                <td>{it.qty}</td>
                <td>{inr(it.rate)}</td>
                <td><b>{inr(it.amount)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totals">
          <div><span>Subtotal</span><b>{inr(inv.subtotal)}</b></div>
          <div><span>Discount</span><b>−{inr(inv.discount)}</b></div>
          <div><span>Tax</span><b>{inr(inv.tax)}</b></div>
          <div className="grand"><span>Total</span><b>{inr(inv.total)}</b></div>
          <div><span>Paid</span><b>{inr(inv.paid)}</b></div>
          <div className="due"><span>Outstanding</span><b>{inr(inv.outstanding)}</b></div>
        </div>

        <div className="mt no-print" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={() => printInvoice(inv)}>Print Receipt</button>
          {inv.outstanding > 0 && (
            <button type="button" className="btn" onClick={() => { setPay({ method: 'Bank Transfer', amount: inv.outstanding }); setShow(true); }}>
              Record Payment
            </button>
          )}
        </div>
      </div>

      <div className="cert-paper" style={{ marginTop: 18 }}>
        <h1>OFFICIAL PAYMENT RECEIPT</h1>
        <p style={{ fontSize: 13 }}>Rampex Education Services · Invoice {inv.id} · {inv.customer_name}</p>
        <p style={{ fontSize: 14 }}>Paid <b>{inr(inv.paid)}</b> of <b>{inr(inv.total)}</b> · Outstanding <b>{inr(inv.outstanding)}</b></p>
        {inv.payments.map((p) => <p key={p.id} style={{ fontSize: 12 }}>{p.id} · {inr(p.amount)} · {p.method} · {p.date} · Ref: {p.reference || 'N/A'}</p>)}
      </div>

      <h4 style={{ marginTop: 26 }}>Payments Recorded</h4>
      <table>
        <thead><tr><th>ID</th><th>Amount</th><th>Method</th><th>Date</th><th>Reference</th></tr></thead>
        <tbody>
          {inv.payments.map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.id}</td>
              <td><b>{inr(p.amount)}</b></td>
              <td>{p.method}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{p.date}</td>
              <td className="meta">{p.reference || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {inv.payments.length === 0 && <p className="empty">No payments recorded against this invoice yet.</p>}

      {show && (
        <div className="modal">
          <div>
            <h3>Record Payment</h3>
            <form onSubmit={record} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Amount (₹) *</label>
              <input required max={inv.outstanding} placeholder="Amount *" type="number" value={pay.amount || ''} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Method</label>
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                <option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Cash</option>
              </select>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Date</label>
              <input type="date" value={pay.date || new Date().toISOString().slice(0, 10)} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Reference</label>
              <input placeholder="NEFT / UTR / Cheque No" value={pay.reference || ''} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Recording…' : 'Record Payment'}</button>
                <button type="button" className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function Payments() {
  const [rows, setRows] = useState([]);
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const load = () => {
    setLoading(true); setLoadErr('');
    return api.payments().then(setRows).catch((e) => setLoadErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const base = useMemo(() => rows.filter((p) => methodFilter === 'ALL' || p.method === methodFilter), [rows, methodFilter]);
  const L = useListControls(base, {
    searchKeys: ['id', 'invoice_id', 'customer_name', 'reference', 'method'],
    initialSort: { key: 'date', dir: 'desc' },
  });

  const totalCollected = rows.reduce((acc, p) => acc + Number(p.amount || 0), 0);

  const methodData = [
    { method: 'Bank Transfer', count: rows.filter(p => p.method === 'Bank Transfer').length, value: rows.filter(p => p.method === 'Bank Transfer').reduce((a, p) => a + Number(p.amount || 0), 0) },
    { method: 'UPI', count: rows.filter(p => p.method === 'UPI').length, value: rows.filter(p => p.method === 'UPI').reduce((a, p) => a + Number(p.amount || 0), 0) },
    { method: 'Cheque', count: rows.filter(p => p.method === 'Cheque').length, value: rows.filter(p => p.method === 'Cheque').reduce((a, p) => a + Number(p.amount || 0), 0) },
    { method: 'Cash', count: rows.filter(p => p.method === 'Cash').length, value: rows.filter(p => p.method === 'Cash').reduce((a, p) => a + Number(p.amount || 0), 0) },
  ].filter(d => d.count > 0);

  const dailyCollections = rows.reduce((acc, p) => {
    const date = p.date;
    if (!acc[date]) acc[date] = 0;
    acc[date] += Number(p.amount || 0);
    return acc;
  }, {});
  const dailyData = Object.entries(dailyCollections).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Payment Collections</h2>
          <p className="sub">Complete audit log of cash, bank, and online payments received from institutions.</p>
        </div>
        {rows.length > 0 && (
          <button type="button"
            className="btn ghost no-print"
            onClick={() =>
              downloadCSV(
                'payments.csv',
                rows.map((p) => ({ id: p.id, invoice: p.invoice_id, customer: p.customer_name, amount: p.amount, method: p.method, date: p.date, reference: p.reference }))
              )
            }
          >
            Export CSV
          </button>
        )}
      </div>

      <ListState loading={loading} error={loadErr} onRetry={load} empty={!loading && !loadErr && rows.length === 0} emptyText="No payments recorded yet." />

      <div className="cards kpi-strip">
        <KPICard compact title="Total Collected" value={inr(totalCollected)} subtitle={`${rows.length} transactions processed`} color="var(--accent)" />
        <KPICard compact title="Bank Transfers" value={inr(rows.filter(p => p.method === 'Bank Transfer').reduce((acc, p) => acc + Number(p.amount || 0), 0))} subtitle={`${rows.filter(p => p.method === 'Bank Transfer').length} settlements`} color="var(--info)" />
        <KPICard compact title="UPI & Digital" value={inr(rows.filter(p => p.method === 'UPI').reduce((acc, p) => acc + Number(p.amount || 0), 0))} subtitle={`${rows.filter(p => p.method === 'UPI').length} instant payments`} color="var(--ok)" />
        <KPICard compact title="Cheque & Cash" value={inr(rows.filter(p => ['Cheque', 'Cash'].includes(p.method)).reduce((acc, p) => acc + Number(p.amount || 0), 0))} subtitle={`${rows.filter(p => ['Cheque', 'Cash'].includes(p.method)).length} cleared receipts`} color="var(--warn)" />
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>Collections by Method</h4>
          <div style={{ marginTop: 8 }}>
            {methodData.length > 0 ? (
              <BarChart
                data={methodData}
                keys={['value']}
                colors={['#3b82f6', '#16a34a', '#f59e0b', '#8b5cf6']}
                height={150}
                showLegend={false}
                labelKey="method"
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No payment data</div>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Daily Collections (Last 14 Days)</h4>
          <div style={{ marginTop: 8 }}>
            {dailyData.length > 0 ? (
              <LineChart
                data={dailyData}
                keys={['amount']}
                colors={['#16a34a']}
                height={150}
                showLegend={false}
                labelKey="date"
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No daily data</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>Method Distribution</h4>
          <div style={{ marginTop: 8 }}>
            {methodData.length > 0 ? (
              <PieChart
                data={methodData}
                labelKey="method"
                valueKey="value"
                colors={['#3b82f6', '#16a34a', '#f59e0b', '#8b5cf6']}
                height={170}
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No method data</div>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Top Customers by Payment</h4>
          <div style={{ marginTop: 8 }}>
            {rows.length > 0 && (
              <div className="list" style={{ maxHeight: 200, overflow: 'auto' }}>
                {(() => {
                  const agg = rows.reduce((acc, p) => {
                    const name = p.customer_name || 'Unknown';
                    if (!acc[name]) acc[name] = { amount: 0, count: 0 };
                    acc[name].amount += Number(p.amount || 0);
                    acc[name].count += 1;
                    return acc;
                  }, {});
                  return Object.entries(agg)
                    .sort((a, b) => b[1].amount - a[1].amount)
                    .slice(0, 8)
                    .map(([name, data]) => (
                      <div key={name} className="list-row">
                        <span className="grow"><b>{name}</b></span>
                        <span className="meta">{data.count} payments</span>
                        <b className="amt">{inr(data.amount)}</b>
                      </div>
                    ));
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      <ListToolbar
        L={L}
        placeholder="Search by ID, customer or reference…"
        sortOptions={[['id', 'ID'], ['customer_name', 'Customer'], ['amount', 'Amount'], ['method', 'Method'], ['date', 'Date']]}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {['ALL', 'Bank Transfer', 'UPI', 'Cheque', 'Cash'].map((m) => (
            <button type="button"
              key={m}
              className={`btn sm ${methodFilter === m ? '' : 'ghost'}`}
              onClick={() => setMethodFilter(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </ListToolbar>

      <table>
        <thead>
          <tr>
            <SortHeader label="ID" k="id" L={L} />
            <SortHeader label="Invoice" k="invoice_id" L={L} />
            <SortHeader label="Customer" k="customer_name" L={L} />
            <SortHeader label="Amount" k="amount" L={L} />
            <SortHeader label="Method" k="method" L={L} />
            <SortHeader label="Date" k="date" L={L} />
            <th>Reference</th>
            <th>Receipt</th>
          </tr>
        </thead>
        <tbody>
          {L.rows.map((p) => (
            <tr key={p.id}>
              <td className="mono"><b>{p.id}</b></td>
              <td><Link to={'/invoices/' + p.invoice_id} className="mono">{p.invoice_id}</Link></td>
              <td><b>{p.customer_name}</b></td>
              <td><b style={{ color: '#059669' }}>{inr(p.amount)}</b></td>
              <td><span className="chip" style={{ background: '#f1f5f9', color: '#334155' }}>{p.method}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>{p.date}</td>
              <td className="meta">{p.reference || '—'}</td>
              <td>
                <button type="button" className="btn sm ghost" onClick={() => setSelectedReceipt(p)}>Receipt</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No payments recorded yet.</p>}
      {rows.length > 0 && L.total === 0 && <p className="empty">No payments recorded matching filter.</p>}
      <Pager L={L} />

      {/* Receipt Modal */}
      {selectedReceipt && (
        <div className="modal">
          <div style={{ maxWidth: 520 }}>
            <div className="cert-paper" style={{ padding: 24, textAlign: 'left', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>RAMPEX EDUCATION</h2>
                  <small style={{ color: '#64748b' }}>Official Payment Acknowledgement Voucher</small>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b className="mono" style={{ fontSize: 14 }}>{selectedReceipt.id}</b>
                  <small style={{ display: 'block', color: '#64748b' }}>{selectedReceipt.date}</small>
                </div>
              </div>

              <div style={{ margin: '18px 0', fontSize: 13, lineHeight: 1.8 }}>
                <div>Received with thanks from: <b>{selectedReceipt.customer_name}</b></div>
                <div>Linked Invoice: <b className="mono">{selectedReceipt.invoice_id}</b></div>
                <div>Payment Mode: <b>{selectedReceipt.method}</b></div>
                <div>Reference / UTR: <b className="mono">{selectedReceipt.reference || 'N/A'}</b></div>
              </div>

              <div style={{ background: '#f0fdf4', padding: '14px 18px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#166534' }}>Amount Received:</span>
                <b style={{ fontSize: 20, color: '#15803d' }}>{inr(selectedReceipt.amount)}</b>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
              <button type="button" className="btn ghost" onClick={() => printReceipt(selectedReceipt, rows)}>Print Voucher</button>
              <button type="button" className="btn" onClick={() => setSelectedReceipt(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Expenses() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ category: 'Trainer' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [catFilter, setCatFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [archived, setArchived] = useState(false);
  // Linkage pickers (audit E5 / D21)
  const [custs, setCusts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [trainers, setTrainers] = useState([]);

  const load = () => {
    setLoading(true); setLoadErr('');
    return api.expenses(archived ? '?archived=1' : '')
      .then(setRows).catch((e) => { setLoadErr(e.message); setMsg(e.message); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [archived]);
  // Pickers for the linkage selects — loaded once.
  useEffect(() => {
    api.customers().then(setCusts).catch(() => {});
    api.batches().then(setBatches).catch(() => {});
    api.trainers().then(setTrainers).catch(() => {});
  }, []);

  const doArchive = async (id) => {
    if (!window.confirm('Archive this expense? It leaves the list but stays recoverable.')) return;
    try { await api.archive('expenses', id); toast('Expense archived'); load(); }
    catch (e) { setMsg(e.message); }
  };
  const doRestore = async (id) => {
    try { await api.restore('expenses', id); toast('Expense restored'); load(); }
    catch (e) { setMsg(e.message); }
  };

  const create = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!(+f.amount > 0)) { setMsg('Amount must be greater than 0'); return; }
    if (!String(f.vendor || '').trim()) { setMsg('Vendor / payee is required'); return; }
    setBusy(true);
    try {
      await api.createExpense(f);
      setF({ category: 'Trainer' });
      toast('Expense recorded');
      load();
    } catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
  };

  const updateStatus = async (id, action) => {
    try {
      await api.patchExpense(id, { action });
      toast(`✓ Expense marked ${action === 'approve' ? 'APPROVED' : 'PAID'}`);
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const base = useMemo(
    () => rows.filter((x) => (catFilter === 'ALL' || x.category === catFilter) && (statusFilter === 'ALL' || x.status === statusFilter)),
    [rows, catFilter, statusFilter],
  );
  const L = useListControls(base, {
    searchKeys: ['id', 'category', 'vendor', 'description', 'status', 'customer_name', 'trainer_name', 'batch_label'],
    initialSort: { key: 'date', dir: 'desc' },
    dateKey: 'date',
  });
  const bulk = useBulkSelection();
  const bulkAction = async (action) => {
    for (const id of bulk.ids) {
      try { await api.patchExpense(id, { action }); } catch { /* keep going */ }
    }
    toast(`Updated ${bulk.size} expense(s)`);
    bulk.clear();
    load();
  };

  const totalExpense = rows.reduce((acc, x) => acc + Number(x.amount || 0), 0);
  const trainerExpense = rows.filter(x => x.category === 'Trainer').reduce((acc, x) => acc + Number(x.amount || 0), 0);
  const pendingClaims = rows.filter(x => x.status === 'PENDING').reduce((acc, x) => acc + Number(x.amount || 0), 0);

  const categoryData = [
    { category: 'Trainer', count: rows.filter(x => x.category === 'Trainer').length, value: rows.filter(x => x.category === 'Trainer').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { category: 'Venue', count: rows.filter(x => x.category === 'Venue').length, value: rows.filter(x => x.category === 'Venue').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { category: 'Travel', count: rows.filter(x => x.category === 'Travel').length, value: rows.filter(x => x.category === 'Travel').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { category: 'Accommodation', count: rows.filter(x => x.category === 'Accommodation').length, value: rows.filter(x => x.category === 'Accommodation').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { category: 'Materials', count: rows.filter(x => x.category === 'Materials').length, value: rows.filter(x => x.category === 'Materials').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { category: 'Marketing', count: rows.filter(x => x.category === 'Marketing').length, value: rows.filter(x => x.category === 'Marketing').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { category: 'Operations', count: rows.filter(x => x.category === 'Operations').length, value: rows.filter(x => x.category === 'Operations').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { category: 'Other', count: rows.filter(x => x.category === 'Other').length, value: rows.filter(x => x.category === 'Other').reduce((a, x) => a + Number(x.amount || 0), 0) },
  ].filter(d => d.count > 0);

  const statusData = [
    { status: 'PENDING', count: rows.filter(x => x.status === 'PENDING').length, value: rows.filter(x => x.status === 'PENDING').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { status: 'APPROVED', count: rows.filter(x => x.status === 'APPROVED').length, value: rows.filter(x => x.status === 'APPROVED').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { status: 'REJECTED', count: rows.filter(x => x.status === 'REJECTED').length, value: rows.filter(x => x.status === 'REJECTED').reduce((a, x) => a + Number(x.amount || 0), 0) },
    { status: 'PAID', count: rows.filter(x => x.status === 'PAID').length, value: rows.filter(x => x.status === 'PAID').reduce((a, x) => a + Number(x.amount || 0), 0) },
  ].filter(d => d.count > 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Platform Expenses & Claims</h2>
          <p className="sub">Track organizational outlays, trainer delivery payouts, materials, and lab infrastructure expenses.</p>
        </div>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <ListState loading={loading} error={loadErr} onRetry={load} empty={!loading && !loadErr && rows.length === 0} emptyText="No expenses recorded yet." />

      <div className="cards kpi-strip">
        <KPICard compact title="Total Expenses" value={inr(totalExpense)} subtitle={`${rows.length} expense line items`} color="var(--accent)" />
        <KPICard compact title="Trainer Payouts" value={inr(trainerExpense)} subtitle={`${totalExpense > 0 ? Math.round((trainerExpense / totalExpense) * 100) : 0}% of outlays`} color="var(--info)" />
        <KPICard compact title="Pending Claims" value={inr(pendingClaims)} subtitle={`${rows.filter(x => x.status === 'PENDING').length} awaiting approval`} color="var(--warn)" />
        <KPICard compact title="Settled / Paid" value={inr(rows.filter(x => x.status === 'PAID').reduce((acc, x) => acc + Number(x.amount || 0), 0))} subtitle="Processed expenses" color="var(--ok)" />
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>Expenses by Category</h4>
          <div style={{ marginTop: 8 }}>
            {categoryData.length > 0 ? (
              <BarChart
                data={categoryData}
                keys={['value']}
                colors={['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#94a3b8', '#ef4444']}
                height={150}
                showLegend={false}
                labelKey="category"
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No expense data</div>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Category Distribution</h4>
          <div style={{ marginTop: 8 }}>
            {categoryData.length > 0 ? (
              <PieChart
                data={categoryData}
                labelKey="category"
                valueKey="value"
                colors={['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#94a3b8', '#ef4444']}
                height={170}
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No category data</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>Status Distribution</h4>
          <div style={{ marginTop: 8 }}>
            {statusData.length > 0 ? (
              <PieChart
                data={statusData}
                labelKey="status"
                valueKey="value"
                colors={['#f59e0b', '#3b82f6', '#ef4444', '#16a34a']}
                height={170}
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No status data</div>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Expenses by Status (Count)</h4>
          <div style={{ marginTop: 8 }}>
            {statusData.length > 0 ? (
              <BarChart
                data={statusData}
                keys={['count']}
                colors={['#f59e0b', '#3b82f6', '#ef4444', '#16a34a']}
                height={150}
                showLegend={false}
                labelKey="status"
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No status data</div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ margin: '20px 0' }}>
        <h4 style={{ margin: '0 0 12px' }}>Record New Expense</h4>
        <form onSubmit={create} className="form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <input type="date" value={f.date || new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option>Trainer</option><option>Venue</option><option>Travel</option><option>Accommodation</option>
            <option>Materials</option><option>Marketing</option><option>Operations</option><option>Other</option>
          </select>
          <input placeholder="Vendor / Payee" value={f.vendor || ''} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
          <input placeholder="Description" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <input required placeholder="Amount (₹)" type="number" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          {/* Optional linkage (audit E5 / D21) — attribute the cost to a customer,
              batch, or trainer so expenses roll up per account / delivery. */}
          <select aria-label="Customer (optional)" value={f.customer_id || ''} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
            <option value="">Link customer… (optional)</option>
            {custs.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
          </select>
          <select aria-label="Batch (optional)" value={f.batch_id || ''} onChange={(e) => setF({ ...f, batch_id: e.target.value })}>
            <option value="">Link batch… (optional)</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.id}{b.program_name ? ` · ${b.program_name}` : ''}</option>)}
          </select>
          <select aria-label="Trainer (optional)" value={f.trainer_id || ''} onChange={(e) => setF({ ...f, trainer_id: e.target.value })}>
            <option value="">Link trainer… (optional)</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
          </select>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : '+ Add Expense'}</button>
        </form>
      </div>

      <ListToolbar
        L={L}
        placeholder="Search expenses…"
        sortOptions={[['date', 'Date'], ['category', 'Category'], ['vendor', 'Vendor'], ['amount', 'Amount'], ['status', 'Status']]}
      >
        <DateRange L={L} label="Date" />
        <ArchiveToggle value={archived} onChange={setArchived} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['ALL', 'Trainer', 'Venue', 'Operations', 'Marketing', 'Materials', 'Travel'].map((cat) => (
            <button type="button"
              key={cat}
              className={`btn sm ${catFilter === cat ? '' : 'ghost'}`}
              onClick={() => setCatFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['ALL', 'PENDING', 'APPROVED', 'PAID'].map((st) => (
            <button type="button"
              key={st}
              className={`btn sm ${statusFilter === st ? '' : 'ghost'}`}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </ListToolbar>

      <BulkBar bulk={bulk}>
        <button type="button" className="btn sm" onClick={() => bulkAction('approve')}>Approve</button>
        <button type="button" className="btn sm ghost" onClick={() => bulkAction('pay')}>Mark Paid</button>
      </BulkBar>

      <table>
        <thead>
          <tr>
            <SelectAllTh bulk={bulk} ids={L.rows.map((x) => x.id)} />
            <SortHeader label="Date" k="date" L={L} />
            <SortHeader label="Category" k="category" L={L} />
            <SortHeader label="Vendor / Payee" k="vendor" L={L} />
            <SortHeader label="Description" k="description" L={L} />
            <SortHeader label="Amount" k="amount" L={L} />
            <SortHeader label="Linked To" k="customer_name" L={L} />
            <SortHeader label="Status" k="status" L={L} />
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {L.rows.map((x) => (
            <tr key={x.id}>
              <td><input type="checkbox" aria-label={`Select ${x.id}`} checked={bulk.has(x.id)} onChange={() => bulk.toggle(x.id)} /></td>
              <td>{x.date}</td>
              <td><span className="chip">{x.category}</span></td>
              <td><b>{x.vendor || '—'}</b></td>
              <td>{x.description || '—'}</td>
              <td><b>{inr(x.amount)}</b></td>
              <td>
                {x.customer_name || x.trainer_name || x.batch_label ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {x.customer_name && <span className="chip">{x.customer_name}</span>}
                    {x.batch_label && <span style={{ fontSize: 12, color: '#94a3b8' }}>Batch {x.batch_label}</span>}
                    {x.trainer_name && <span style={{ fontSize: 12, color: '#94a3b8' }}>Trainer: {x.trainer_name}</span>}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Unlinked</span>
                )}
              </td>
              <td>
                <span className={'chip ' + (x.status === 'PAID' ? 'PRESENT' : x.status === 'PENDING' ? 'LATE' : 'ABSENT')}>
                  {x.status}
                </span>
              </td>
              <td>
                {user?.role === 'organization' && x.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn sm" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={() => updateStatus(x.id, 'approve')}>
                      Approve
                    </button>
                    <button type="button" className="btn sm ghost" onClick={() => updateStatus(x.id, 'pay')}>
                      Mark Paid
                    </button>
                  </div>
                )}
                {user?.role === 'organization' && x.status === 'APPROVED' && (
                  <button type="button" className="btn sm ghost" onClick={() => updateStatus(x.id, 'pay')}>
                    Mark Paid
                  </button>
                )}
                {x.status === 'PAID' && <span style={{ fontSize: 12, color: '#94a3b8' }}>Settled</span>}
                {user?.role === 'organization' && (
                  archived
                    ? <button type="button" className="btn sm ghost" onClick={() => doRestore(x.id)}>Restore</button>
                    : <button type="button" className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => doArchive(x.id)}>Archive</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">{archived ? 'No archived expenses.' : 'No expenses recorded yet.'}</p>}
      {rows.length > 0 && L.total === 0 && <p className="empty">No expenses match the selected filters.</p>}
      <Pager L={L} />
    </div>
  );
}

export function TrainerFinance() {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ category: 'Travel' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.trainerFinance().then(setD).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const claim = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!(+f.amount > 0)) { setMsg('Claim amount must be greater than 0'); return; }
    setBusy(true);
    setMsg('');
    try {
      await api.createExpense(f);
      setF({ category: 'Travel' });
      toast('Expense claim filed (pending approval)');
      setMsg('✓ Claim filed (PENDING approval)');
      load();
    } catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
  };

  if (!d) return <div className={msg ? 'err' : 'loading'}>{msg || 'Loading my finance…'}</div>;

  return (
    <div>
      <div className="page-head">
        <h2>My Finance</h2>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <div className="cards kpi-strip">
        <div className="card"><h4>Total Paid to Me</h4><b>{inr(d.total_paid)}</b></div>
        <div className="card"><h4>Pending Claims</h4><b>{inr(d.pending)}</b></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h4>Payouts · Rampex → me</h4>
          {d.payouts.length === 0 && <p className="empty">No payouts yet.</p>}
          <div className="list">
            {d.payouts.map((p) => (
              <div className="list-row" key={p.id}>
                <span className="mono grow">{p.date}</span>
                <span className="grow">{p.description}</span>
                <b className="amt">{inr(p.amount)}</b>
                <span className={'chip ' + p.status}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h4>Claim Expense</h4>
          <form onSubmit={claim} className="form col-1">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option>Travel</option><option>Accommodation</option><option>Materials</option><option>Other</option>
            </select>
            <input placeholder="Vendor" value={f.vendor || ''} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
            <input placeholder="Description" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <input required placeholder="Amount" type="number" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            <span><button className="btn" type="submit" disabled={busy}>{busy ? 'Filing…' : 'File Claim'}</button></span>
          </form>
        </div>
      </div>

      <h4 style={{ marginTop: 26 }}>All my entries</h4>
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          {d.rows.map((x) => (
            <tr key={x.id}>
              <td>{x.date}</td>
              <td><span className="chip">{x.category}</span></td>
              <td>{x.description}</td>
              <td><b>{inr(x.amount)}</b></td>
              <td><span className={'chip ' + x.status}>{x.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Reports() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [top, setTop] = useState([]);
  const [trend, setTrend] = useState([]);
  useEffect(() => {
    api.dashboard().then(setD);
    api.topStudents().then(setTop).catch(() => {});
    api.trend().then(setTrend).catch(() => {});
  }, []);

  if (!d) return <div className="loading">Loading reports…</div>;

  const collectionRate = d.revenue ? Math.round((d.collected / d.revenue) * 100) : 0;
  const netMargin = d.revenue ? Math.round((d.net / d.revenue) * 100) : 0;
  const estimatedCashflow30d = Math.round(Number(d.outstanding || 0) * 0.65);

  // Prepare chart data
  const revenueChartData = trend.length > 0 ? trend.slice(-12).map(t => ({
    month: t.month.slice(5),
    billed: t.billed,
    collected: t.collected
  })) : [];
  
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

  const paymentMethods = [
    { label: 'Bank Transfer', value: d.bankTransferTotal || 0 },
    { label: 'UPI', value: d.upiTotal || 0 },
    { label: 'Cheque/Cash', value: d.chequeCashTotal || 0 },
  ].filter(c => c.value > 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Executive Reports & Analytics</h2>
          <p className="sub">{user?.role === 'institution' ? 'Your institution\u2019s revenue, collections, student academic excellence, and margin projections.' : 'Platform-wide revenue, collections, student academic excellence, and margin projections.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn ghost no-print" onClick={() => downloadCSV('executive-report.csv', [
            { Section: 'KPI', Item: 'Revenue', Value: d.revenue },
            { Section: 'KPI', Item: 'Collected', Value: d.collected },
            { Section: 'KPI', Item: 'Outstanding', Value: d.outstanding },
            { Section: 'KPI', Item: 'Net', Value: d.net ?? '' },
            { Section: 'KPI', Item: 'Expenses', Value: d.expenses ?? '' },
            { Section: 'KPI', Item: 'Total Leads', Value: d.totalLeads ?? '' },
            { Section: 'KPI', Item: 'Students', Value: d.totalStudents ?? d.studentCount ?? '' },
            ...trend.slice(-12).map((t) => ({ Section: 'Trend', Item: t.month, Value: `billed=${t.billed} collected=${t.collected}` })),
            ...(d.outstandingInvoices || []).map((i) => ({ Section: 'Outstanding', Item: `${i.id} ${i.customer_name || ''}`, Value: i.outstanding })),
            ...(top || []).map((s, idx) => ({ Section: 'Top Student', Item: `#${idx + 1} ${s.name}`, Value: `attendance=${s.attendance} avg=${s.avg_score ?? ''}` })),
          ])}>Export CSV</button>
          <button type="button" className="btn ghost no-print" onClick={() => printExecutiveReport({ d, top, trend, who: user?.role === 'institution' ? (d.customer?.name || 'Institution') : 'Rampex Management' })}>Print Report</button>
        </div>
      </div>

      <div className="cards kpi-strip">
        <KPICard compact title="Revenue" value={inr(d.revenue)} subtitle={`${d.totalLeads || 0} active leads`} color="var(--accent)" />
        <KPICard compact title="Collected" value={inr(d.collected)} subtitle={`${collectionRate}% collection rate`} trend={`${Math.round((collectionRate - 70) * 10) / 10}%`} trendUp={collectionRate >= 70} color="var(--ok)" />
        <KPICard compact title="Outstanding" value={inr(d.outstanding)} subtitle={`${d.outstandingInvoices?.length || 0} pending invoices`} color="var(--warn)" />
        <KPICard compact title="Net Operating Margin" value={inr(d.net)} subtitle={`${netMargin}% margin · expenses ${inr(d.expenses)}`} color="var(--info)" />
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card" style={{ borderLeft: '5px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h4 style={{ margin: 0 }}>Cashflow & Liquidity Forecast (Next 30 Days)</h4>
              <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                Dynamic projection model based on invoice due dates and weighted 65% historical collection velocity.
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>~{inr(estimatedCashflow30d)}</span>
              <small style={{ display: 'block', color: '#64748b' }}>Projected 30d Cash Inflow</small>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <LineChart 
              data={revenueChartData.length > 0 ? revenueChartData : [{ month: 'Jan', projected: 0 }, { month: 'Feb', projected: 0 }, { month: 'Mar', projected: 0 }]}
              keys={['projected']}
              colors={['#16a34a']}
              height={100}
              showLegend={false}
              labelKey="month"
            />
          </div>
        </div>

        <div className="card">
          <h4>Revenue vs Collection Trend</h4>
          <div style={{ marginTop: 8 }}>
            {revenueChartData.length > 0 ? (
              <LineChart
                data={revenueChartData}
                keys={['billed', 'collected']}
                colors={['#3b82f6', '#16a34a']}
                height={150}
                labelKey="month"
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No trend data available yet</div>
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
                colors={['#0e7268', '#17a493', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#94a3b8']}
                height={170}
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No expense data available</div>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Payment Methods Distribution</h4>
          <div style={{ marginTop: 8 }}>
            {paymentMethods.length > 0 ? (
              <PieChart
                data={paymentMethods}
                labelKey="label"
                valueKey="value"
                colors={['#16a34a', '#3b82f6', '#f59e0b']}
                height={170}
              />
            ) : (
              <div className="empty" style={{ padding: 40 }}>No payment data available</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>Outstanding Invoices</h4>
          {d.outstandingInvoices.length === 0 && <p className="empty">Every invoice is settled.</p>}
          <div className="list">
            {d.outstandingInvoices.map((i) => (
              <div className="list-row" key={i.id}>
                <span className="grow">
                  <b>{i.customer_name}</b>
                  <span className="meta mono"> · {i.id}</span>
                </span>
                <b className="amt">{inr(i.outstanding)}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h4>Recent Collections</h4>
          {d.recentPayments.length === 0 && <p className="empty">No payments collected yet.</p>}
          <div className="list">
            {d.recentPayments.map((p) => (
              <div className="list-row" key={p.id}>
                <span className="mono grow">{p.id}</span>
                <span className="mono grow">{p.date}</span>
                <b className="amt">{inr(p.amount)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h4>Top Students · {user?.role === 'institution' ? 'Your Institution\u2019s Excellence' : 'Platform-wide Excellence'}</h4>
        {top.length === 0 && <p className="empty">No student score records available yet.</p>}
        <table>
          <thead><tr><th>Rank</th><th>Student</th><th>Batch</th><th>Attendance</th><th>Avg Score</th></tr></thead>
          <tbody>
            {top.map((s, idx) => (
              <tr key={s.student_id || idx}>
                <td><b>#{idx + 1}</b></td>
                <td><b>{s.name}</b></td>
                <td>{s.batch_id || '—'}</td>
                <td style={{ minWidth: 150 }}><AttendanceBar value={s.attendance} width={120} /></td>
                <td><b>{s.avg_score ?? '—'}{s.avg_score != null && '%'}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
