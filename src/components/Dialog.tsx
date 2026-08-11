import { useState } from 'react';

/**
 * In-app replacements for window.prompt/confirm. Native dialogs are blocked
 * in some embedded/preview browser contexts, so all driver-management
 * actions route through here instead.
 */

interface PromptProps {
  title: string;
  initial?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}

export function PromptDialog({ title, initial = '', confirmLabel = 'Save', onCancel, onSubmit }: PromptProps) {
  const [value, setValue] = useState(initial);
  const submit = () => {
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 12 }}>{title}</h2>
        <input
          className="text-input"
          style={{ width: '100%' }}
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost small" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn small" disabled={!value.trim()} onClick={submit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onCancel, onConfirm }: ConfirmProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 8 }}>{title}</h2>
        <p className="muted">{message}</p>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost small" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn small" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
