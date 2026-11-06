import { useEffect, useState } from 'react';
const key = 'uma-theme-v1';
const systemTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? systemTheme());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => { try { if (localStorage.getItem(key)) return; } catch { /* OS preference still works without storage. */ } setTheme(systemTheme()); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return <button type="button" className="btn p871-theme-toggle" aria-label={theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'} aria-pressed={theme === 'dark'} onClick={() => {
    const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next);
    try { localStorage.setItem(key, next); } catch { /* Apply this session without altering plan storage. */ }
  }}>{theme === 'dark' ? '☀ 라이트' : '☾ 다크'}</button>;
}
