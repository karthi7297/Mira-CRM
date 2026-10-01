import { useEffect } from 'react';

/**
 * Global modal accessibility, applied from one place so every existing
 * `<div className="modal"><div>…</div></div>` gets the behaviour without
 * touching each page (audit F4 keyboard access, F5 backdrop close).
 *
 *   · Escape closes the top-most open modal
 *   · clicking the backdrop (the .modal element itself) closes it
 *   · the first form control inside a newly-opened modal is focused
 *   · focus returns to whatever was focused before the modal opened
 *   · role="dialog" / aria-modal="true" are stamped on the dialog panel
 *
 * A modal may opt out of the close-button heuristic by marking its own
 * close control with `data-modal-close`.
 */

const CLOSE_RE = /^(cancel|close|dismiss|✕|✖|×|✗|no,? thanks)/i;

function findCloseButton(modal) {
  const explicit = modal.querySelector('[data-modal-close]');
  if (explicit) return explicit;
  const btns = [...modal.querySelectorAll('button')];
  // Prefer an explicit text match, else the last ghost button in the footer.
  const byText = btns.find((b) => CLOSE_RE.test((b.textContent || '').trim()));
  if (byText) return byText;
  const ghosts = btns.filter((b) => b.classList.contains('ghost'));
  return ghosts.length ? ghosts[ghosts.length - 1] : null;
}

function topModal() {
  const modals = document.querySelectorAll('.modal');
  return modals.length ? modals[modals.length - 1] : null;
}

export function useModalA11y() {
  useEffect(() => {
    let restoreTo = null;

    const decorate = (modal) => {
      const panel = modal.querySelector(':scope > div') || modal;
      if (!panel.hasAttribute('role')) panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      if (!modal.dataset.a11yReady) {
        modal.dataset.a11yReady = '1';
      }
    };

    const focusFirst = (modal) => {
      const target = modal.querySelector(
        'input:not([type=hidden]), select, textarea, button',
      );
      if (target) {
        try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    };

    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const modal = topModal();
      if (!modal) return;
      const btn = findCloseButton(modal);
      if (btn) { e.stopPropagation(); btn.click(); }
    };

    const onClick = (e) => {
      // Only a click on the backdrop element itself (not the panel) closes.
      if (!e.target || !e.target.classList || !e.target.classList.contains('modal')) return;
      const btn = findCloseButton(e.target);
      if (btn) btn.click();
    };

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onClick, true);

    // Detect modals appearing/disappearing to manage focus.
    const obs = new MutationObserver(() => {
      const modal = topModal();
      if (modal) {
        decorate(modal);
        if (!modal.dataset.a11yFocused) {
          modal.dataset.a11yFocused = '1';
          restoreTo = document.activeElement;
          // Defer so the element is painted before we focus it.
          setTimeout(() => focusFirst(modal), 0);
        }
      } else if (restoreTo && typeof restoreTo.focus === 'function') {
        try { restoreTo.focus({ preventScroll: true }); } catch { /* ignore */ }
        restoreTo = null;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onClick, true);
      obs.disconnect();
    };
  }, []);
}
