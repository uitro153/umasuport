import type { Locator } from '@playwright/test';
/** Real computed text/background composites, including translucent ancestors. Images are not altered. */
export async function auditTextContrast(scope: Locator) {
  return scope.evaluate(root => {
    const color = (value: string) => { const n = value.match(/[\d.]+/g)?.map(Number) ?? []; return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1]; };
    const mix = (top: number[], bottom: number[]) => [0, 1, 2].map(i => top[i]! * top[3]! + bottom[i]! * (1 - top[3]!)).concat(1);
    const lum = (rgb: number[]) => rgb.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i]!, 0);
    const rows: { text: string; ratio: number; threshold: number; selector: string; foreground: string; background: number[] }[] = [];
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (!(element instanceof HTMLElement) || ['OPTION','SCRIPT','STYLE'].includes(element.tagName) || element.closest('.visually-hidden,.screen-reader-status')) continue;
      const text = Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
      if (!text || !element.getClientRects().length) continue;
      const style = getComputedStyle(element); if (style.visibility !== 'visible' || style.opacity === '0') continue;
      const ancestors: Element[] = []; for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
      const background = ancestors.reduce((bg, node) => mix(color(getComputedStyle(node).backgroundColor), bg), [255,255,255,1]);
      const foreground = mix(color(style.color), background); const a = lum(foreground); const b = lum(background);
      const ratio = (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
      const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700;
      rows.push({ text: text.slice(0,60), ratio: Math.round(ratio * 100) / 100, threshold: large ? 3 : 4.5,
        selector: `${element.tagName}.${element.className}`, foreground: style.color, background });
    }
    return { count: rows.length, minimum: Math.min(...rows.map(row => row.ratio)), failures: rows.filter(row => row.ratio < row.threshold) };
  });
}
