import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { getP3Availability } from '../../src/engine/support-acquisition';
describe.runIf(existsSync('data/local/p3-skill-support.json'))('expanded local P3 data',()=>{
  const data=validateP3Snapshot(JSON.parse(readFileSync('data/local/p3-skill-support.json','utf8')));
  it('retains actual IDs, current sentinels and owned event choices',()=>{
    expect(data.skills).toHaveLength(2223);expect(data.supports).toHaveLength(566);
    expect(data.supports.some(s=>s.supportId==='30323')).toBe(true);
    expect(data.skills.some(s=>s.skillId==='104503121')).toBe(true);
    expect(data.supportEvents!.length).toBeGreaterThan(2000);
    expect(data.supportEvents!.some(e=>e.choices.some(c=>c.skills.length>0))).toBe(true);
  });
  it('does not promote secondary dates or forecasts to official evidence',()=>{
    const apps=data.applications.filter(a=>a.entityType==='support');
    expect(apps.filter(a=>a.kr.observedDate)).toHaveLength(469);
    expect(apps.filter(a=>a.kr.forecastDate)).toHaveLength(97);
    expect(apps.every(a=>a.kr.confirmedDate===null)).toBe(true);
    const future=apps.find(a=>a.kr.forecastDate!>'2026-11-05')!;
    expect(getP3Availability(data,'support',future.entityId,'2026-11-05',false).state).toBe('unknown');
    expect(getP3Availability(data,'support',future.entityId,'2026-11-05',true).state).toBe('unavailable');
  });
  it('preserves explicit prerequisite relations and reference-only research',()=>{
    expect(data.skillRelations.filter(r=>r.relation==='lower_skill')).toHaveLength(415);
    expect(data.research!.length).toBeGreaterThan(17000);
    expect(data.research!.every(r=>r.status==='context-unverified')).toBe(true);
    expect(data.tournaments.every(t=>t.server!=='JP')).toBe(true);
  });
  it('does not backdate observed skills to a card original release',()=>{
    const app=data.applications.find(a=>a.entityType==='skill'&&a.kr.releasedBy)!;
    expect(getP3Availability(data,'skill',app.entityId,'2026-11-04',true).state).toBe('unknown');
    expect(getP3Availability(data,'skill',app.entityId,'2026-11-05',true).state).toBe('available');
  });
});
