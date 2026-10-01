import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Promise-based confirmation popup — drop-in replacement for window.confirm
 * that renders through the app's .modal chrome instead of the browser's
 * native prompt.
 *
 * Mount <ConfirmHost /> once (App.jsx), then at any delete site:
 *
 *   if (!(await confirmDialog({ title: 'Delete trainer', message: `...` }))) return;
 */
let _open = null;
let _pending = null;

export function confirmDialog({
  title = 'Are you sure?',
  message = '',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  tone = 'danger',
} = {}) {
  return new Promise((resolve) => {
    /* A second request while one is open settles the first as "cancel" so its
       caller never hangs on an await. */
    if (_pending) { const p = _pending; _pending = null; p(false); }
    if (!_open) { resolve(window.confirm(message || title)); return; }
    _pending = resolve;
    _open({ title, message, confirmText, cancelText, tone, resolve });
  });
}

export default function ConfirmHost() {
  const [dlg, setDlg] = useState(null);
  const resolveRef = useRef(null);

  useEffect(() => {
    _open = (d) => { resolveRef.current = d.resolve; setDlg(d); };
    return () => {
      _open = null;
      if (_pending) { const p = _pending; _pending = null; p(false); }
    };
  }, []);

  const close = useCallback((ok) => {
    const r = resolveRef.current;
    resolveRef.current = null;
    _pending = null;
    setDlg(null);
    if (r) r(ok);
  }, []);

  useEffect(() => {
    if (!dlg) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dlg, close]);

  if (!dlg) return null;

  return (
    <div
      className="modal confirm"
      role="alertdialog"
      aria-modal="true"
      aria-label={dlg.title}
      onClick={() => close(false)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon" aria-hidden="true">!</div>
        <h3>{dlg.title}</h3>
        {dlg.message ? <p className="confirm-msg">{dlg.message}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="btn ghost" onClick={() => close(false)} autoFocus>
            {dlg.cancelText}
          </button>
          <button
            type="button"
            className={'btn' + (dlg.tone === 'danger' ? ' danger' : '')}
            onClick={() => close(true)}
          >
            {dlg.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
