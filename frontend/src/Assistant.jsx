import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from './auth';
import { api } from './api';

/* Role-shaped starter prompts. Each one is a question that role can actually
   get an answer to from the data it is allowed to see. */
const SUGGESTIONS = {
  organization: [
    'How many leads are still open?',
    'What is our total outstanding?',
    'Which invoices are unpaid?',
    'How are the batches doing?',
  ],
  institution: [
    'How many students are in my college?',
    'How is attendance across my batches?',
    'What is still unpaid on our account?',
    'Which batches are running right now?',
  ],
  trainer: [
    'Who is below 75% attendance?',
    'How many students are in my batches?',
    'What is my payout status?',
    'Which batches am I assigned to?',
  ],
  student: [
    'What is my attendance?',
    'How did I score in my assessments?',
    'What are my weak areas?',
    'What fee do I still owe?',
  ],
};

const ROLE_LABEL = {
  organization: 'Organization',
  institution: 'Institution',
  trainer: 'Trainer',
  student: 'Student',
};

const Sparkle = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 3.2 13.9 9 19.7 10.9 13.9 12.8 12 18.6 10.1 12.8 4.3 10.9 10.1 9 12 3.2Z" />
    <path d="M18.6 16.4 19.4 18.6 21.6 19.4 19.4 20.2 18.6 22.4 17.8 20.2 15.6 19.4 17.8 18.6 18.6 16.4Z" />
  </svg>
);

const Close = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

const Send = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M14 8 2.6 2.4 4.9 8l-2.3 5.6L14 8Z" />
    <path d="M4.9 8H9" />
  </svg>
);

/**
 * Mira AI — the floating, role-scoped assistant.
 *
 * Mounted once in Layout so it is present on every authenticated screen. It is
 * deliberately a sibling of the page content (direct child of `.shell`), which
 * keeps `position: fixed` resolving against the viewport rather than a
 * transformed ancestor.
 *
 * The widget never decides what the user may see — it just sends the
 * conversation and renders the reply. Scope is resolved server-side.
 */
export default function Assistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const suggestions = SUGGESTIONS[user?.role] || SUGGESTIONS.student;

  /* Keep the newest turn in view */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, error]);

  /* Escape closes; focus lands in the composer on open */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;

    const next = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setError('');
    setBusy(true);

    try {
      // Only user/assistant turns go over the wire; the server re-validates.
      const reply = await api.assistantChat(next.map((m) => ({ role: m.role, content: m.content })));
      setMessages([...next, { role: 'assistant', content: reply.reply }]);
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user');

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        className={'ai-fab' + (open ? ' on' : '')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mira-ai-panel"
        aria-label={open ? 'Close Mira AI' : 'Ask Mira AI'}
        title="Ask Mira AI"
      >
        {open ? <Close /> : <Sparkle />}
        {!open && <span className="ai-fab-text">Ask Mira AI</span>}
      </button>

      {/* Panel */}
      <section
        id="mira-ai-panel"
        className={'ai-panel' + (open ? ' open' : '')}
        aria-hidden={!open}
        aria-label="Mira AI assistant"
      >
        <header className="ai-head">
          <span className="ai-mark"><Sparkle size={15} /></span>
          <span className="ai-head-text">
            <b>Mira AI</b>
            <span>{ROLE_LABEL[user?.role] || 'Assistant'} assistant</span>
          </span>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            <Close />
          </button>
        </header>

        <div className="ai-body" ref={scrollRef} role="log" aria-live="polite" aria-atomic="false">
          {messages.length === 0 && !error && (
            <div className="ai-intro">
              <p>
                Hi {String(user?.name || '').split(' ')[0] || 'there'} — I can answer questions about
                the data your {ROLE_LABEL[user?.role]?.toLowerCase()} login can see.
              </p>
              <div className="ai-chips">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="ai-chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={'ai-msg ' + m.role}>
              {m.content}
            </div>
          ))}

          {busy && (
            <div className="ai-msg assistant ai-typing" aria-label="Mira AI is thinking">
              <span /><span /><span />
            </div>
          )}

          {error && (
            <div className="ai-error" role="alert">
              <p>{error}</p>
              {lastQuestion && (
                <button type="button" className="ai-retry" onClick={() => send(lastQuestion.content)}>
                  Try again
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ai-foot">
          <textarea
            ref={inputRef}
            className="ai-input"
            rows={1}
            placeholder="Ask about your leads, batches, students, finance…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            aria-label="Your question"
          />
          <button
            type="button"
            className="ai-send"
            onClick={() => send()}
            disabled={busy || !input.trim()}
            aria-label="Send"
          >
            <Send />
          </button>
        </div>
        <p className="ai-note">Mira AI is read-only and answers only from data your role can access.</p>
      </section>
    </>
  );
}
