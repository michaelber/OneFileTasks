import { useState, useCallback, useEffect } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '../types';

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('appSettings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const setSettings = useCallback((newSettings: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setSettingsState(prev => {
      const updated = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
      localStorage.setItem('appSettings', JSON.stringify(updated));
      return updated;
    });
  }, []);

  useEffect(() => {
    // Apply theme
    if (settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Apply accent color
    if (settings.accentColor.startsWith('#')) {
      document.documentElement.setAttribute('data-accent', 'custom');
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : null;
      };
      const mixColors = (color1: {r: number, g: number, b: number}, color2: {r: number, g: number, b: number}, weight: number) => {
        return `#${Math.round(color1.r * weight + color2.r * (1 - weight)).toString(16).padStart(2, '0')}${Math.round(color1.g * weight + color2.g * (1 - weight)).toString(16).padStart(2, '0')}${Math.round(color1.b * weight + color2.b * (1 - weight)).toString(16).padStart(2, '0')}`;
      };
      
      const rgb = hexToRgb(settings.accentColor);
      if (rgb) {
        const white = {r: 255, g: 255, b: 255};
        const black = {r: 0, g: 0, b: 0};
        document.documentElement.style.setProperty('--accent-50', mixColors(rgb, white, 0.1));
        document.documentElement.style.setProperty('--accent-100', mixColors(rgb, white, 0.2));
        document.documentElement.style.setProperty('--accent-200', mixColors(rgb, white, 0.4));
        document.documentElement.style.setProperty('--accent-300', mixColors(rgb, white, 0.6));
        document.documentElement.style.setProperty('--accent-400', mixColors(rgb, white, 0.8));
        document.documentElement.style.setProperty('--accent-500', settings.accentColor);
        document.documentElement.style.setProperty('--accent-600', mixColors(rgb, black, 0.8));
        document.documentElement.style.setProperty('--accent-700', mixColors(rgb, black, 0.6));
        document.documentElement.style.setProperty('--accent-800', mixColors(rgb, black, 0.4));
        document.documentElement.style.setProperty('--accent-900', mixColors(rgb, black, 0.2));
        document.documentElement.style.setProperty('--accent-950', mixColors(rgb, black, 0.1));
      }
    } else {
      document.documentElement.setAttribute('data-accent', settings.accentColor);
      [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].forEach(i => {
        document.documentElement.style.removeProperty(`--accent-${i}`);
      });
    }
  }, [settings.theme, settings.accentColor]);

  return { settings, setSettings };
}
