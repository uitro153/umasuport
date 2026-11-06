import { useEffect } from 'react';
export default function ActionNotice({ message, kind = 'success', onDismiss }: { message: string; kind?: 'success' | 'error' | 'info'; onDismiss: () => void }) {
  useEffect(() => {
    if (!message || kind !== 'success') return;
    const timer = window.setTimeout(onDismiss, 3000);
    return () => window.clearTimeout(timer);
  }, [message, kind, onDismiss]);
  return message ? <p className={`p871-notice p871-notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{message}</p> : null;
}
