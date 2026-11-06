import { useEffect, useRef, useState } from 'react';
import type { PinnedSnapshot, DeepReadonly } from '../../data/snapshot';
import type { Pedigree, P1Rules, SlotKey } from '../../domain/pedigree';
import { rankPedigreeCandidates } from '../../engine/pedigree-candidates';
import { APTITUDE_LABELS } from '../../engine/aptitude';
import { SLOT_LABELS } from './labels';

interface Props {
  slotKey: SlotKey;
  pedigree: Pedigree;
  snapshot: PinnedSnapshot;
  rules: DeepReadonly<P1Rules>;
  cutoffDate: string;
  onSelect: (costumeId: string) => void;
  onClose: () => void;
}

export default function CharacterPicker({ slotKey, pedigree, snapshot, rules, cutoffDate, onSelect, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const candidates = rankPedigreeCandidates(pedigree, slotKey, snapshot, rules, cutoffDate, query);
  useEffect(() => {
    const element = dialog.current;
    const returnFocus = document.activeElement;
    element?.showModal();
    search.current?.focus();
    return () => { element?.close(); if (returnFocus instanceof HTMLElement) returnFocus.focus(); };
  }, []);
  return <dialog className="character-picker" ref={dialog} aria-labelledby="picker-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDownCapture={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="picker-header"><div><p className="eyebrow">상성순 후보</p><h2 id="picker-title">{SLOT_LABELS[slotKey]} 선택</h2></div><button className="btn" onClick={onClose} aria-label="선택창 닫기">닫기</button></div>
    <div className="picker-search"><label htmlFor="character-query">이름·별칭 검색</label><input id="character-query" ref={search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="한국어 이름, 일본어 이름, 별칭" autoComplete="off" /></div>
    <p className="picker-note">{cutoffDate} 한국 출시 기준 · {candidates.length}개 의상<br />{rules.kind === 'fixture' ? '가상 상성 규칙의 비교값입니다.' : '중상작 이전 기본 상성을 비교합니다.'} 빈 슬롯은 현재 선택된 관계의 부분합으로 정렬합니다.</p>
    <ul className="candidate-list">{candidates.map((candidate) => {
      const costume = snapshot.costumes.find((item) => item.costumeId === candidate.costumeId)!;
      const character = snapshot.characters.find((item) => item.baseId === costume.baseId)!;
      const invalid = candidate.result.status === 'invalid';
      const missing = candidate.result.status === 'unavailable';
      const score = candidate.result.total ?? candidate.result.partialTotal;
      return <li key={candidate.costumeId}><button className="candidate-button" disabled={invalid} onClick={() => onSelect(candidate.costumeId)} data-testid={`candidate-${candidate.costumeId}`}>
        <span className="candidate-text"><strong>{character.nameKo}</strong><span>{costume.nameKo}</span><small>{Object.entries(costume.aptitudes).map(([key, grade]) => `${APTITUDE_LABELS[key as keyof typeof APTITUDE_LABELS]} ${grade}`).join(' · ')}</small>
          {candidate.availability.basis === 'forecast' && <span className="slot-forecast">미래시 · 변동 가능</span>}
          {invalid && <small className="candidate-error">{candidate.result.issues.join(' · ')}</small>}
        </span><span className="candidate-score">{invalid ? '선택 불가' : missing ? '자료 부족' : score}<small>{invalid || missing ? '' : candidate.result.status === 'complete' ? '기본 상성' : '선택분 부분합'}</small></span>
      </button></li>;
    })}</ul>
    {candidates.length === 0 && <p className="empty-candidates">검색 결과가 없습니다. 이름이나 기준일을 확인하세요.</p>}
  </dialog>;
}
