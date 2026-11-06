import { useState } from 'react';
import type { WorkspaceInputs } from '../../domain/saved-plan';
import { getLineageSlots, getProtectedNodeIds } from '../../domain/lineage';
import { confirmFactorBloodline, replaceFactorInstance } from '../../engine/plan-persistence';
import GameAssetImage from '../assets/GameAssetImage';

interface Props { inputs: WorkspaceInputs; nodeId: string; costumeName?: string; onChange: (value: WorkspaceInputs) => void }
export default function FactorInstanceEditor({ inputs, nodeId, costumeName, onChange }: Props) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const node = inputs.referencePlan.nodes[nodeId]!;
  const instance = inputs.factorInstances[nodeId];
  const locked = getProtectedNodeIds(inputs.referencePlan).has(nodeId);
  const slots = getLineageSlots(inputs.referencePlan);
  const label = slots.find(slot => slot.nodeId === nodeId)?.label ?? '선택 인자';
  const isMob = (slots.find(slot => slot.nodeId === nodeId)?.depth ?? 0) > 2;
  function run(action: () => WorkspaceInputs) {
    try { onChange(action()); setMessage(''); setPending(false); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : '인자 개체를 변경하지 못했습니다.'); }
  }
  return <section className="panel p8-instance" data-testid="p8-instance-editor" data-node-id={nodeId}>
    <h2>인자 기록</h2>
    <div className="p85-node-heading">{!isMob && <GameAssetImage kind="costume" id={node.costumeId} label={costumeName ?? label} />}<p>{label} · {isMob ? '모브' : costumeName ?? (node.costumeId ? '선택한 캐릭터·의상' : '캐릭터 미선택')}</p></div>
    {instance ? <><span data-testid="p8-factor-instance-id" data-instance-uuid={instance.factorInstanceId} />
      <p>백인자·별수는 스킬·서포트의 인자작 계획에서 관리합니다.</p>
      {instance.bloodlineStatus === 'unconfirmed' && <details data-testid="p8-bloodline-review"><summary>조상 연결 검토</summary><p>연결 미확인 · 현재 부모: {node.parentIds?.map(id => slots.find(slot => slot.nodeId === id)?.label ?? '조상').join(', ') ?? '31인 범위 밖'}</p>
        <button className="btn" disabled={node.costumeId === null} onClick={() => run(() => confirmFactorBloodline(inputs, nodeId))} data-testid="p8-confirm-bloodline">이 연결로 기록</button></details>}
    </> : <p>{isMob ? '모브의 적인자는 계보 카드에서 직접 설정합니다.' : '캐릭터·의상을 선택하면 이 위치의 인자를 별도로 관리합니다.'}</p>}
    {!isMob && <button className="btn" disabled={node.costumeId === null || locked} onClick={() => setPending(true)} data-testid="p8-replace-instance">인자 기록 새로 시작</button>}
    {locked && <p>고정 혈통은 개체를 교체할 수 없습니다. 기존 계보에서 해당 혈통의 고정을 명시적으로 해제하거나 별도 계획으로 관리하세요.</p>}
    {pending && <div className="p8-confirmation" role="alert"><p>새 개체 ID를 만들고 이 노드의 백인자·노드 목표·적인자를 비웁니다. 조상 정보는 보존하되 새 혈통으로 자동 인정하지 않습니다. 이전 인자를 남기려면 먼저 별도 계획으로 저장할 수 있습니다.</p>
      <button className="btn primary" data-testid="p8-confirm-replace-instance" onClick={() => run(() => replaceFactorInstance(inputs, nodeId))}>새 인자 개체로 교체 확인</button><button className="btn" onClick={() => setPending(false)}>교체 취소</button></div>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
