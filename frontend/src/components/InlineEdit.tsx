'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Click-to-edit fields, the way an issue tracker actually behaves.
 *
 * A field renders as text until someone deliberately opens it. That matters for
 * more than looks: a screen full of live inputs invites accidental edits, gives
 * no point at which a change is committed, and makes it impossible to tell what
 * the stored value was. Here each field owns its own draft, saves only what it
 * changed, and reports its own failure without disturbing the rest of the form.
 */

type SaveState = 'idle' | 'saving' | 'error';

function useCommit(onSave: (value: unknown) => Promise<void>) {
  const [state, setState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const commit = async (value: unknown): Promise<boolean> => {
    setState('saving');
    setMessage('');
    try {
      await onSave(value);
      if (mounted.current) setState('idle');
      return true;
    } catch (caught) {
      const detail = caught as { response?: { data?: { detail?: string } }; message?: string };
      if (mounted.current) {
        setState('error');
        setMessage(detail.response?.data?.detail || detail.message || 'Could not save this field.');
      }
      return false;
    }
  };

  return { state, message, commit, clearError: () => { setState('idle'); setMessage(''); } };
}

/** Label, control, and any error the field itself produced. */
export function Field({
  label,
  htmlFor,
  error,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      {label ? (
        <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-slate-600">
          {label}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="mt-1 text-[0.7rem] text-slate-500">{hint}</p> : null}
      {error ? <p className="mt-1 text-[0.7rem] text-rose-600">{error}</p> : null}
    </div>
  );
}

/** The resting state of an editable field: text you can click. */
function ReadValue({
  onOpen,
  isEmpty,
  children,
  canEdit,
  label,
  multiline,
}: {
  onOpen: () => void;
  isEmpty?: boolean;
  children: ReactNode;
  canEdit: boolean;
  label: string;
  multiline?: boolean;
}) {
  if (!canEdit) {
    return (
      <div className={`rounded-sm px-2 py-1.5 text-sm ${isEmpty ? 'text-slate-400' : 'text-slate-900'}`}>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Edit ${label}`}
      className={`w-full rounded-sm border border-transparent px-2 py-1.5 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50 ${
        isEmpty ? 'text-slate-400' : 'text-slate-900'
      } ${multiline ? 'whitespace-pre-wrap' : 'truncate'}`}
    >
      {children}
    </button>
  );
}

/** Confirm and cancel, shown while a field is open. */
function EditActions({ onCommit, onCancel, busy }: { onCommit: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <button
        type="button"
        onClick={onCommit}
        disabled={busy}
        className="button-primary h-7 px-2.5 text-xs disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className="button-secondary h-7 px-2.5 text-xs">
        Cancel
      </button>
    </div>
  );
}

const inputClass = 'w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm';

interface BaseProps {
  label: string;
  placeholder?: string;
  canEdit?: boolean;
  hint?: string;
}

/** A single-line text field. Enter saves, Escape cancels. */
export function InlineText({
  label,
  value,
  onSave,
  placeholder = 'None',
  canEdit = true,
  hint,
}: BaseProps & { value: string; onSave: (next: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const { state, message, commit, clearError } = useCommit(onSave as (value: unknown) => Promise<void>);

  useEffect(() => { if (!open) setDraft(value); }, [value, open]);

  const save = async () => {
    if (draft === value) { setOpen(false); return; }
    if (await commit(draft)) setOpen(false);
  };

  return (
    <Field label={label} error={message} hint={hint}>
      {open ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(event) => { setDraft(event.target.value); clearError(); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void save(); }
              if (event.key === 'Escape') { setDraft(value); setOpen(false); clearError(); }
            }}
            className={inputClass}
          />
          <EditActions onCommit={() => void save()} onCancel={() => { setDraft(value); setOpen(false); clearError(); }} busy={state === 'saving'} />
        </>
      ) : (
        <ReadValue onOpen={() => setOpen(true)} isEmpty={!value} canEdit={canEdit} label={label}>
          {value || placeholder}
        </ReadValue>
      )}
    </Field>
  );
}

/** A number field with optional bounds. */
export function InlineNumber({
  label,
  value,
  onSave,
  placeholder = 'None',
  canEdit = true,
  min = 0,
  step = 0.5,
  suffix,
  hint,
}: BaseProps & {
  value: number | null | undefined;
  onSave: (next: number | null) => Promise<void>;
  min?: number;
  step?: number;
  suffix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  const { state, message, commit, clearError } = useCommit(onSave as (value: unknown) => Promise<void>);

  useEffect(() => {
    if (!open) setDraft(value === null || value === undefined ? '' : String(value));
  }, [value, open]);

  const save = async () => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next !== null && (Number.isNaN(next) || next < min)) {
      return;
    }
    if (next === (value ?? null)) { setOpen(false); return; }
    if (await commit(next)) setOpen(false);
  };

  const display = value === null || value === undefined ? placeholder : `${value}${suffix ?? ''}`;

  return (
    <Field label={label} error={message} hint={hint}>
      {open ? (
        <>
          <input
            autoFocus
            type="number"
            min={min}
            step={step}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); clearError(); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void save(); }
              if (event.key === 'Escape') { setOpen(false); clearError(); }
            }}
            className={inputClass}
          />
          <EditActions onCommit={() => void save()} onCancel={() => { setOpen(false); clearError(); }} busy={state === 'saving'} />
        </>
      ) : (
        <ReadValue onOpen={() => setOpen(true)} isEmpty={value === null || value === undefined} canEdit={canEdit} label={label}>
          {display}
        </ReadValue>
      )}
    </Field>
  );
}

/** A date field, stored and emitted as YYYY-MM-DD. */
export function InlineDate({
  label,
  value,
  onSave,
  placeholder = 'None',
  canEdit = true,
}: BaseProps & { value: string; onSave: (next: string | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const { state, message, commit, clearError } = useCommit(onSave as (value: unknown) => Promise<void>);

  useEffect(() => { if (!open) setDraft(value); }, [value, open]);

  const save = async () => {
    if (draft === value) { setOpen(false); return; }
    if (await commit(draft || null)) setOpen(false);
  };

  return (
    <Field label={label} error={message}>
      {open ? (
        <>
          <input
            autoFocus
            type="date"
            value={draft}
            onChange={(event) => { setDraft(event.target.value); clearError(); }}
            onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); clearError(); } }}
            className={inputClass}
          />
          <EditActions onCommit={() => void save()} onCancel={() => { setDraft(value); setOpen(false); clearError(); }} busy={state === 'saving'} />
        </>
      ) : (
        <ReadValue onOpen={() => setOpen(true)} isEmpty={!value} canEdit={canEdit} label={label}>
          {value ? new Date(`${value}T00:00:00`).toLocaleDateString() : placeholder}
        </ReadValue>
      )}
    </Field>
  );
}

/**
 * A dropdown. Picking an option commits immediately, because a select has no
 * intermediate state worth confirming.
 */
export function InlineSelect({
  label,
  value,
  options,
  onSave,
  placeholder = 'None',
  canEdit = true,
  allowEmpty = false,
  renderValue,
}: BaseProps & {
  value: string;
  options: string[];
  onSave: (next: string) => Promise<void>;
  allowEmpty?: boolean;
  renderValue?: (value: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { state, message, commit, clearError } = useCommit(onSave as (value: unknown) => Promise<void>);

  const choose = async (next: string) => {
    if (next === value) { setOpen(false); return; }
    if (await commit(next)) setOpen(false);
  };

  return (
    <Field label={label} error={message}>
      {open ? (
        <div className="flex items-center gap-1.5">
          <select
            autoFocus
            value={value}
            disabled={state === 'saving'}
            onChange={(event) => void choose(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); clearError(); } }}
            className={inputClass}
          >
            {allowEmpty ? <option value="">{placeholder}</option> : null}
            {options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button type="button" onClick={() => { setOpen(false); clearError(); }} className="button-secondary h-7 shrink-0 px-2 text-xs">
            Cancel
          </button>
        </div>
      ) : (
        <ReadValue onOpen={() => setOpen(true)} isEmpty={!value} canEdit={canEdit} label={label}>
          {value ? (renderValue ? renderValue(value) : value) : placeholder}
        </ReadValue>
      )}
    </Field>
  );
}

/** A multi-line field. Ctrl/Cmd+Enter saves, since Enter has to insert newlines. */
export function InlineTextarea({
  label,
  value,
  onSave,
  placeholder = 'None',
  canEdit = true,
  rows = 8,
}: BaseProps & { value: string; onSave: (next: string) => Promise<void>; rows?: number }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const { state, message, commit, clearError } = useCommit(onSave as (value: unknown) => Promise<void>);

  useEffect(() => { if (!open) setDraft(value); }, [value, open]);

  const save = async () => {
    if (draft === value) { setOpen(false); return; }
    if (await commit(draft)) setOpen(false);
  };

  return (
    <Field label={label} error={message} hint={open ? 'Ctrl+Enter to save, Escape to cancel.' : undefined}>
      {open ? (
        <>
          <textarea
            autoFocus
            rows={rows}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); clearError(); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(); }
              if (event.key === 'Escape') { setDraft(value); setOpen(false); clearError(); }
            }}
            className={`${inputClass} font-normal leading-6`}
          />
          <EditActions onCommit={() => void save()} onCancel={() => { setDraft(value); setOpen(false); clearError(); }} busy={state === 'saving'} />
        </>
      ) : (
        <ReadValue onOpen={() => setOpen(true)} isEmpty={!value} canEdit={canEdit} label={label} multiline>
          {value || placeholder}
        </ReadValue>
      )}
    </Field>
  );
}

/** Comma-separated tags, shown as chips when closed. */
export function InlineTags({
  label,
  values,
  onSave,
  placeholder = 'None',
  canEdit = true,
}: BaseProps & { values: string[]; onSave: (next: string[]) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(values.join(', '));
  const { state, message, commit, clearError } = useCommit(onSave as (value: unknown) => Promise<void>);

  useEffect(() => { if (!open) setDraft(values.join(', ')); }, [values, open]);

  const save = async () => {
    const next = draft.split(',').map((item) => item.trim()).filter(Boolean);
    if (next.join(', ') === values.join(', ')) { setOpen(false); return; }
    if (await commit(next)) setOpen(false);
  };

  return (
    <Field label={label} error={message} hint={open ? 'Separate labels with commas.' : undefined}>
      {open ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(event) => { setDraft(event.target.value); clearError(); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void save(); }
              if (event.key === 'Escape') { setDraft(values.join(', ')); setOpen(false); clearError(); }
            }}
            placeholder="frontend, api, urgent"
            className={inputClass}
          />
          <EditActions onCommit={() => void save()} onCancel={() => { setDraft(values.join(', ')); setOpen(false); clearError(); }} busy={state === 'saving'} />
        </>
      ) : (
        <ReadValue onOpen={() => setOpen(true)} isEmpty={values.length === 0} canEdit={canEdit} label={label}>
          {values.length === 0 ? placeholder : (
            <span className="flex flex-wrap gap-1">
              {values.map((tag) => (
                <span key={tag} className="ado-pill">{tag}</span>
              ))}
            </span>
          )}
        </ReadValue>
      )}
    </Field>
  );
}

/** A value the API computes; shown for context, never editable here. */
export function ReadOnlyField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="rounded-sm bg-slate-50 px-2 py-1.5 text-sm text-slate-600">{children}</div>
    </Field>
  );
}

/**
 * The issue summary: a heading that becomes an input when clicked. It wraps
 * rather than truncating, because a summary that cannot be read in full is the
 * one field where clipping actually costs the reader information.
 */
export function InlineHeading({
  value,
  onSave,
  canEdit = true,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const { state, message, commit, clearError } = useCommit(onSave as (value: unknown) => Promise<void>);

  useEffect(() => { if (!open) setDraft(value); }, [value, open]);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed === value) { setOpen(false); return; }
    if (await commit(trimmed)) setOpen(false);
  };

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => canEdit && setOpen(true)}
          aria-label={canEdit ? 'Edit summary' : undefined}
          className={`-mx-2 block w-full rounded-sm border border-transparent px-2 py-1 text-left text-xl font-semibold leading-7 text-slate-950 ${
            canEdit ? 'transition hover:border-slate-300 hover:bg-slate-50' : 'cursor-default'
          }`}
        >
          {value}
        </button>
        {message ? <p className="mt-1 text-[0.7rem] text-rose-600">{message}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <textarea
        autoFocus
        rows={2}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); clearError(); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save(); }
          if (event.key === 'Escape') { setDraft(value); setOpen(false); clearError(); }
        }}
        className="w-full resize-y rounded-sm border border-slate-300 px-2 py-1 text-xl font-semibold leading-7 text-slate-950"
      />
      <EditActions onCommit={() => void save()} onCancel={() => { setDraft(value); setOpen(false); clearError(); }} busy={state === 'saving'} />
      {message ? <p className="mt-1 text-[0.7rem] text-rose-600">{message}</p> : null}
    </div>
  );
}
