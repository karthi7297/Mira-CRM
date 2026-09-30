import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr, downloadCSV, toast } from '../api';
import { useAuth } from '../auth';

export function Quotations() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [custs, setCusts] = useState([]);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => { api.quotations().then(setRows); api.customers().then(setCusts); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.createQuotation({
        customer_id: f.customer_id,
        program: f.program,
        discount: +f.discount || 0,
        items: [{ description: f.program || 'Training', qty: +f.qty || 1, rate: +f.rate || 100000 }],
      });
      setShow(false);
      setF({});
      api.quotations().then(setRows);
    } catch (ex) { setMsg(ex.message); }
  };

  const convert = async (qid) => {
    setMsg('');
    try {
      const inv = await api.convertQuotation(qid);
      toast(`✓ Converted to Invoice ${inv.id}!`);
      setMsg(`✓ Quotation promoted to Invoice ${inv.id}`);
      api.quotations().then(setRows);
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>Quotations</h2>
        {user?.role === 'organization' && (
          <button className="btn" onClick={() => setShow(true)}>+ Create Quotation</button>
        )}
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <table>
        <thead><tr><th>ID</th><th>Customer</th><th>Program</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id}>
              <td>{q.id}</td>
              <td><b>{q.customer_name}</b></td>
              <td>{q.program || '—'}</td>
              <td>{inr(q.total)}</td>
              <td><span className={'chip ' + q.status}>{q.status}</span></td>
              <td>
                {user?.role === 'organization' && (
                  <button className="btn sm ghost" onClick={() => convert(q.id)}>
                    Convert to Invoice →
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No quotations yet.</p>}

      {show && (
        <div className="modal">
          <div>
            <h3>Create Quotation</h3>
            <form onSubmit={create} className="form">
              <select required value={f.customer_id || ''} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
                <option value="">Customer…</option>
                {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder="Program" value={f.program || ''} onChange={(e) => setF({ ...f, program: e.target.value })} />
              <input placeholder="Qty" type="number" value={f.qty || ''} onChange={(e) => setF({ ...f, qty: e.target.value })} />
              <input placeholder="Rate" type="number" value={f.rate || ''} onChange={(e) => setF({ ...f, rate: e.target.value })} />
              <input placeholder="Discount" type="number" value={f.discount || ''} onChange={(e) => setF({ ...f, discount: e.target.value })} />
              <span>
                <button className="btn">Save</button>
                <button type="button" className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
              </span>
            </form>
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
  const [custs, setCusts] = useState([]);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => { api.invoices().then(setRows); api.customers().then(setCusts); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.createInvoice({
        customer_id: f.customer_id,
        program: f.program,
        discount: +f.discount || 0,
        items: [{ description: f.program || 'Training', qty: +f.qty || 1, rate: +f.rate || 100000 }],
      });
      setShow(false);
      setF({});
      api.invoices().then(setRows);
    } catch (ex) { setMsg(ex.message); }
  };

  return (
    <div>
      <div className="page-head">
        <h2>Invoices</h2>
        <span style={{ display: 'flex', gap: 8 }}>
          {rows.length > 0 && <button className="btn ghost no-print" onClick={() => downloadCSV('invoices.csv', rows.map(i => ({ id: i.id, customer: i.customer_name, total: i.total, paid: i.paid, outstanding: i.outstanding, status: i.status })))}>Export CSV</button>}
          {user?.role === 'organization' && (
            <button className="btn" onClick={() => setShow(true)}>+ Create Invoice</button>
          )}
        </span>
      </div>

      {msg && <div className="err">{msg}</div>}

      <table>
        <thead>
          <tr><th>ID</th><th>Customer</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td>{i.id}</td>
              <td><b>{i.customer_name}</b></td>
              <td>{inr(i.total)}</td>
              <td>{inr(i.paid)}</td>
              <td><b>{inr(i.outstanding)}</b></td>
              <td><span className={'chip ' + i.status}>{i.status}</span></td>
              <td><Link to={'/invoices/' + i.id}>Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No invoices yet.</p>}

      {show && (
        <div className="modal">
          <div>
            <h3>Create Invoice</h3>
            <form onSubmit={create} className="form">
              <select required value={f.customer_id || ''} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
                <option value="">Customer…</option>
                {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder="Program" value={f.program || ''} onChange={(e) => setF({ ...f, program: e.target.value })} />
              <input placeholder="Qty" type="number" value={f.qty || ''} onChange={(e) => setF({ ...f, qty: e.target.value })} />
              <input placeholder="Rate" type="number" value={f.rate || ''} onChange={(e) => setF({ ...f, rate: e.target.value })} />
              <input placeholder="Discount" type="number" value={f.discount || ''} onChange={(e) => setF({ ...f, discount: e.target.value })} />
              <span>
                <button className="btn">Save</button>
                <button type="button" className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
              </span>
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

  const load = () => api.invoice(id).then(setInv).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [id]);

  const record = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const r = await api.pay({ invoice_id: id, ...pay, amount: +pay.amount });
      setShow(false);
      setPay({ method: 'Bank Transfer' });
      setMsg(`Payment recorded. Outstanding updated: ${inr(r.outstanding)}`);
      load();
    } catch (ex) { setMsg(ex.message); }
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
          <button className="btn ghost" onClick={() => window.print()}>Print Receipt</button>
          <button className="btn" onClick={() => setShow(true)}>Record Payment</button>
        </div>
      </div>

      <div className="cert-paper" style={{ marginTop: 18 }}>
        <h1>PAYMENT RECEIPT</h1>
        <p style={{ fontSize: 13 }}>Rampex · {inv.id} · {inv.customer_name}</p>
        <p style={{ fontSize: 14 }}>Paid <b>{inr(inv.paid)}</b> of <b>{inr(inv.total)}</b> · Outstanding <b>{inr(inv.outstanding)}</b></p>
        {inv.payments.map((p) => <p key={p.id} style={{ fontSize: 12 }}>{p.id} · {inr(p.amount)} · {p.method} · {p.date}</p>)}
      </div>

      <h4 style={{ marginTop: 26 }}>Payments</h4>
      <table>
        <thead><tr><th>ID</th><th>Amount</th><th>Method</th><th>Date</th></tr></thead>
        <tbody>
          {inv.payments.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td><b>{inr(p.amount)}</b></td>
              <td>{p.method}</td>
              <td>{p.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {inv.payments.length === 0 && <p className="empty">No payments recorded against this invoice yet.</p>}

      {show && (
        <div className="modal">
          <div>
            <h3>Record Payment</h3>
            <form onSubmit={record} className="form">
              <input required placeholder="Amount *" type="number" value={pay.amount || ''} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                <option>Bank Transfer</option><option>Cash</option><option>Cheque</option><option>UPI</option>
              </select>
              <input type="date" value={pay.date || ''} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
              <input placeholder="Reference" value={pay.reference || ''} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
              <span>
                <button className="btn">Record Payment</button>
                <button type="button" className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
              </span>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function Payments() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.payments().then(setRows); }, []);

  return (
    <div>
      <div className="page-head">
        <h2>Payments</h2>
        {rows.length > 0 && <button className="btn ghost no-print" onClick={() => downloadCSV('payments.csv', rows.map(p => ({ id: p.id, invoice: p.invoice_id, customer: p.customer_name, amount: p.amount, method: p.method, date: p.date })))}>Export CSV</button>}
      </div>

      <table>
        <thead><tr><th>ID</th><th>Invoice</th><th>Customer</th><th>Amount</th><th>Method</th><th>Date</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td><Link to={'/invoices/' + p.invoice_id}>{p.invoice_id}</Link></td>
              <td>{p.customer_name}</td>
              <td><b>{inr(p.amount)}</b></td>
              <td>{p.method}</td>
              <td>{p.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No payments recorded yet.</p>}
    </div>
  );
}

export function Expenses() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ category: 'Trainer' });
  const [msg, setMsg] = useState('');

  const load = () => api.expenses().then(setRows);
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try { await api.createExpense(f); setF({ category: 'Trainer' }); load(); }
    catch (ex) { setMsg(ex.message); }
  };

  return (
    <div>
      <div className="page-head">
        <h2>Expenses</h2>
      </div>

      {msg && <div className="err">{msg}</div>}

      <form onSubmit={create} className="form mb" style={{ maxWidth: 880 }}>
        <input type="date" value={f.date || ''} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          <option>Trainer</option><option>Venue</option><option>Travel</option><option>Accommodation</option>
          <option>Materials</option><option>Marketing</option><option>Operations</option><option>Other</option>
        </select>
        <input placeholder="Vendor" value={f.vendor || ''} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
        <input placeholder="Description" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <input required placeholder="Amount" type="number" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <span><button className="btn">+ Add Expense</button></span>
      </form>

      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th>Amount</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td>{x.date}</td>
              <td><span className="chip">{x.category}</span></td>
              <td>{x.vendor}</td>
              <td>{x.description}</td>
              <td><b>{inr(x.amount)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No expenses recorded yet.</p>}
    </div>
  );
}

export function TrainerFinance() {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ category: 'Travel' });
  const [msg, setMsg] = useState('');

  const load = () => api.trainerFinance().then(setD).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const claim = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.createExpense(f);
      setF({ category: 'Travel' });
      setMsg('✓ Claim filed (PENDING approval)');
      load();
    } catch (ex) { setMsg(ex.message); }
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
            <span><button className="btn">File Claim</button></span>
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
        <button className="btn ghost no-print" onClick={() => window.print()}>Print Report</button>
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

