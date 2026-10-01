const db = require('./index');
const { docTotals } = require('../utils/money');

async function enrich() {
  console.log('[enrich] Starting mock data enrichment...');

  // 1. More Students
  const newStudents = [
    ['STU-009', null, 'Meera Raman', 'meera.r@abccollege.edu', '98400-00009', 'CUST-001'],
    ['STU-010', null, 'Suresh Varma', 'suresh.v@abccollege.edu', '98400-00010', 'CUST-001'],
    ['STU-011', null, 'Ananya Balan', 'ananya.b@abccollege.edu', '98400-00011', 'CUST-001'],
    ['STU-012', null, 'Gautam Chandran', 'gautam.c@abccollege.edu', '98400-00012', 'CUST-001'],
    ['STU-013', null, 'Karthik Sundar', 'karthik@xyz.edu', '98400-00013', 'CUST-002'],
    ['STU-014', null, 'Sneha Nambiar', 'sneha@xyz.edu', '98400-00014', 'CUST-002'],
    ['STU-015', null, 'Tanvi Menon', 'tanvi@xyz.edu', '98400-00015', 'CUST-002'],
    ['STU-016', null, 'Varun Kulkarni', 'varun@xyz.edu', '98400-00016', 'CUST-002'],
  ];

  for (const [id, uid, name, email, phone, custId] of newStudents) {
    const exists = await db.get('SELECT id FROM students WHERE id = ?', [id]);
    if (!exists) {
      await db.run(
        'INSERT INTO students (id, user_id, name, email, phone, customer_id) VALUES (?,?,?,?,?,?)',
        [id, uid, name, email, phone, custId]
      );
    }
  }

  // 2. Enrollments
  const newEnrollments = [
    ['STU-009', 'AIML-2026-01'],
    ['STU-010', 'AIML-2026-01'],
    ['STU-011', 'AIML-2026-01'],
    ['STU-012', 'AIML-2026-01'],
    ['STU-013', 'WEB-2026-02'],
    ['STU-014', 'WEB-2026-02'],
    ['STU-015', 'WEB-2026-02'],
    ['STU-016', 'WEB-2026-02'],
  ];
  for (const [sid, bid] of newEnrollments) {
    const exists = await db.get('SELECT student_id FROM enrollments WHERE student_id = ? AND batch_id = ?', [sid, bid]);
    if (!exists) {
      await db.run('INSERT INTO enrollments (student_id, batch_id) VALUES (?,?)', [sid, bid]);
    }
  }

  // 3. Multi-day Attendance for realistic percentages and detailed log
  const dates = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'];
  const allAimStudents = ['STU-001', 'STU-002', 'STU-003', 'STU-004', 'STU-005', 'STU-006', 'STU-009', 'STU-010', 'STU-011', 'STU-012'];
  const allWebStudents = ['STU-013', 'STU-014', 'STU-015', 'STU-016'];

  for (const date of dates) {
    for (const sid of allAimStudents) {
      const exists = await db.get('SELECT attendance_key FROM attendance WHERE student_id = ? AND batch_id = ? AND date = ?', [sid, 'AIML-2026-01', date]);
      if (!exists) {
        // Vary statuses realistically: STU-003 has low attendance, others high
        let status = 'PRESENT';
        if (sid === 'STU-003') status = (date === '2026-09-25' || date === '2026-09-28') ? 'PRESENT' : 'ABSENT';
        else if (sid === 'STU-005' && date === '2026-09-26') status = 'ABSENT';
        else if (sid === 'STU-010' && date === '2026-09-27') status = 'LATE';
        else if (sid === 'STU-002' && date === '2026-09-29') status = 'LATE';

        await db.run(
          'INSERT INTO attendance (student_id, batch_id, date, status) VALUES (?,?,?,?)',
          [sid, 'AIML-2026-01', date, status]
        );
      }
    }

    for (const sid of allWebStudents) {
      const exists = await db.get('SELECT attendance_key FROM attendance WHERE student_id = ? AND batch_id = ? AND date = ?', [sid, 'WEB-2026-02', date]);
      if (!exists) {
        let status = 'PRESENT';
        if (sid === 'STU-015' && date === '2026-09-27') status = 'ABSENT';
        if (sid === 'STU-016' && date === '2026-09-29') status = 'LATE';
        await db.run(
          'INSERT INTO attendance (student_id, batch_id, date, status) VALUES (?,?,?,?)',
          [sid, 'WEB-2026-02', date, status]
        );
      }
    }
  }

  // 4. More Quotations
  const extraQuotations = [
    {
      id: 'QUO-002',
      customer_id: 'CUST-002',
      program: 'Full Stack Development Bootcamp',
      items: [{ description: 'Full Stack MERN Bootcamp (60 seats)', qty: 60, rate: 4500 }],
      discount: 10000,
      status: 'SENT',
    },
    {
      id: 'QUO-003',
      customer_id: 'CUST-001',
      program: 'Cloud DevOps & Kubernetes Certification',
      items: [
        { description: 'Hands-on Cloud Lab Access (50 users)', qty: 50, rate: 4000 },
        { description: 'Docker & Kubernetes Mentorship', qty: 1, rate: 50000 },
      ],
      discount: 25000,
      status: 'DRAFT',
    },
    {
      id: 'QUO-004',
      customer_id: 'CUST-003',
      program: 'Executive Data Science Weekend Program',
      items: [{ description: 'Python + Data Science Direct Roster (25 learners)', qty: 25, rate: 6000 }],
      discount: 0,
      status: 'ACCEPTED',
    },
  ];

  for (const q of extraQuotations) {
    const exists = await db.get('SELECT id FROM quotations WHERE id = ?', [q.id]);
    if (!exists) {
      const { lines, subtotal, discount, tax, total } = docTotals(q.items, { discount_amount: q.discount });
      await db.run(
        'INSERT INTO quotations (id,customer_id,program,subtotal,discount,tax,total,status) VALUES (?,?,?,?,?,?,?,?)',
        [q.id, q.customer_id, q.program, subtotal, discount, tax, total, q.status]
      );
      for (let i = 0; i < q.items.length; i++) {
        const it = q.items[i];
        await db.run(
          'INSERT INTO quotation_items (quotation_id,description,qty,rate,amount) VALUES (?,?,?,?,?)',
          [q.id, it.description, it.qty, it.rate, lines[i]]
        );
      }
    }
  }

  // 5. More Invoices
  const extraInvoices = [
    {
      id: 'INV-003',
      customer_id: 'CUST-001',
      quotation_id: 'QUO-003',
      program: 'Cloud DevOps & Kubernetes Certification',
      items: [
        { description: 'Hands-on Cloud Lab Access (50 users)', qty: 50, rate: 4000 },
        { description: 'Docker & Kubernetes Mentorship', qty: 1, rate: 50000 },
      ],
      discount: 25000,
      status: 'UNPAID',
      due_date: '2026-10-25',
    },
    {
      id: 'INV-004',
      customer_id: 'CUST-002',
      quotation_id: 'QUO-002',
      program: 'Full Stack Development Bootcamp - Milestone 2',
      items: [{ description: 'Full Stack MERN Bootcamp Advanced Module', qty: 30, rate: 4000 }],
      discount: 0,
      status: 'OVERDUE',
      due_date: '2026-09-15',
    },
    {
      id: 'INV-005',
      customer_id: 'CUST-003',
      quotation_id: 'QUO-004',
      program: 'Executive Data Science Weekend Program',
      items: [{ description: 'Python + Data Science Direct Roster (25 learners)', qty: 25, rate: 6000 }],
      discount: 0,
      status: 'PAID',
      due_date: '2026-09-20',
    },
  ];

  for (const inv of extraInvoices) {
    const exists = await db.get('SELECT id FROM invoices WHERE id = ?', [inv.id]);
    if (!exists) {
      const { lines, subtotal, discount, tax, total } = docTotals(inv.items, { discount_amount: inv.discount });
      const paid = inv.status === 'PAID' ? total : 0;
      const outstanding = total - paid;
      await db.run(
        `INSERT INTO invoices (id,customer_id,quotation_id,program,subtotal,discount,tax,total,paid,outstanding,status,due_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [inv.id, inv.customer_id, inv.quotation_id, inv.program, subtotal, discount, tax, total, paid, outstanding, inv.status, inv.due_date]
      );
      for (let i = 0; i < inv.items.length; i++) {
        const it = inv.items[i];
        await db.run(
          'INSERT INTO invoice_items (invoice_id,description,qty,rate,amount) VALUES (?,?,?,?,?)',
          [inv.id, it.description, it.qty, it.rate, lines[i]]
        );
      }
    }
  }

  // 6. More Payments
  const extraPayments = [
    ['PAY-004', 'INV-005', 'CUST-003', 177000, 'Bank Transfer', '2026-09-20', 'IMPS-334412', 'Full course settlement'],
    ['PAY-005', 'INV-001', 'CUST-001', 100000, 'Cheque', '2026-09-29', 'CHQ-889102', 'Milestone 2 advance'],
  ];
  for (const [id, invId, custId, amt, method, dt, ref, notes] of extraPayments) {
    const exists = await db.get('SELECT id FROM payments WHERE id = ?', [id]);
    if (!exists) {
      await db.run(
        'INSERT INTO payments (id,invoice_id,customer_id,amount,method,date,reference,notes) VALUES (?,?,?,?,?,?,?,?)',
        [id, invId, custId, amt, method, dt, ref, notes]
      );
      // Update invoice if needed
      const currentPaid = await db.count('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?', [invId]);
      const inv = await db.get('SELECT total, due_date FROM invoices WHERE id = ?', [invId]);
      if (inv) {
        const outstanding = Math.max(0, inv.total - currentPaid);
        const status = outstanding <= 0 ? 'PAID' : currentPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
        await db.run('UPDATE invoices SET paid = ?, outstanding = ?, status = ? WHERE id = ?', [currentPaid, outstanding, status, invId]);
      }
    }
  }

  // 7. More Expenses
  const extraExpenses = [
    ['EXP-006', '2026-09-28', 'Operations', 'AWS Cloud Services', 'GPU cluster instance hours for student labs', 28500, null, 'PAID'],
    ['EXP-007', '2026-09-29', 'Marketing', 'Campus Connect Ads', 'Fall Semester outreach and institutional brochures', 42000, null, 'APPROVED'],
    ['EXP-008', '2026-09-30', 'Trainer', 'Divya Rao', 'Trainer payout - Web bootcamp delivery milestone', 65000, 'TR-002', 'PAID'],
    ['EXP-009', '2026-09-30', 'Travel', 'City Cabs Express', 'Trainer commute to ABC College campus', 3800, 'TR-001', 'PENDING'],
    ['EXP-010', '2026-09-30', 'Materials', 'Springer Tech Books', 'Hardcopy textbook packages for 3rd year', 21400, null, 'APPROVED'],
  ];
  for (const [id, dt, cat, vendor, desc, amt, tid, status] of extraExpenses) {
    const exists = await db.get('SELECT id FROM expenses WHERE id = ?', [id]);
    if (!exists) {
      await db.run(
        'INSERT INTO expenses (id,date,category,vendor,description,amount,trainer_id,status) VALUES (?,?,?,?,?,?,?,?)',
        [id, dt, cat, vendor, desc, amt, tid, status]
      );
    }
  }

  console.log('[enrich] Mock data enrichment complete! All financial and student tables enriched.');

  // Rich dataset: 30 students per institution, 8 trainers, full attendance /
  // scores / sessions for every batch, zero empty values. Idempotent.
  const { richSeed } = require('./rich-seed');
  await richSeed(db);
  console.log('[enrich] Rich-seed expansion complete.');
}

if (require.main === module) {
  enrich().catch(console.error);
}

module.exports = enrich;
