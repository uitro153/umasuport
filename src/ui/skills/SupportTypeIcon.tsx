import { normalizeSupportType, supportTypeLabel } from './support-filters';

/** Small code-native training pictograms; game art remains the original icon. */
export default function SupportTypeIcon({ type }: { type: string }) {
  const key = normalizeSupportType(type);
  const paths: Record<string, string> = {
    speed: 'M3 16h17v4H3z M5 5h5l1 5 7 4H5z M12 7l4-2',
    stamina: 'M12 20 4 12C-1 6 7 1 12 7c5-6 13-1 8 5z',
    power: 'M3 8h3v8H3z M18 8h3v8h-3z M6 11h12v2H6z M1 10h2v4H1z M21 10h2v4h-2z',
    guts: 'M12 2c2 5-2 5 1 8 2-1 3-3 3-5 6 7 7 15-4 17C1 20 3 10 8 6c-1 4 0 6 1 7 4-4 0-5 3-11z',
    intelligence: 'M2 7 12 3l10 4-10 4z M6 11v6c4 3 8 3 12 0v-6 M22 8v9',
    friend: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M4 22v-4a8 8 0 0 1 16 0v4z',
    group: 'M8 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6 M17 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6 M1 21v-3a7 7 0 0 1 14 0v3z M16 14c4-1 7 2 7 5v2h-6',
  };
  return <span className={`p86-type-icon p86-type-${key}`} data-support-type={key} aria-label={supportTypeLabel(type)} title={supportTypeLabel(type)}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[key] ?? paths.friend} /></svg><span className="visually-hidden">{supportTypeLabel(type)}</span></span>;
}
