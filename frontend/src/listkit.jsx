import { useMemo, useState } from 'react';

/**
 * Shared list toolkit — one implementation of search / sort / pagination /
 * bulk-selection that every list page reuses, so behaviour stays consistent
 * (audit D1 sort, D2 pagination, D3 bulk actions, D5 search coverage).
 *
 *   const L = useListControls(rows, {
 *     searchKeys: ['name', 'id', 'contact_person'],
 *     initialSort: { key: 'created_at', dir: 'desc' },
 *   });
 *   ...
 *   <ListToolbar L={L} placeholder="Search…" sortOptions={[['name','Name']]} />
 *   {L.rows.map(...)}
 *   <Pager L={L} />
 */

const asNum = (v) => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return NaN;
  const n = Number(v);
  return Number.isNaN(n) ? NaN : n;
};

export function useListControls(rows, opts = {}) {
  const {
    searchKeys = [],
    accessor = (r, k) => (r == null ? undefined : r[k]),
    initialSort = null,
    pageSize: initialPageSize = 10,
    filter = null, // (row) => boolean  (extra predicate applied before search)
    dateKey = null, // column the from/to range filters on (audit D25)
  } = opts;

  const [q, setQRaw] = useState('');
  const [sort, setSort] = useState(initialSort);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);
  const [page, setPageRaw] = useState(1);
  const [from, setFromRaw] = useState('');
  const [to, setToRaw] = useState('');

  const setQ = (v) => { setQRaw(v); setPageRaw(1); };
  const setPage = (v) => setPageRaw(v);
  const setPageSize = (v) => { setPageSizeRaw(v); setPageRaw(1); };
  const setFrom = (v) => { setFromRaw(v); setPageRaw(1); };
  const setTo = (v) => { setToRaw(v); setPageRaw(1); };
  const clearDates = () => { setFromRaw(''); setToRaw(''); setPageRaw(1); };

  const filtered = useMemo(() => {
    let out = rows || [];
    if (typeof filter === 'function') out = out.filter(filter);
    // Date range (inclusive). Compare on the date part only so a timestamp
    // column ("2026-09-30 14:02:00") still matches a plain YYYY-MM-DD bound.
    if (dateKey && (from || to)) {
      out = out.filter((r) => {
        const raw = accessor(r, dateKey);
        if (raw == null || raw === '') return false;
        const d = String(raw).slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      out = out.filter((r) => searchKeys.some((k) => {
        const v = accessor(r, k);
        return v != null && String(v).toLowerCase().includes(needle);
      }));
    }
    return out;
  }, [rows, q, searchKeys, accessor, filter, dateKey, from, to]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    const mul = dir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = accessor(a, key);
      const bv = accessor(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulls last, regardless of direction
      if (bv == null) return -1;
      const an = asNum(av);
      const bn = asNum(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * mul;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * mul;
    });
  }, [filtered, sort, accessor]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const view = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  const toggleSort = (key) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null; // third click clears the sort
    });
  };

  const reset = () => { setQRaw(''); setFromRaw(''); setToRaw(''); setPageRaw(1); };

  return {
    q, setQ,
    sort, toggleSort, setSort,
    page: safePage, setPage, pageCount, total,
    pageSize, setPageSize,
    rows: view, all: sorted,
    filtered, reset,
    dateKey, from, to, setFrom, setTo, clearDates,
    hasDateFilter: !!(dateKey && (from || to)),
    isFiltered: q.trim().length > 0 || !!(from || to),
  };
}

/**
 * From/to date-range picker (audit D25). Renders nothing unless the list was
 * given a `dateKey`, so it can be dropped into every toolbar unconditionally.
 */
export function DateRange({ L, label = 'Date' }) {
  if (!L || !L.dateKey) return null;
  return (
    <span className="daterange">
      <span className="dr-label">{label}</span>
      <input
        type="date"
        className="dr-input"
        aria-label={`${label} from`}
        value={L.from}
        onChange={(e) => L.setFrom(e.target.value)}
      />
      <span className="dr-sep" aria-hidden="true">→</span>
      <input
        type="date"
        className="dr-input"
        aria-label={`${label} to`}
        value={L.to}
        onChange={(e) => L.setTo(e.target.value)}
      />
      {(L.from || L.to) && (
        <button type="button" className="btn sm ghost" onClick={L.clearDates}>Clear</button>
      )}
    </span>
  );
}

/** "Archived" switch for a list toolbar — flips the list between live and archive (audit D8). */
export function ArchiveToggle({ value, onChange, label = 'Archived' }) {
  return (
    <label className="arch-toggle" title="Show archived records instead of live ones">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Toolbar: search + optional sort dropdown + page-size + filter children. */
export function ListToolbar({
  L, placeholder = 'Search…', children,
  sortOptions = null, showPageSize = true, pageSizes = [10, 25, 50, 100], hideSearch = false,
}) {
  if (!L) return null;
  return (
    <div className="toolbar list-toolbar">
      {!hideSearch && (
        <input
          className="search-input"
          placeholder={placeholder}
          value={L.q}
          onChange={(e) => L.setQ(e.target.value)}
          aria-label={placeholder}
        />
      )}
      {children}
      {sortOptions && sortOptions.length > 0 && (
        <select
          className="select-sm"
          aria-label="Sort by"
          value={L.sort ? `${L.sort.key}:${L.sort.dir}` : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return L.setSort(null);
            const [key, dir] = v.split(':');
            L.setSort({ key, dir });
          }}
        >
          <option value="">Sort: default</option>
          {sortOptions.map(([k, label]) => (
            <optgroup key={k} label={label}>
              <option value={`${k}:asc`}>{label} ↑</option>
              <option value={`${k}:desc`}>{label} ↓</option>
            </optgroup>
          ))}
        </select>
      )}
      {showPageSize && (
        <select
          className="select-sm"
          aria-label="Rows per page"
          value={L.pageSize}
          onChange={(e) => L.setPageSize(Number(e.target.value))}
        >
          {pageSizes.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      )}
      <span className="list-count">{L.total} {L.total === 1 ? 'row' : 'rows'}</span>
    </div>
  );
}

/** Pagination footer. */
export function Pager({ L }) {
  if (!L || L.pageCount <= 1) return null;
  const from = (L.page - 1) * L.pageSize + 1;
  const to = Math.min(L.total, L.page * L.pageSize);
  return (
    <div className="pager">
      <button type="button" className="btn sm ghost" disabled={L.page <= 1} onClick={() => L.setPage(L.page - 1)}>‹ Prev</button>
      <span className="pager-info">Page {L.page} of {L.pageCount} · showing {from}–{to} of {L.total}</span>
      <button type="button" className="btn sm ghost" disabled={L.page >= L.pageCount} onClick={() => L.setPage(L.page + 1)}>Next ›</button>
    </div>
  );
}

/** Clickable <th> that drives L.toggleSort. */
export function SortHeader({ label, k, L, align, style }) {
  const active = L?.sort?.key === k;
  const arrow = !active ? '↕' : L.sort.dir === 'asc' ? '↑' : '↓';
  return (
    <th
      className={`th-sort${active ? ' active' : ''}`}
      style={{ textAlign: align, ...style }}
      onClick={() => L.toggleSort(k)}
      title={`Sort by ${label}`}
    >
      <span>{label}</span><span className="th-arrow">{arrow}</span>
    </th>
  );
}

/** Row-checkbox selection state for bulk actions. */
export function useBulkSelection() {
  const [sel, setSel] = useState(() => new Set());
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setMany = (ids) => setSel(new Set(ids));
  const clear = () => setSel(new Set());
  const has = (id) => sel.has(id);
  return { sel, toggle, setMany, clear, has, size: sel.size, ids: [...sel] };
}

/** Bulk action bar shown when rows are selected. */
export function BulkBar({ bulk, total, onClear, children }) {
  if (!bulk || bulk.size === 0) return null;
  return (
    <div className="bulkbar">
      <span className="bulkbar-count">{bulk.size} selected</span>
      {children}
      <button type="button" className="btn sm ghost" onClick={onClear || bulk.clear}>Clear</button>
    </div>
  );
}

/** Select-all checkbox for a table header. */
export function SelectAllTh({ bulk, ids, label = '' }) {
  const allOn = ids.length > 0 && ids.every((id) => bulk.has(id));
  const someOn = ids.some((id) => bulk.has(id));
  return (
    <th style={{ width: 36 }}>
      <input
        type="checkbox"
        aria-label="Select all"
        checked={allOn}
        ref={(el) => { if (el) el.indeterminate = !allOn && someOn; }}
        onChange={() => (allOn ? bulk.clear() : bulk.setMany(ids))}
      />
      {label}
    </th>
  );
}

/** CSV download of arbitrary rows — used by list exports (audit D4). */
export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
  const csv = `${head}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Loading / error / empty surface (audit F6) ----------------- */

/**
 * One consistent loading / network-error (with retry) / empty surface.
 *   <ListState loading={loading} error={err} onRetry={load}
 *              empty={L.total === 0} emptyText="No records yet." />
 * Renders nothing when there is data, so it can sit above the table.
 */
export function ListState({ loading, error, empty, onRetry, loadingText = 'Loading…', emptyText = 'Nothing to show yet.', errorText }) {
  if (loading) return <div className="loading">{loadingText}</div>;
  if (error) {
    return (
      <div className="err" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span>{errorText || 'Could not load data'} — {error}</span>
        {onRetry && <button type="button" className="btn sm ghost" onClick={onRetry}>Retry</button>}
      </div>
    );
  }
  if (empty) return <p className="empty">{emptyText}</p>;
  return null;
}

/* ---------- Saved views (audit D7) ------------------------------------- */
/**
 * Named, reusable filter/sort combinations persisted to localStorage.
 *   const views = useSavedViews('invoices',
 *     () => ({ q: L.q, sort: L.sort, filter }),
 *     (s) => { L.setQ(s.q || ''); L.setSort(s.sort || null); setFilter(s.filter || 'ALL'); });
 *   <SavedViewsBar views={views} />
 */
export function useSavedViews(pageKey, getState, setState) {
  const storeKey = `mira_views_${pageKey}`;
  const read = () => {
    try { return JSON.parse(localStorage.getItem(storeKey)) || []; } catch { return []; }
  };
  const [views, setViews] = useState(read);
  const persist = (next) => {
    setViews(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* quota */ }
  };
  const save = (name) => {
    const label = String(name || '').trim() || `View ${views.length + 1}`;
    const state = getState();
    const exists = views.find((v) => v.name === label);
    const next = exists
      ? views.map((v) => (v.name === label ? { ...v, state } : v))
      : [...views, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: label, state }];
    persist(next);
    return label;
  };
  const apply = (id) => {
    const v = views.find((x) => x.id === id);
    if (v) setState(v.state || {});
  };
  const remove = (id) => persist(views.filter((v) => v.id !== id));
  return { views, save, apply, remove };
}

/** Dropdown + inline save/delete for saved views. */
export function SavedViewsBar({ views, label = 'Saved views' }) {
  const [sel, setSel] = useState('');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  if (!views) return null;
  const { views: list, save, apply, remove } = views;

  const commit = () => {
    const label2 = name.trim();
    if (label2) save(label2);
    setName('');
    setNaming(false);
  };

  return (
    <div className="savedviews">
      <select
        className="select-sm"
        value={sel}
        aria-label={label}
        onChange={(e) => { setSel(e.target.value); if (e.target.value) apply(e.target.value); }}
      >
        <option value="">{label}…</option>
        {list.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      {naming ? (
        <>
          <input
            className="search-input sv-name"
            autoFocus
            placeholder="View name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setNaming(false); setName(''); } }}
          />
          <button type="button" className="btn sm" onClick={commit}>Save</button>
          <button type="button" className="btn sm ghost" onClick={() => { setNaming(false); setName(''); }}>Cancel</button>
        </>
      ) : (
        <>
          <button type="button" className="btn sm ghost" onClick={() => setNaming(true)}>+ Save view</button>
          {sel && <button type="button" className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => { remove(sel); setSel(''); }}>Delete view</button>}
        </>
      )}
    </div>
  );
}

