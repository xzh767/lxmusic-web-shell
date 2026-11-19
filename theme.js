/*
 * LX Music Web Shell — theme engine.
 *
 * Ported from the official LX Music theme system:
 *   lx-music-desktop: src/common/theme/{utils,createThemes}.js
 *   lx-music-mobile:  src/theme/themes/utils.js
 *
 * A theme derives a full color scale from one primary color using
 * RGB_Linear_Shade (same formula as LX), then exposes everything as CSS
 * variables on <html>. Switching themes at runtime is instant.
 */
(() => {
  'use strict';

  /* ---- color math (LX's RGB_Linear_Shade / RGB_Alpha_Shade) ---- */

  function parseRgb(color) {
    const m = String(color).match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0];
    const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }

  function toRgbString([r, g, b]) {
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }

  function toRgbaString([r, g, b], alpha) {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
  }

  // LX: RGB_Linear_Shade — linear interpolation toward black (percent<0) or white (percent>0)
  function linearShade(percent, color) {
    const [r, g, b] = parseRgb(color);
    const p = Math.abs(percent);
    const dir = percent < 0 ? 0 : 255;
    return [
      r + (dir - r) * p,
      g + (dir - g) * p,
      b + (dir - b) * p,
    ];
  }

  /* ---- theme creation (LX createThemeColors) ---- */

  function createThemeColors(rgbaColor, fontRgbaColor, isDark) {
    const colors = {};
    colors['--color-primary'] = toRgbString(parseRgb(rgbaColor));

    let pre = parseRgb(rgbaColor);
    for (let i = 1; i < 11; i += 1) {
      pre = linearShade(isDark ? 0.2 : -0.1, toRgbString(pre));
      colors[`--color-primary-dark-${i * 100}`] = toRgbString(pre);
    }
    pre = parseRgb(rgbaColor);
    for (let i = 1; i < 10; i += 1) {
      pre = linearShade(isDark ? -0.1 : 0.2, toRgbString(pre));
      colors[`--color-primary-light-${i * 100}`] = toRgbString(pre);
    }
    pre = linearShade(isDark ? -0.35 : 1, toRgbString(pre));
    colors['--color-primary-light-1000'] = toRgbString(pre);

    // alpha scales (LX: RGB_Alpha_Shade(0.1 * j) → alpha-100 = 0.1 … alpha-1000 = 1.0)
    const withAlpha = (name, rgb, steps = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) => {
      steps.forEach((step) => {
        colors[`${name}-alpha-${step}`] = toRgbaString(rgb, step / 1000);
      });
    };
    withAlpha('--color-primary', parseRgb(rgbaColor));
    withAlpha('--color-primary-dark-100', parseRgb(colors['--color-primary-dark-100']));
    withAlpha('--color-primary-dark-300', parseRgb(colors['--color-primary-dark-300']));
    withAlpha('--color-primary-light-100', parseRgb(colors['--color-primary-light-100']));
    withAlpha('--color-primary-light-300', parseRgb(colors['--color-primary-light-300']));
    withAlpha('--color-primary-light-500', parseRgb(colors['--color-primary-light-500']));
    withAlpha('--color-primary-light-700', parseRgb(colors['--color-primary-light-700']));
    withAlpha('--color-primary-light-1000', parseRgb(colors['--color-primary-light-1000']));

    colors['--color-theme'] = isDark ? colors['--color-primary-light-900'] : colors['--color-primary'];

    // font scale (LX createFontColors): from font color, -0.05 per step in dark mode
    const font = parseRgb(fontRgbaColor || (isDark ? 'rgb(229, 229, 229)' : 'rgb(33, 33, 33)'));
    colors['--color-font'] = toRgbString(font);
    let preFont = font;
    const step = isDark ? -0.05 : 0.05;
    for (let i = 1; i < 21; i += 1) {
      preFont = linearShade(step, toRgbString(preFont));
      colors[`--color-font-${String(1000 - 50 * i).padStart(3, '0')}`] = toRgbString(preFont);
    }
    return colors;
  }

  /* ---- official LX themes (subset of createThemes.js) ---- */

  const THEMES = [
    {
      id: 'black',
      name: '黑灯瞎火',
      isDark: true,
      primary: 'rgb(150, 150, 150)',
      font: 'rgb(229, 229, 229)',
      vars: {
        '--color-app-background': 'rgba(0, 0, 0, 0)',
        '--color-main-background': 'rgba(19, 19, 19, 0.9)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
    {
      id: 'green',
      name: '绿意盎然',
      isDark: false,
      primary: 'rgb(77, 175, 124)',
      font: 'rgb(33, 33, 33)',
      vars: {
        '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
        '--color-main-background': 'rgba(255, 255, 255, 1)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
    {
      id: 'blue',
      name: '蓝田生玉',
      isDark: false,
      primary: 'rgb(52, 152, 219)',
      font: 'rgb(33, 33, 33)',
      vars: {
        '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
        '--color-main-background': 'rgba(255, 255, 255, 1)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
    {
      id: 'blue_plus',
      name: '蛋雅深蓝',
      isDark: false,
      primary: 'rgb(77, 131, 175)',
      font: 'rgb(33, 33, 33)',
      vars: {
        '--color-app-background': 'var(--color-primary-light-600-alpha-600)',
        '--color-main-background': 'rgba(255, 255, 255, 1)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
    {
      id: 'orange',
      name: '橙黄橘绿',
      isDark: false,
      primary: 'rgb(245, 171, 53)',
      font: 'rgb(33, 33, 33)',
      vars: {
        '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
        '--color-main-background': 'rgba(255, 255, 255, 1)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
    {
      id: 'red',
      name: '热情似火',
      isDark: false,
      primary: 'rgb(214, 69, 65)',
      font: 'rgb(33, 33, 33)',
      vars: {
        '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
        '--color-main-background': 'rgba(255, 255, 255, 1)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
    {
      id: 'pink',
      name: '粉装玉琢',
      isDark: false,
      primary: 'rgb(241, 130, 141)',
      font: 'rgb(33, 33, 33)',
      vars: {
        '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
        '--color-main-background': 'rgba(255, 255, 255, 1)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
    {
      id: 'purple',
      name: '重斤球紫',
      isDark: false,
      primary: 'rgb(155, 89, 182)',
      font: 'rgb(33, 33, 33)',
      vars: {
        '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
        '--color-main-background': 'rgba(255, 255, 255, 1)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
    {
      id: 'ming',
      name: '青出于黑',
      isDark: false,
      primary: 'rgb(51, 110, 123)',
      font: 'rgb(33, 33, 33)',
      vars: {
        '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
        '--color-main-background': 'rgba(255, 255, 255, 1)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
    {
      id: 'blue2',
      name: '清热板蓝',
      isDark: false,
      primary: 'rgb(79, 98, 208)',
      font: 'rgb(33, 33, 33)',
      vars: {
        '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
        '--color-main-background': 'rgba(255, 255, 255, 1)',
        '--color-nav-font': 'var(--color-primary)',
      },
    },
  ];

  const STORAGE_KEY = 'lx-web-shell-theme-v1';

  function applyTheme(id) {
    const theme = THEMES.find((t) => t.id === id) || THEMES[0];
    const colors = createThemeColors(theme.primary, theme.font, theme.isDark);
    const root = document.documentElement;
    // clear previous theme variables
    [...root.style].forEach((name) => {
      if (name.startsWith('--')) root.style.removeProperty(name);
    });
    Object.entries(colors).forEach(([k, v]) => root.style.setProperty(k, v));
    Object.entries(theme.vars || {}).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute('data-theme', theme.id);
    root.setAttribute('data-dark', theme.isDark ? 'true' : 'false');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.content = theme.isDark ? '#131313' : colors['--color-primary-light-500'];
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch { /* ignore */ }
    return theme;
  }

  function init() {
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch { /* ignore */ }
    applyTheme(saved || 'black');
  }

  window.LX_THEME = {
    THEMES,
    applyTheme,
    get current() {
      const id = document.documentElement.getAttribute('data-theme');
      return THEMES.find((t) => t.id === id) || THEMES[0];
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
