/**
 * In-app notifications (audit B4 / F7).
 *
 * An actionable inbox behind the topbar bell. A notification targets either one
 * user (`audience_user`, a business code like U-001) or everyone in a role
 * (`audience_role`). Read state lives in `notification_reads`, so a role
 * broadcast keeps a per-user unread count instead of one person clearing it for
 * the whole team.
 *
 * `notify()` is the emit helper other services call. It is deliberately
 * non-throwing: a notification must never break the business action that
 * triggered it, so a failure is logged and swallowed.
 *
 * Async facade throughout.
 */
const db = require('../db');
const { notFound, forbidden } = require('../utils/http');
const { str } = require('../utils/validate');
const { nid } = require('../utils/ids');

const KINDS = ['INFO', 'SUCCESS', 'WARNING', 'ERROR'];

/** SQL fragment + params matching the notifications a scope may see. */
function audienceClause(scope) {
  return {
    sql: '(n.audience_user = ? OR (n.audience_user IS NULL AND n.audience_role = ?))',
    params: [scope.user_id || '', scope.role || ''],
  };
}

/** Notifications visible to the caller, newest first, with a per-user read flag. */
async function list(scope, { limit = 50 } = {}) {
  const a = audienceClause(scope);
  const lim = Math.min(Math.max(1, Number(limit) || 50), 200);
  const rows = await db.query(
    `SELECT n.*, (r.read_at IS NOT NULL) AS is_read
       FROM notifications n
       LEFT JOIN notification_reads r
              ON r.notification_id = n.id AND r.user_id = ?
      WHERE ${a.sql}
      ORDER BY n.created_at DESC, n.notification_key DESC
      LIMIT ${lim}`,
    [scope.user_id || '', ...a.params]
  );
  return rows.map((r) => ({ ...r, is_read: !!r.is_read }));
}

/** Unread count for the bell badge. */
async function unreadCount(scope) {
  const a = audienceClause(scope);
  return db.count(
    `SELECT COUNT(*) FROM notifications n
      WHERE ${a.sql}
        AND NOT EXISTS (SELECT 1 FROM notification_reads r
                         WHERE r.notification_id = n.id AND r.user_id = ?)`,
    [...a.params, scope.user_id || '']
  );
}

/** Mark one notification read for the caller (idempotent, portable across dialects). */
async function markRead(scope, id) {
  const n = await db.get('SELECT * FROM notifications WHERE id = ?', [id]);
  if (!n) throw notFound('Notification not found');
  const uid = scope.user_id || '';
  const visible = (n.audience_user && n.audience_user === uid)
    || (!n.audience_user && n.audience_role === scope.role);
  if (!visible) throw forbidden('Not your notification');
  const already = await db.get(
    'SELECT 1 AS x FROM notification_reads WHERE notification_id = ? AND user_id = ?',
    [id, uid]
  );
  if (!already) await db.run('INSERT INTO notification_reads (notification_id, user_id) VALUES (?,?)', [id, uid]);
  return { id, read: true };
}

/** Mark every visible notification read for the caller; returns how many flipped. */
async function markAllRead(scope) {
  const a = audienceClause(scope);
  const uid = scope.user_id || '';
  const rows = await db.query(
    `SELECT n.id FROM notifications n
      WHERE ${a.sql}
        AND NOT EXISTS (SELECT 1 FROM notification_reads r
                         WHERE r.notification_id = n.id AND r.user_id = ?)`,
    [...a.params, uid]
  );
  for (const r of rows) {
    await db.run('INSERT INTO notification_reads (notification_id, user_id) VALUES (?,?)', [r.id, uid]);
  }
  return { marked: rows.length };
}

/**
 * Emit a notification. Never throws — the caller's business action must not
 * fail because an inbox row could not be written.
 */
async function notify({ userId = null, role = null, kind = 'INFO', title, body = null, link = null } = {}) {
  if (!title) return null;
  try {
    const id = await nid(db, 'NTF', 'notifications');
    await db.run(
      'INSERT INTO notifications (id, audience_user, audience_role, kind, title, body, link) VALUES (?,?,?,?,?,?,?)',
      [id, userId || null, role || null, KINDS.includes(kind) ? kind : 'INFO',
        str(title), body ? str(body) : null, link ? str(link) : null]
    );
    return id;
  } catch (err) {
    console.warn('[notify] skipped:', err.message);
    return null;
  }
}

module.exports = { list, unreadCount, markRead, markAllRead, notify, KINDS };
