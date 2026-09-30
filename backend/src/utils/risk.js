const config = require('../config');
const { round2 } = require('./numbers');

function maxOverdueDays(invoices, today = new Date()) {
  let max = 0;
  for (const inv of invoices) {
    if (!inv.due_date || !(Number(inv.outstanding || 0) > 0.01)) continue;
    const due = new Date(`${inv.due_date}T23:59:59`);
    if (due < today) max = Math.max(max, Math.ceil((today - due) / 86400000));
  }
  return max;
}

/**
 * Collection Risk (master-prd §11): outstanding + overdue days + payment history
 * → HIGH / MEDIUM / LOW. Rule-based prioritization, not ML.
 */
function collectionRisk({ outstanding = 0, overdueDays = 0, invoiceCount = 0 }) {
  const { highOutstanding, highOverdueDays, mediumOutstanding, mediumOverdueDays } = config.collectionRisk;
  if (invoiceCount === 0 || round2(outstanding) <= 0.01) return 'LOW';
  if (outstanding >= highOutstanding || overdueDays > highOverdueDays) return 'HIGH';
  if (outstanding >= mediumOutstanding || overdueDays > mediumOverdueDays) return 'MEDIUM';
  return 'MEDIUM'; // any live outstanding is at least worth attention
}

module.exports = { collectionRisk, maxOverdueDays };
