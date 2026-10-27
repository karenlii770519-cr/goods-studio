import { describe, expect, it } from 'vitest';
import { exportReadme } from '../src/lib/exporter';
import { defaultOptions } from '../src/lib/products';
import { migrateProject, newProject, swapSides } from '../src/lib/project';
import type { Project, ProjectOptions } from '../src/lib/types';

function legacyCard(): Project {
  const p = newProject('card', '舊卡片');
  const options = { ...p.options } as ProjectOptions;
  delete options.lamination;
  delete options.backLamination;
  options.bleed = 5;
  options.substrate = 'holo';
  options.inkClarity = 0.4;
  return { ...p, options, backLayers: [] };
}

describe('表面覆膜預設與舊檔遷移', () => {
  it('新作品正面亮膜、背面霧膜', () => {
    const p = newProject('tradingcard', '閃卡');
    expect(p.options.lamination).toBe('gloss');
    expect(p.options.backLamination).toBe('matte');
    expect(defaultOptions('card')).toMatchObject({ lamination: 'gloss', backLamination: 'matte' });
    expect(defaultOptions('postcard').backLamination).toBe('matte');
    expect(defaultOptions('acrylic-charm').lamination).toBe('gloss');
  });

  it('舊檔沒有覆膜欄位時補上預設，其他設定保留', () => {
    const m = migrateProject(legacyCard());
    expect(m.options.lamination).toBe('gloss');
    expect(m.options.backLamination).toBe('matte');
    expect(m.options.bleed).toBe(5);
    expect(m.options.substrate).toBe('holo');
    expect(m.options.inkClarity).toBe(0.4);
    expect(m.name).toBe('舊卡片');
    expect(m.backLayers).toEqual([]);
  });

  it('不合法的覆膜值會回到預設', () => {
    const p = legacyCard();
    (p.options as { lamination?: string }).lamination = 'satin';
    (p.options as { backLamination?: string }).backLamination = '';
    const m = migrateProject(p);
    expect(m.options.lamination).toBe('gloss');
    expect(m.options.backLamination).toBe('matte');
  });

  it('已儲存的覆膜選擇不會被預設蓋掉', () => {
    const p = newProject('polaroid');
    p.options.lamination = 'matte';
    p.options.backLamination = 'gloss';
    const m = migrateProject(p);
    expect(m.options.lamination).toBe('matte');
    expect(m.options.backLamination).toBe('gloss');
    expect(m.options.bleed).toBe(defaultOptions('polaroid').bleed);
  });

  it('正反面互換會交換覆膜，互換兩次回到原樣', () => {
    const p = newProject('bookmark');
    p.options.lamination = 'gloss';
    p.options.backLamination = 'matte';
    p.options.background = '#112233';
    p.options.backBackground = '#abcdef';
    const once = swapSides(p);
    expect(once.options.lamination).toBe('matte');
    expect(once.options.backLamination).toBe('gloss');
    const twice = swapSides(once);
    expect(twice.options.lamination).toBe('gloss');
    expect(twice.options.backLamination).toBe('matte');
    expect(twice.options.background).toBe('#112233');
    expect(twice.options.backBackground).toBe('#abcdef');
  });

  it('舊檔互換兩次仍保持未設定的覆膜欄位', () => {
    const p = legacyCard();
    const twice = swapSides(swapSides(p));
    expect(twice.options.lamination).toBeUndefined();
    expect(twice.options.backLamination).toBeUndefined();
    expect(migrateProject(twice).options).toMatchObject({ lamination: 'gloss', backLamination: 'matte' });
  });
});

describe('匯出說明', () => {
  it('註明正反面覆膜', () => {
    const p = newProject('card', '月亮卡');
    p.options.lamination = 'matte';
    p.options.backLamination = 'gloss';
    const text = exportReadme(p, [{ name: '月亮卡_印刷.png', label: '印刷層（透明 PNG）' }]);
    expect(text).toContain('表面覆膜：正面 霧膜');
    expect(text).toContain('表面覆膜：背面 亮膜');
    expect(text).toContain('月亮卡_印刷.png：印刷層（透明 PNG）');
    expect(text).toContain('不會改印刷檔的顏色');
  });

  it('沒有背面的品項只寫正面', () => {
    const p = newProject('badge', '徽章');
    p.options.lamination = 'gloss';
    const text = exportReadme(p, []);
    expect(text).toContain('表面覆膜：正面 亮膜');
    expect(text).not.toContain('背面');
  });

  it('說明裡的覆膜沿用遷移後的預設', () => {
    const text = exportReadme(migrateProject(legacyCard()), []);
    expect(text).toContain('表面覆膜：正面 亮膜');
    expect(text).toContain('表面覆膜：背面 霧膜');
  });
});
