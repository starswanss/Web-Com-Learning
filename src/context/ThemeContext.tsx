'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeCtx { theme: Theme; toggle: () => void; isLight: boolean }

const ThemeContext = createContext<ThemeCtx>({ theme: 'dark', toggle: () => {}, isLight: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('lms_theme') as Theme | null;
    if (saved === 'light' || saved === 'dark') setTheme(saved);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    localStorage.setItem('lms_theme', theme);
  }, [theme, mounted]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggle, isLight: theme === 'light' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
