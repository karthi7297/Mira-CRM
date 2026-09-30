const { forbidden, unauthorized } = require('../utils/http');

const ROLES = ['organization', 'institution', 'trainer', 'student'];

/**
 * Scope resolution — db-prd §0 / userflow.md FLOW P.
 * The frontend sends the logged-in role and its scope key as headers:
 *   x-role       organization | institution | trainer | student
 *   x-customer   users.linked_id when linked_type='customer' (INSTITUTION)
 *   x-trainer    users.linked_id when linked_type='trainer'  (TRAINER staff id, e.g. TR-001)
 *   x-student    users.linked_id when linked_type='student'  (STUDENT user code, e.g. STU-001)
 * Scope keys are nulled out for roles that don't own them, so a spoofed header
 * cannot widen access (e.g. trainer sending x-customer).
 */
function getScope(req) {
  const role = String(req.header('x-role') || '').toLowerCase();
  const s = {
    role: ROLES.includes(role) ? role : null,
    customer_id: req.header('x-customer') || null,
    trainer_id: req.header('x-trainer') || null,
    student_id: req.header('x-student') || null,
  };
  if (s.role !== 'institution') s.customer_id = null;
  if (s.role !== 'trainer') s.trainer_id = null;
  if (s.role !== 'student') s.student_id = null;
  return s;
}

/** Any of the 4 valid roles; attaches req.scope. */
function requireAuth(req, res, next) {
  const scope = getScope(req);
  if (!scope.role) return next(unauthorized('Sign in to continue'));
  req.scope = scope;
  return next();
}

/** Restrict to specific role(s), e.g. requireRole('organization'). */
function requireRole(...roles) {
  return (req, res, next) => {
    const scope = getScope(req);
    if (!scope.role) return next(unauthorized('Sign in to continue'));
    if (!roles.includes(scope.role)) {
      return next(forbidden(`Requires ${roles.join(' or ')} role`));
    }
    req.scope = scope;
    return next();
  };
}

const requireOrg = requireRole('organization');

module.exports = { getScope, requireAuth, requireRole, requireOrg, ROLES };
