import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReferenceSnapshot } from '../../domain/reference';
import type { DeepReadonly } from '../../data/snapshot';
import type { Pedigree, SlotKey } from '../../domain/pedigree';
import { rankReferenceCandidates } from '../../engine/reference-candidates';
import { SLOT_LABELS } from '../pedigree/labels';
import CostumeGallery from './CostumeGallery';
import { matchesNameQuery } from '../name-search';

interface Props {
  slotKey: SlotKey;
  pedigree: Pedigree;
  snapshot: DeepReadonly<ReferenceSnapshot>;
  cutoffDate: string;
  includeUnknown: boolean;
  allowForecast: boolean;
  allowUnverifiedFormula: boolean;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  selectionIssue?: (id: string) => string | undefined;
}

export default function ReferencePicker(props: Props) {
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const { pedigree, slotKey, snapshot, cutoffDate, includeUnknown, allowForecast, allowUnverifiedFormula } = props;
  const ranked = useMemo(() => rankReferenceCandidates(pedigree, slotKey, snapshot, cutoffDate, {
    includeUnknown, allowForecast, allowUnverifiedFormula,
  }), [pedigree, slotKey, snapshot, cutoffDate, includeUnknown, allowForecast, allowUnverifiedFormula]);
  const candidates = ranked.filter(candidate => {
    const costume = snapshot.costumes.find(row => row.costumeId === candidate.costumeId)!;
    const character = snapshot.characters.find(row => row.baseId === costume.baseId);
    return matchesNameQuery(query, [costume.displayName, costume.nameKo, costume.nameJa, costume.outfitKo, costume.outfitJa, ...costume.aliases, character?.nameKo, character?.nameJa, ...(character?.aliases ?? [])], [costume.costumeId, costume.baseId]);
  });
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal(); search.current?.focus();
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="character-picker p86-costume-picker" aria-labelledby="reference-picker-title"
    onCancel={(event) => { event.preventDefault(); props.onClose(); }}
    onKeyDownCapture={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onClose(); } }}>
    <div className="picker-header"><div><p className="eyebrow">육성마 · 의상</p><h2 id="reference-picker-title">{SLOT_LABELS[props.slotKey]} 선택</h2></div><button className="btn" onClick={props.onClose}>닫기</button></div>
    <div className="picker-search"><label htmlFor="reference-search">캐릭터·의상·별칭 검색</label><input id="reference-search" ref={search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" /></div>
    <p className="picker-note">{candidates.length}개 의상 · {props.allowUnverifiedFormula ? '공개식 기본 상성순' : '이름순'} · 출시 조건은 현재 설정을 따릅니다.</p>
    <CostumeGallery prefix="ref" selectedId={pedigree[slotKey].costumeId} entries={candidates.map((candidate) => ({ costume: props.snapshot.costumes.find((row) => row.costumeId === candidate.costumeId)!, availability: candidate.availability, selectionIssue: props.selectionIssue?.(candidate.costumeId),
      ...(props.allowUnverifiedFormula ? { contribution: candidate.result.status === 'invalid' || candidate.result.status === 'unavailable' ? null : candidate.result.previewContribution } : {}) }))} onSelect={props.onSelect} onReset={() => setQuery('')} />
  </dialog>;
}
