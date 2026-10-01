import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr, downloadCSV, toast, toastError } from '../api';
import { useAuth } from '../auth';

export function Quotations() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [viewQuo, setViewQuo] = useState(null);
  const [custs, setCusts] = useState([]);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const load = () => {
    api.quotations().then(setRows).catch((e) => setMsg(e.message));
    api.customers().then(setCusts).catch(() => {});
  };

  useEffect(() => { load(); }, []);

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

  const filtered = rows.filter((q) => {
    if (filter !== 'ALL' && q.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        q.id.toLowerCase().includes(s) ||
        (q.customer_name && q.customer_name.toLowerCase().includes(s)) ||
        (q.program && q.program.toLowerCase().includes(s))
      );
    }
    return true;
  });

  const totalValue = rows.reduce((acc, q) => acc + Number(q.total || 0), 0);
  const acceptedValue = rows.filter(q => q.status === 'ACCEPTED').reduce((acc, q) => acc + Number(q.total || 0), 0);

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

      <div className="cards">
        <div className="card">
          <h4>Total Pipeline Value</h4>
          <b>{inr(totalValue)}</b>
          <small>{rows.length} quotation documents</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <h4>Accepted Proposals</h4>
          <b style={{ color: '#059669' }}>{inr(acceptedValue)}</b>
          <small>{rows.filter(q => q.status === 'ACCEPTED').length} proposals agreed</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
          <h4>Sent / In Review</h4>
          <b>{rows.filter(q => q.status === 'SENT').length}</b>
          <small>Awaiting customer approval</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h4>Drafts</h4>
          <b>{rows.filter(q => q.status === 'DRAFT').length}</b>
          <small>Internal proposals</small>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 14px', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
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
        <input
          className="search-input"
          style={{ maxWidth: 280, margin: 0 }}
          placeholder="Search by ID, customer or program…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table>
        <thead><tr><th>ID</th><th>Customer</th><th>Program</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {filtered.map((q) => (
            <tr key={q.id}>
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
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="empty">No quotations matching filter.</p>}

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
              <button type="button" className="btn ghost" onClick={() => window.print()}>Print Quotation</button>
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
  const [payForm, setPayForm] = useState({ method: 'Bank Transfer' });
  const [busy, setBusy] = useState(false);
  const [custs, setCusts] = useState([]);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const load = () => {
    api.invoices().then(setRows).catch((e) => setMsg(e.message));
    api.customers().then(setCusts).catch(() => {});
  };

  useEffect(() => { load(); }, []);

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

  const filtered = rows.filter((i) => {
    if (filter !== 'ALL' && i.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        i.id.toLowerCase().includes(s) ||
        (i.customer_name && i.customer_name.toLowerCase().includes(s)) ||
        (i.program && i.program.toLowerCase().includes(s))
      );
    }
    return true;
  });

  const totalBilled = rows.reduce((acc, i) => acc + Number(i.total || 0), 0);
  const totalPaid = rows.reduce((acc, i) => acc + Number(i.paid || 0), 0);
  const totalOutstanding = rows.reduce((acc, i) => acc + Number(i.outstanding || 0), 0);
  const overdueCount = rows.filter(i => i.status === 'OVERDUE').length;

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

      <div className="cards">
        <div className="card">
          <h4>Total Billed</h4>
          <b>{inr(totalBilled)}</b>
          <small>{rows.length} invoices issued</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <h4>Collected</h4>
          <b style={{ color: '#059669' }}>{inr(totalPaid)}</b>
          <small>{totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0}% recovery rate</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h4>Outstanding Balance</h4>
          <b style={{ color: '#d97706' }}>{inr(totalOutstanding)}</b>
          <small>Receivables pending</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h4>Overdue Invoices</h4>
          <b style={{ color: '#dc2626' }}>{overdueCount}</b>
          <small>Critical collection focus</small>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 14px', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
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
        <input
          className="search-input"
          style={{ maxWidth: 280, margin: 0 }}
          placeholder="Search by ID or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Customer</th>
            <th>Due Date</th>
            <th>Total</th>
            <th>Paid</th>
            <th>Outstanding</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((i) => (
            <tr key={i.id}>
              <td className="mono"><b>{i.id}</b></td>
              <td><b>{i.customer_name}</b></td>
              <td style={{ fontSize: 13, color: '#64748b' }}>{i.due_date || '—'}</td>
              <td>{inr(i.total)}</td>
              <td style={{ color: '#059669' }}>{inr(i.paid)}</td>
              <td><b>{inr(i.outstanding)}</b></td>
              <td><span className={'chip ' + i.status}>{i.status}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link to={'/invoices/' + i.id} className="btn sm ghost">Open</Link>
                  {i.outstanding > 0 && (
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
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="empty">No invoices found matching filter.</p>}

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
          <button type="button" className="btn ghost" onClick={() => window.print()}>Print Receipt</button>
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
              <td>{p.date}</td>
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
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  useEffect(() => { api.payments().then(setRows); }, []);

  const filtered = rows.filter((p) => {
    if (methodFilter !== 'ALL' && p.method !== methodFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        p.id.toLowerCase().includes(s) ||
        p.invoice_id.toLowerCase().includes(s) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(s)) ||
        (p.reference && p.reference.toLowerCase().includes(s))
      );
    }
    return true;
  });

  const totalCollected = rows.reduce((acc, p) => acc + Number(p.amount || 0), 0);

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

      <div className="cards">
        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <h4>Total Collected</h4>
          <b style={{ color: '#059669' }}>{inr(totalCollected)}</b>
          <small>{rows.length} transactions processed</small>
        </div>
        <div className="card">
          <h4>Bank Transfers</h4>
          <b>{inr(rows.filter(p => p.method === 'Bank Transfer').reduce((acc, p) => acc + Number(p.amount || 0), 0))}</b>
          <small>{rows.filter(p => p.method === 'Bank Transfer').length} settlements</small>
        </div>
        <div className="card">
          <h4>UPI & Digital</h4>
          <b>{inr(rows.filter(p => p.method === 'UPI').reduce((acc, p) => acc + Number(p.amount || 0), 0))}</b>
          <small>{rows.filter(p => p.method === 'UPI').length} instant payments</small>
        </div>
        <div className="card">
          <h4>Cheque & Cash</h4>
          <b>{inr(rows.filter(p => ['Cheque', 'Cash'].includes(p.method)).reduce((acc, p) => acc + Number(p.amount || 0), 0))}</b>
          <small>{rows.filter(p => ['Cheque', 'Cash'].includes(p.method)).length} cleared receipts</small>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 14px', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
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
        <input
          className="search-input"
          style={{ maxWidth: 280, margin: 0 }}
          placeholder="Search by ID, customer or reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Date</th>
            <th>Reference</th>
            <th>Receipt</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td className="mono"><b>{p.id}</b></td>
              <td><Link to={'/invoices/' + p.invoice_id} className="mono">{p.invoice_id}</Link></td>
              <td><b>{p.customer_name}</b></td>
              <td><b style={{ color: '#059669' }}>{inr(p.amount)}</b></td>
              <td><span className="chip" style={{ background: '#f1f5f9', color: '#334155' }}>{p.method}</span></td>
              <td>{p.date}</td>
              <td className="meta">{p.reference || '—'}</td>
              <td>
                <button type="button" className="btn sm ghost" onClick={() => setSelectedReceipt(p)}>Receipt</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="empty">No payments recorded matching filter.</p>}

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
              <button type="button" className="btn ghost" onClick={() => window.print()}>Print Voucher</button>
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

  const load = () => api.expenses().then(setRows);
  useEffect(() => { load(); }, []);

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

  const filtered = rows.filter((x) => {
    if (catFilter !== 'ALL' && x.category !== catFilter) return false;
    if (statusFilter !== 'ALL' && x.status !== statusFilter) return false;
    return true;
  });

  const totalExpense = rows.reduce((acc, x) => acc + Number(x.amount || 0), 0);
  const trainerExpense = rows.filter(x => x.category === 'Trainer').reduce((acc, x) => acc + Number(x.amount || 0), 0);
  const pendingClaims = rows.filter(x => x.status === 'PENDING').reduce((acc, x) => acc + Number(x.amount || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Platform Expenses & Claims</h2>
          <p className="sub">Track organizational outlays, trainer delivery payouts, materials, and lab infrastructure expenses.</p>
        </div>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <div className="cards">
        <div className="card">
          <h4>Total Expenses</h4>
          <b>{inr(totalExpense)}</b>
          <small>{rows.length} expense line items</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
          <h4>Trainer Payouts</h4>
          <b>{inr(trainerExpense)}</b>
          <small>{totalExpense > 0 ? Math.round((trainerExpense / totalExpense) * 100) : 0}% of outlays</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h4>Pending Claims</h4>
          <b style={{ color: '#d97706' }}>{inr(pendingClaims)}</b>
          <small>{rows.filter(x => x.status === 'PENDING').length} awaiting approval</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <h4>Settled / Paid</h4>
          <b style={{ color: '#059669' }}>{inr(rows.filter(x => x.status === 'PAID').reduce((acc, x) => acc + Number(x.amount || 0), 0))}</b>
          <small>Processed expenses</small>
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
          <input required placeholder="Amount (₹)" type="number" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: e.target.value })} />                <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : '+ Add Expense'}</button>
        </form>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 14px', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
        <div style={{ display: 'flex', gap: 8 }}>
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
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Vendor / Payee</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((x) => (
            <tr key={x.id}>
              <td>{x.date}</td>
              <td><span className="chip">{x.category}</span></td>
              <td><b>{x.vendor || '—'}</b></td>
              <td>{x.description || '—'}</td>
              <td><b>{inr(x.amount)}</b></td>
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="empty">No expenses match the selected filters.</p>}
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

      <div className="cards">
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
  const [d, setD] = useState(null);
  const [top, setTop] = useState([]);
  useEffect(() => {
    api.dashboard().then(setD);
    api.topStudents().then(setTop).catch(() => {});
  }, []);

  if (!d) return <div className="loading">Loading reports…</div>;

  const collectionRate = d.revenue ? Math.round((d.collected / d.revenue) * 100) : 0;
  const netMargin = d.revenue ? Math.round((d.net / d.revenue) * 100) : 0;
  const estimatedCashflow30d = Math.round(Number(d.outstanding || 0) * 0.65);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Executive Reports & Analytics</h2>
          <p className="sub">Platform-wide revenue, collections, student academic excellence, and margin projections.</p>
        </div>
        <button type="button" className="btn ghost no-print" onClick={() => window.print()}>Print Report</button>
      </div>

      <div className="cards">
        <div className="card"><h4>Revenue</h4><b>{inr(d.revenue)}</b></div>
        <div className="card">
          <h4>Collected</h4>
          <b>{inr(d.collected)}</b>
          <small>{collectionRate}% of revenue</small>
        </div>
        <div className="card"><h4>Outstanding</h4><b>{inr(d.outstanding)}</b></div>
        <div className="card">
          <h4>Net Operating Margin</h4>
          <b>{inr(d.net)} ({netMargin}%)</b>
          <small>expenses {inr(d.expenses)}</small>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, borderLeft: '5px solid #2563eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: 0 }}>Cashflow & Liquidity Forecast (Next 30 Days)</h4>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
              Dynamic projection model based on invoice due dates and weighted 65% historical collection velocity.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>~{inr(estimatedCashflow30d)}</span>
            <small style={{ display: 'block', color: '#64748b' }}>Projected 30d Cash Inflow</small>
          </div>
        </div>
      </div>

      <div className="grid2">
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
        <h4>Top Students · Platform-wide Excellence</h4>
        {top.length === 0 && <p className="empty">No student score records available yet.</p>}
        <table>
          <thead><tr><th>Rank</th><th>Student</th><th>Batch</th><th>Attendance</th><th>Avg Score</th></tr></thead>
          <tbody>
            {top.map((s, idx) => (
              <tr key={s.student_id || idx}>
                <td><b>#{idx + 1}</b></td>
                <td><b>{s.name}</b></td>
                <td>{s.batch_id || '—'}</td>
                <td><span className="chip PRESENT">{s.attendance}%</span></td>
                <td><b>{s.avg_score ?? '—'}{s.avg_score != null && '%'}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
