/**
 * Shared client-side form validation.
 *
 * Usage in a form component:
 *
 *   const [fe, setFe] = useState({});
 *   const onSubmit = async (e) => {
 *     e.preventDefault();
 *     const errs = check({
 *       name:  [req('Name'), minLen(2, 'Name')],
 *       email: [email()],
 *       fee:   [num('Fee per student', { min: 0 })],
 *     }, f);
 *     setFe(errs);
 *     if (Object.keys(errs).length) return;   // stop, errors are shown inline
 *     ...submit...
 *   };
 *
 *   <div>
 *     <input aria-invalid={!!fe.name} ... />
 *     <Ferr fe={fe} name="name" />
 *   </div>
 *
 * Clear an error when the user retypes: onChange => { setF(...); setFe({}); }
 * (optional — validation still re-runs on every submit).
 */

/* ---------- rules: each returns null when valid, or a message ---------- */

export const req = (label = 'This field') => (v) =>
  String(v ?? '').trim() ? null : `${label} is required`;

export const email = () => (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? null : 'Enter a valid email address';
};

export const phone = (label = 'Phone number') => (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return /^[+()\-.\s\d]{7,20}$/.test(s) && s.replace(/\D/g, '').length >= 7
    ? null
    : `Enter a valid ${label.toLowerCase()}`;
};

export const url = (label = 'Website') => (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return /^https?:\/\/[^\s]+\.[^\s]+$/i.test(s) ? null : `${label} must start with http:// or https://`;
};

export const minLen = (n, label = 'This field') => (v) =>
  String(v ?? '').trim().length >= n ? null : `${label} must be at least ${n} characters`;

export const maxLen = (n, label = 'This field') => (v) =>
  String(v ?? '').trim().length <= n ? null : `${label} must be at most ${n} characters`;

export const int = (label = 'Value', opts = {}) => (v) => num(label, { ...opts, integer: true })(v);

export const num = (label = 'Value', { min, max, integer } = {}) => (v) => {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  if (integer && !Number.isInteger(n)) return `${label} must be a whole number`;
  if (min !== undefined && n < min) return `${label} must be at least ${min}`;
  if (max !== undefined && n > max) return `${label} must be at most ${max}`;
  return null;
};

/** Value must match another field (e.g. password confirmation). */
export const matches = (otherValue, label = 'Values') => (v) =>
  String(v ?? '') === String(otherValue ?? '') ? null : `${label} do not match`;

/** Reject values that only contain whitespace / filler. */
export const notBlank = (label = 'This field') => (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return /^[\s\S]*[^\s][\s\S]*$/.test(s) ? null : `${label} cannot be only spaces`;
};

/* ---------- runner ---------- */

/**
 * @param {Object.<string, Function|Function[]>} rules  field -> rule or [rules]
 * @param {Object} values                              the form state
 * @returns {Object.<string, string>}                  field -> first error message
 */
export function check(rules, values) {
  const errs = {};
  for (const key of Object.keys(rules)) {
    const list = Array.isArray(rules[key]) ? rules[key] : [rules[key]];
    for (const rule of list) {
      const msg = rule(values?.[key], values);
      if (msg) { errs[key] = msg; break; }
    }
  }
  return errs;
}

/** True when the form has no errors. */
export const ok = (errs) => !errs || Object.keys(errs).length === 0;

/* ---------- rendering ---------- */

export function Ferr({ fe, name }) {
  const msg = fe?.[name];
  if (!msg) return null;
  return <p className="field-err" role="alert">{msg}</p>;
}
