import { useState } from 'react';
import { activeSnapshot as snapshot } from '../data/snapshot';
import { filterAvailableReleases, resolveEvaluationContext } from '../engine/availability';

type Mode = 'tournament' | 'current';

export default function DataDiagnostics({ onShowPedigree }: { onShowPedigree: () => void }) {
  const [mode, setMode] = useState<Mode>('tournament');
  const [eventId, setEventId] = useState(snapshot.tournaments[0]?.eventId ?? '');
  const tournament = snapshot.tournaments.find((event) => event.eventId === eventId);
  const context = resolveEvaluationContext({ mode, now: new Date(), tournament });
  const supports = filterAvailableReleases(
    snapshot.releases.filter((release) => release.entityType === 'support'),
    context,
  );

  return (
    <>
      <header className="site-header">
        <div className="shell header-content">
          <a className="brand" href="#main"><span className="brand-mark" aria-hidden="true">系</span>인자 설계 연구소</a>
          <div className="header-actions"><button className="btn" onClick={onShowPedigree}>계보 설계로</button><span className="phase">P0 · 개발 기반</span></div>
        </div>
      </header>
      <main id="main" className="shell">
        <div className="fixture-notice" role="note">
          <strong>개발용 fixture · 실제 게임 데이터 아님</strong>
          <span>아래 이름·일정·능력치는 모두 가상입니다. 게임 내 판단에 사용하지 마세요.</span>
        </div>

        <div className="intro">
          <p className="eyebrow">한국 서버 인자 설계 도구</p>
          <h1>출시 시점 기준 확인</h1>
          <p>실제 데이터 연결에 앞서, 대회 시점과 현재 시점의 콘텐츠 구분을 검증합니다.</p>
        </div>

        <section className="panel controls-panel" aria-labelledby="context-title">
          <div className="section-heading"><h2 id="context-title">데이터 기준</h2><span className="timezone">Asia/Seoul</span></div>
          <div className="controls">
            <div className="field"><label htmlFor="tournament-select">선택 대회</label>
              <select id="tournament-select" value={eventId} onChange={(event) => setEventId(event.target.value)}>
                {snapshot.tournaments.map((event) => (
                  <option key={event.eventId} value={event.eventId}>
                    {event.nameKo}{event.dateStatus === 'forecast' ? ' · 예상 대회' : ' · 확정'}
                  </option>
                ))}
              </select>
            </div>
            <div className="field"><label htmlFor="mode-select">출시 판단 시점</label>
              <select id="mode-select" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                <option value="tournament">선택 대회 시작일 기준 (기본)</option>
                <option value="current">현재 시점 기준</option>
              </select>
            </div>
            <div className="cutoff"><span>적용 기준일</span><strong data-testid="cutoff-date">{context.cutoffDate}</strong>
              <small>{mode === 'tournament' && context.tournamentDateStatus === 'forecast' ? '예상 대회 일정 · 변동 가능' : '한국 현지 날짜 기준'}</small>
            </div>
          </div>
          <p className="caption">확정 출시일을 우선 적용합니다. 한국 일정이 없는 항목은 일본 출시 여부와 관계없이 제외합니다.</p>
        </section>

        <div className="workspace">
          <section className="panel release-panel" aria-labelledby="release-title">
            <div className="section-heading"><h2 id="release-title">서포트 출시 필터</h2><span className="count">가상 {supports.all.length}개</span></div>
            <div className="metrics" aria-live="polite">
              <div><span>확정 포함</span><strong data-testid="confirmed-count">{supports.confirmed.length}</strong></div>
              <div><span>미래시 포함</span><strong data-testid="forecast-count">{supports.forecast.length}</strong></div>
              <div><span>제외</span><strong data-testid="excluded-count">{supports.excluded.length}</strong></div>
            </div>
            <ul className="release-list">
              {supports.all.map((row) => {
                const support = snapshot.supports.find((item) => item.supportId === row.release.entityId);
                const label = row.available
                  ? row.basis === 'forecast' ? '미래시 포함 · 변동 가능' : '확정 포함'
                  : row.basis === 'unknown' ? '한국 일정 미확인 · 제외' : '기준일 이후 · 제외';
                return (
                  <li key={row.release.releaseId} className="release-row" data-testid="release-row">
                    <div className="card-icon" aria-hidden="true">{support?.rarity}</div>
                    <div className="release-name"><strong>{support?.nameKo ?? row.release.entityId}</strong><span>{row.effectiveDate ?? '한국 출시일 없음'}{row.basis === 'forecast' ? ' · 예상 출시' : row.basis === 'confirmed' ? ' · 확정 출시' : ''}</span></div>
                    <span className={`status ${row.available ? row.basis : 'excluded'}`}>{label}</span>
                  </li>
                );
              })}
            </ul>
            <p className="caption">날짜 단위 검증 화면입니다. 같은 날의 출시 시각과 실제 스킬·카드 성능은 아직 판정하지 않습니다.</p>
          </section>

          <aside className="panel snapshot-panel" aria-labelledby="snapshot-title">
            <div className="section-heading"><h2 id="snapshot-title">고정 데이터 스냅샷</h2><span className="validation">검증 통과</span></div>
            <dl>
              <dt>스냅샷 ID</dt><dd>{snapshot.snapshotId}</dd>
              <dt>데이터 버전</dt><dd>{snapshot.datasetVersion}</dd>
              <dt>스키마 버전</dt><dd>v{snapshot.schemaVersion}</dd>
              <dt>종류</dt><dd>가상 fixture</dd>
            </dl>
            <p className="caption">입력 시 스키마·참조 관계를 검증하고, 같은 화면의 모든 계산에 이 버전을 고정합니다.</p>
            <div className="next-step"><strong>P0 출시 필터 검증</strong><p>P0의 원래 fixture를 그대로 사용하는 독립 검증 화면입니다.</p></div>
            <details><summary>fixture 출처 정보</summary>{snapshot.sources.map((source) => (
              <div key={source.sourceId} className="source"><strong>{source.title}</strong><span>검증일 {source.accessedAt} · {source.evidence}</span><span>{source.url}</span></div>
            ))}</details>
          </aside>
        </div>
        
      </main>
    </>
  );
}
