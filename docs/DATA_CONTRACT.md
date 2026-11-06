# P0 데이터 계약

## P8.7.3 수동 모브 계보

P8 V1의 필드·버전·UUID·31노드 연결은 유지한다. 깊이3/4의 노드는 화면·PNG에서 모브로 표시하고 실제 캐릭터 선택을 제공하지 않는다. 과거 `costumeId`·실제 기록은 삭제하지 않고 보존하지만 캐릭터 중복·출시·기본 적성의 판단 기준으로 사용하지 않는다. 7인 상성은 상위7인의 실제 캐릭터를 기준으로 계산한다. 모브 계획의 인자·혈통 고정은 캐릭터가 없어도 허용하며 실제 개체 생성으로 해석하지 않는다. 새 수동 계획의 기본값은3성, 기존 실제1/2성은 보존한다. 자동 배분 UI·입력은 제거했으며 독립 엔진은 남겨 두었다. 이전 절의 자동 배분 설명은 당시 이력이다.

## P8.7.2 개인 설정·계획 인자

계보 카드의 새 계획 선택은3성이다. 기존 선택된 인자 개체의1/2성은 유지하며, 별수 상세는 페이지 영역에서 명시적으로 편집한다. 소유자 미정 조상의 자동 배분 결과는 계획 인자이며 실제 캐릭터/UUID를 새로 만들지 않는다. 배분의1~3성 최적화 정책은 유지한다.

`uma-user-quick-skills-v1` 키는 유지하고 환경설정 값은 형식2(`userEdited` 표시)로 전환한다. 형식1의 정확한 옛 기본5개와 순서가 일치하고 편집 표시가 없는 경우만 한 번 비운다. 추가·삭제·정렬·명시적 편집은 보존한다. 이 변경은 P8 V1 계획·실제 스킬 목표와 독립적이다.

## P8.7.1 호환 범위

P8 V1의 필드 형태와 UUID는 유지하고 전역·노드 스킬 목표의 상한만 10개로 확장했다. 기존 0~5개 계획을 그대로 읽으며 10개 초과를 잘라내지 않고 거부한다. `lineageDesign`의 옛 로테이션·유전자 필드는 보존하지만 현재 배분과 저장 계획 비교의 계산 입력으로 사용하지 않는다.

계보의 구조 검증과 게임상 캐릭터 유효성 검증은 분리한다. canonical 본체 기준 직접 부모/자식 및 부모 쌍 중복은 금지하고 다른 가지 재사용은 허용한다. 옛 잘못된 계획은 읽기·백업·수정을 허용하며 정상 계산/추천으로 표시하지 않는다. 테마(`uma-theme-v1`)와 빠른 선택(`uma-user-quick-skills-v1`)은 V1 밖의 개인 환경설정이다. 새 빠른 선택은 비어 있고 기존 목록은 보존한다. [현재 수정 결과](P871_CHANGES.md)를 따른다.

## P8.7 사용자 조작·개인 환경설정 (당시 이력)

캐릭터·의상·카드·스킬 검색은 이름과 별칭만 사용한다. DB ID는 사용자 검색 대상과 안내에서 제외하며 데이터 연결·이미지 매핑·저장 JSON의 키로만 유지한다. 내부 상성 후보 계산에는 사용자 검색어를 넘기지 않고 표시 계층에서 이름으로만 검색하므로 계산·정렬 정책은 유지한다.

개인 빠른 선택 목록은 `uma-user-quick-skills-v1` 로컬 환경설정으로 관리한다. P8 V1의 필드·UUID·목표 5개 한도·JSON 복원 계약에는 추가하지 않는다. 목록에서 삭제해도 이미 지정한 목표는 유지한다. 현재 구현·검증은 [P8.7 보고서](P87_USER_FLOW_VALIDATION.md)를 따른다.

## P8.6 통합 계보·갤러리·기본 PNG 표시 계층 (당시 이력)

P0～P8.5 원본 게임 JSON·SQLite, 상성·7인 배치·31인 적인자 배분·P6/P7 추천 엔진과 `uma-saved-plan` V1을 유지한다. 동일한 `LineagePlan`의 31노드를 7인/31인으로 접고 펼치며, 표시 전환은 `parentIds`·인자 UUID·소유자·기록·잠금·목표를 변경하지 않는다. 접힘·줌·패닝·갤러리 검색/필터는 저장 입력에 추가하지 않는다. 7인 배치와 31인 배분은 서로 다른 기존 호출·미리보기·취소·명시 적용 및 입력 서명 검사를 사용한다.

`src/ui/lineage/tree-geometry.ts`의 공통 지오메트리를 통합 트리와 기본 계보 PNG에서 재사용한다. 기본 출력은 7인/31인 트리 및 실제 서포트 6장과 현재 검증된 스킬 수급표다. 수급표는 현재 추천의 양립 경로를 사용하고 과거 `resultSnapshot`이나 잠재 경로 합집합을 현재 획득으로 승격하지 않는다. 이미지·Blob 비동기 서명과 Canvas 한도는 출력 계층에서 유지한다.

기본 갤러리·계보·편성·PNG에서 기술적 ID·UUID·규격·장문 출처를 숨기되 원본 필드는 삭제하지 않는다. canonical ID 검색, 명시적 기술 상세, JSON/감사 기록과 이미지 매니페스트에서 계속 확인한다. 의상272종·서포트566장의 기존 이미지 매핑을 재사용하며 새 게임 자료를 수집하지 않는다. 공개 승인0/보류838개의 로컬 전용 경계와 일반 공개 빌드 차단도 그대로다. 실제 회귀·화면·PNG 검증 결과는 [P8.6 통합 검증 보고서](P86_INTEGRATED_UX_OUTPUT_VALIDATION.md)를 따른다.

## P8.5 표시용 이미지 계약 · 저장/게임 계약과 분리

`src/domain/game-assets.ts`의 `uma-presentation-assets` V1은 이미지용 독립 계약이다. `kind:costume/support`와 canonical ID로 이름 공간을 나누며, 서포트의 canonical ID는 기존 P3 `supportId`와 같다. `mappingStatus`, `rightsStatus`, `usageScope`, `publicRedistribution`를 별도로 기록하고 각 파일에 실제 경로·원본 자산 ID·출처 URL·PNG 형식/크기·바이트·SHA-256을 보존한다. 전체 매니페스트는 `data/assets/p85-manifest.json`, JS용 파일 인덱스는 `data/assets/p85-index.json`이다. 다른 의상/카드 이미지로 대체하거나 이름을 추측해 연결하지 않는다.

현재 의상272종 초상화·서포트566장 아이콘·전체 카드아트566개, 총1,404PNG가 정확한 ID/원본 해시와 연결됐다. 물리 파일은 **`data/local/p85-assets/game-assets/`**에만 보관한다. `public/`와 일반 `dist/`에는 권리 미확인 이미지를 자동 복사하지 않는다. 개발 서버의 제한된 `/game-assets/` 경로와 명시적 비공개 검증 build에서만 사용한다. 일반 production resolver는 `pending`을 반환하지 않으며, `VITE_PRIVATE_ASSET_VALIDATION=1`인 build도 출력이 `.preview/p85-private-static`으로 강제된다.

기술상 매핑 완료와 공개 재배포 허가는 별개다. 현재 공개 승인0/보류838개 canonical ID이며 `rightsStatus:pending`, `publicRedistribution:not-verified`, `usageScope:local-reference`를 유지한다. 전 목록과 사유는 `data/assets/p85-public-release-blocked.json`이다. `validate-assets.ts --public-release`는 미승인 항목이 남으면 실패한다. PNG가 현재 화면의 이미지·이름·ID와 일치하는지, 비동기 로딩 중 입력 변경이 차단되는지, 최대 Canvas 크기와 텍스트 대체가 유지되는지는 출력 계층에서 검사한다.

P0～P8 원본 스키마와 `uma-saved-plan` V1은 변경하지 않는다. 이미지 경로·일시적 검색/타입/레어도 필터는 저장 JSON에 추가하지 않는다. `nodeId`·`factorInstanceId`·`ownerCostumeId`·백인자·우선순위·잠금은 기존 계약대로 유지하며, 백인자 편집은 계보 카드에서 스킬·서포트 화면의 인자작 계획 영역으로 이동했다. 실제 출처·생성/전수 검사 명령은 [자산 출처 기록](P85_ASSET_SOURCES.md), 통합 결과는 [P8.5 보고서](P85_UI_ASSET_INTEGRATION_VALIDATION.md)를 따른다.

## P8 육성 계획 저장 어댑터 · 게임 계약과 분리

`src/domain/saved-plan.ts`의 `uma-saved-plan`은 `schemaVersion:1`, `formatVersion:1`이다. 계획 UUID·이름·생성/수정 시각·앱 버전과 P1/P3/P5 snapshot ID를 기록한다. 게임 데이터 버전과 저장 형식 버전은 다른 개념이다. P0/P2/P7 원래 스키마와 원본 JSON·SQLite는 변경하지 않는다.

`inputs`는 실제 `referencePlan`, `whiteFactors`, `factorInstances`, 선택 노드, 전역 우선순위, 출시 필터, P2 로테이션/적성/유전자 설정, P3 대회/각질/시나리오/성향/시간 기준/본육성 6장/돌파/노드별 미래시, P6 보유/대여 설정을 보존한다. 이름은 참고 표시이며 참조는 canonical 게임 ID로 검증한다. 계산 결과는 선택적인 `resultSnapshot`으로 입력과 분리하고 복원 결과로 재사용하지 않는다.

`nodeId`는 계보 소유 노드, `ownerCostumeId`는 의상, `factorInstanceId`는 이름/스킬 해시와 무관한 소문자 UUID다. 같은 의상 두 인자는 별도 UUID를 가진다. 기록 편집·조부 재배치는 UUID를 유지한다. 명시적인 실물 교체는 UUID와 해당 노드의 백인자·목표·적인자를 새로 시작하고 조상 자료는 보존하되 혈통 재확인을 요구한다. 알려진 인자 제거 후 재선택으로 확인 상태를 우회하지 못하게 이전 UUID의 미확인 흔적을 보존한다. 계획 복제는 새 planId를 발급하고 같은 실물의 UUID를 유지한다.

파일 경계는 최대 2MiB, strict 구조·중복 JSON 키·금지 속성·깊이·날짜·별수·우선순위·31인 연결/순환/공유 노드·소유 대응·UUID 충돌·실제 게임 ID를 검사한다. 누락 ID나 미래 버전은 원문 백업을 제공하고 정상 적용을 차단한다. 마이그레이션은 명시적인 버전 디스패치이며 지원하지 않는 변환을 추측하지 않는다. 미완성 날짜 등 편집 중 상태는 화면에서 허용하되 저장·가져오기 경계에서는 거부한다.

`plan-persistence.ts`의 주입형 저장 어댑터는 `uma.p8.saved-plans.v1` 한 키로 복수 계획을 검증·원자 기록하고 읽어 확인한다. 적용 직전에 재검증하며 App은 전체 workspace를 한 번에 교체하고 이전 Worker/결과/미리보기를 무효화한다. 파일 업로드·서버 DB·자동 덮어쓰기는 없다. 비교는 현재 엔진에서 다시 계산하며 PNG는 검증된 현재 화면 값만 변환한다. 상세 검증과 남은 배포 범위는 [P8 보고서](P8_PERSISTENCE_EXPORT_VALIDATION.md)를 따른다.

## P7 백인자 사용자 정보 · P2 계보/게임 스냅샷과 분리

`src/domain/lineage-skills.ts`의 세션 전용 `LineageSkillState`는 `schemaVersion:1`, `nodes`, `nodePriorities`다. P2 `LineagePlan`이나 P3 strict 스냅샷에 필드를 추가하지 않는다. `nodes[nodeId]`는 `ownerCostumeId`, `inventoryStatus:unentered/partial/reviewed`, 백인자 기록을 갖는다. 기록은 canonical `skillId`, 한국어/일본어 이름, `stars:1/2/3/null`, `status:owned/planned`, `userEntered:true`, 분류 상태와 근거다.

보유는 사용자의 직접 기록이며 게임 인증이 아니다. 계획은 보유·생성 성공이 아니다. 미입력·부분 입력은 미보유와 다르며, `reviewed`만 사용자가 전체 목록을 확인했다는 의미다. 백인자 자격 증거가 없는 일반/시나리오 스킬은 모두 `review-required`로 남긴다. 희귀도나 명칭·하위 관계만으로 자격을 인증하지 않는다.

기록과 노드 목표는 안정적인 인자 소유 `nodeId`·의상에 묶는다. 조부 혈통 재배치는 같은 노드의 기록을 보존하고, 인물/의상 교체·노드 제거·명시적 전체 초기화는 과거 기록과 노드 목표를 제거한다. 백인자 편집은 캐릭터·적인자·잠금·부모 연결을 바꾸지 않는다. 잠금 기록의 편집은 UI에서 해당 노드에 명시적으로 허용해야 한다.

선택 노드의 자기·직접 부모2명·조부4명·깊은 조상·다른 혈통을 분리한다. 깊은 기록을 중간 세대의 확정 획득으로 복사하지 않는다. P6 전역 우선순위와 노드별 우선순위는 서로 다른 요청 범위이며 각각 최대5개다. 현재 UI는 자동 합산하지 않고 범위를 명시적으로 전환한다.

`buildLineageRecommendationRequest`는 기록을 점수나 제외 필터로 쓰지 않는다. 현재 인자작은 오늘 KR 기준·미래시 OFF이고, 명시한 미래시 설계는 P5 JP 출시순서 컨텍스트를 요구한다. 부모·조부 요청의 `deck`은 비우며 최종 본육성 덱의 원래 시간 기준 경로는 별도 비교 정보로 유지한다. 노드/기록/계보/대회/시점 변경은 Worker 결과 서명을 무효화하고, 노드별 최적화는 명시적으로 요청한1건만 수행한다.

영구 저장·가져오기·계정·서버 DB는 이 계약의 범위에 없다. 검증과 실제 사례는 [P7 보고서](P7_LINEAGE_SKILL_INTEGRATION_VALIDATION.md)를 따른다.

## P6 사용자 우선순위 · 저장 스냅샷 불변

P4 요청의 선택적 `skillPriorities`는 canonical 일반 백인자 `skillId`와 `preferred`/`strong`/`required`를 최대 5개 담는다. 명시적인 하위 관계로만 금색·일반 상위 목표를 변환하며 고유·진화·계승 고유를 제외한다. 기본 요청과 P3 strict 저장 계약은 그대로 유지한다.

`coverageValue`는 기존 P5 정성 점수다. 선택 요청에서만 `preferenceBonus`와 `customizedValue`를 별도로 산출하고 동일 목표는 한 번만 가산한다. 필수 목표는 가산점 없이 같은 6장·같은 양립 이벤트 계획의 수급 조건이다. `recommendPersonalizedSupportDecks`는 기본·맞춤 결과와 전체 gained/lost·공략 주요 목표 손실을 반환한다. 지정하지 않으면 기존 기본 결과만 반환한다.

`required-unfulfilled`와 원인 `no-released-source`, `ownership-borrow-limit`, `mutually-exclusive-events`, `search-limit`, `unverified-source`를 구별한다. 결과의 공급자 확장·필수 검사 상태 수·한도 도달 메타데이터를 보존한다. 조건을 만족한 수급 기회는 획득·백인자 생성·계승 보장이 아니다. 미검증/비해당 목표의 사용자 선호는 원래 객관적 등급을 변경하지 않는다. 상세 정책·32개 실제 DB 검증은 [P6 보고서](P6_USER_SKILL_PRIORITY_VALIDATION.md)를 따른다.

## P5 증분 계약 · P3 strict 계약 유지

`uma-p5-forecast` schemaVersion1을 별도 `data/local/p5-forecast.json`으로 검증한다. baseSnapshotId·기준일·기간·원본6파일해시·기존3파일해시와 ID 참조를 확인한다. 대회14/출시120/기존수급1871/참고근거11/직전검토22+64/분류제안2를 보존하며 기존 P3 스냅샷에 필드를 추가하지 않는다.

대회의 `startAt:null`, expectedDate/Month/Window와 JP 원본 대회일을 구분한다. 표시용 merge는 기존5ID 중복을 제거한53개이며 원본 P3대회44개는 불변이다. 원문 파생가용성 목록은 참고용으로만 보존하고 공통 함수로 재판정한다. request의 선택적 `forecast`는 Worker 직렬화가 가능한 날짜·출처 컨텍스트다. 기존 요청은 계속 유효하다.

가용성 basis `jp-release-order`는 JP출시↔JP대회 비교이며 KR날짜와 혼용하지 않는다. `jp-route-order`는 최초출시일 미수록 스킬의 예상 수급 증거이며 `effectiveDate:null`, 한국·과거패치 인증이 아니다. `sourceServer:JP`를 KR확정경로로 재표기하지 않는다. 직전 출시의 기본 편성 독점 기여와 교체 gained/lost를 구분한다. [P5 통합 검증](P5_INTEGRATION_VALIDATION.md)을 따른다.

## P4.1 평가 근거·이벤트 계획 · P0/P3 저장 계약 유지

P3 JSON을 재작성하지 않고 런타임 평가 결과에 `conditionClass`·`valueEvidence`를 추가한다. 정성 등급과 기존 null 마신·발동률 필드를 유지한다. 정량 자료는 별도 계약 및 정확한 대상 컨텍스트 승인 게이트를 사용하며 현행 점수 적용은 0건이다.

P4 결과의 `compatibleSkillIds`/`skillIds`는 선택한 분기 계획의 목표, `potentialSkillIds`는 기존 경로 합집합, `unresolvedEventSkillIds`는 일부 이벤트 경로 미확인 목표다. 별도 힌트로도 공급되면 같은 목표가 두 목록에 나타날 수 있다. `eventDecisions`는 그룹별 하나의 선택·출처·성공/실패 구분을 보존하고 `probability:null`, `guaranteedSkillIds:[]`를 유지한다. 여러 관련 그룹은 AND 제약이며 `source_unspecified`는 공급을 추가하지 않는다. 탐색 한도 `eventPlanLimit`·`eventPlansPruned` 및 목적함수 순서를 기록한다. 상세 의미와 검증은 [P4.1 보고서](P41_RECOMMENDATION_QUALITY.md)를 따른다.

## P4 추천 요청·결과와 대회 보강

기존 P3 팩을 재사용한다. 대회에 선택적 `format`, `fieldSize`, `timeOfDay`를 추가해 LoH와 챔미·출전인원·밤 조건을 구별하며 랜덤 기상/주로는 `null`로 보존한다. 기존 입력은 계속 유효하다.

`support-deck-optimizer.ts`의 P4 요청은 P3 평가 조건과 보유카드/돌파·보유제한·대여1장·탐색예산이다. 결과는 카드6장과 중복없는스킬집합·카드별기여·교체차집합·주요누락·대체안·탐색범위를 반환한다. `ready`, `insufficient-candidates`, `insufficient-skills`, `search-limited`를 구분한다. P4는 새 게임 DB나 별도 게임 수치를 정의하지 않으며 정책 가중치와 실측치를 구분한다. [P4 보고서](P4_SUPPORT_OPTIMIZATION.md)를 따른다.

## P3 스킬·서포트 계약 · 기존 계약 유지

`src/domain/skill-support.ts`는 `contract: uma-p3-skill-support`, `schemaVersion: 1`의 별도 팩을 검증한다. 스킬·서포트·서버별 수급·리비전·하위 관계·돌파 효과·코스/레이스/시나리오·대회·한국 적용 정보를 고유 ID로 연결한다. 원본 조건·효과·variant 및 출처를 보존하며 source 번역을 공식명으로 승격하지 않는다.

스냅샷 ID는 원본과 큐레이션 내용에 고정되고 로드 후 깊은 동결한다. 출시 미확인과 미출시는 다르며 카드와 스킬의 출시일을 서로 복사하지 않는다. 상하위·누적Pt·검증 등급은 [P3 보고서](P3_SKILL_SUPPORT_VERIFICATION.md)의 출처/정성 정책을 따른다. P0/P1 JSON에 P3 staging을 직접 넣지 않는다.

## P2 계보 계획 계약 · P0 스냅샷 유지

`src/domain/lineage.ts`의 `LineagePlan`은 P0/실제 참고 스냅샷과 별개의 사용자 계획이다. `schemaVersion: 1`, `rootId`, 31개 `nodes`를 가지며 각 노드는 고유 `nodeId`, nullable `costumeId`·`redFactor`, 부모 2명의 `parentIds` 또는 말단 `null`, `locked`를 갖는다. 1/2/4/8/16개 세대, 참조 존재·단일 부모 연결·순환/공유/분리 금지를 검증한다.

인자는 슬롯 위치가 아니라 소유 노드에 속한다. 조부모 배치는 깊은 혈통 전체를 재연결한다. 고정 노드와 그 이전 세대는 수정/배분으로 바꾸지 못하며, 실제 소유 캐릭터가 없는 고정 인자는 거부한다. 미정 캐릭터의 인자는 새로 만들 계획으로만 인정한다. `LineageConstraints`는 조부모 목표 인자·로테이션 적성·선택적 유전자 목표 및 부모 목표 보존을 표현한다. 세대 효과와 배분 상태 계약은 [P2 검증 보고서](P2_LINEAGE_VERIFICATION.md)를 따른다.

계약의 실제 정의는 `src/domain/`이며 `data/fixtures/p0.snapshot.json`이 완전한 가상 예시다. 모든 필드는 엄격하게 검증하며 정의되지 않은 필드는 거부한다.

## 스냅샷

| 필드 | 형식 |
|---|---|
| `schemaVersion` | 현재 `1` |
| `snapshotId` | 계산에 고정할 스냅샷 고유 ID |
| `datasetVersion` | 출처/정규화 데이터의 버전 문자열 |
| `generatedAt` | `Z` 또는 UTC 오프셋이 있는 ISO 시각 |
| `kind` | `fixture` 또는 `verified` |
| 테이블 | `sources`, `characters`, `costumes`, `supports`, `skills`, `courses`, `scenarios`, `tournaments`, `releases`, `affinities`, `assets` 배열 |

모든 엔터티와 서포트 스킬 수급 경로는 최소 1개의 `sourceIds`를 갖는다. 출처에는 `sourceId`, `title`, `url`, `accessedAt`, `evidence`가 필요하다. 증거 구분은 `fixture`, `official`, `observed`, `research`이며 수집일과 근거 수준을 게임 데이터 자체와 분리한다.

## 주요 엔터티

| 테이블 | 식별자 및 주요 관계 |
|---|---|
| `characters` | `baseId`, `nameKo`, `nameJa`, `aliases` |
| `costumes` | `costumeId`, `baseId`, `nameKo`, `aptitudes`, `releaseRef`, 선택적 `assetKey` |
| `supports` | `supportId`, `ownerBaseId`, `rarity`, `type`, `skills`, `releaseRef` |
| `skills` | `skillId`, 한/일 이름, `costPt`(미확인 `null`), 선택적 `lowerSkillId` |
| `courses` | `courseId`, `distanceM`, `surface`, `direction` |
| `scenarios` | `scenarioId`, `releaseRef`, `linkedSupportIds` |
| `tournaments` | `eventId`, `courseId`, `startAt`, `dateStatus`, `conditions` |
| `releases` | `releaseId`, `entityType`, `entityId`, `jpDate`, `krConfirmedDate`, `krForecastDate` |
| `affinities` | `aBaseId`, `bBaseId`, `baseValue`. 순서 없는 인물 쌍마다 1건 |
| `assets` | `assetKey`, `entityType`, `entityId`, `path`, `usageStatus`, 선택적 `variantId` |

IDは英数字・`_ . : -`による安定した文字列。発売日3フィールドは不明なら `null` とする。日本発売日より早い韓国発売日は不整合として拒否する。

적성은 `turf/dirt`, `sprint/mile/medium/long`, `front/pace/late/end`의 10개 항목이며, 등급은 `G/F/E/D/C/B/A/S`다. `front`는 도주, `pace`는 선행, `late`는 선입, `end`는 추입이다. 등급 보정 계산은 P1 이후 검증된 규칙으로 구현한다.

서포트 스킬 수급 경로는 `{skillId, path, lowerSkillId?, sourceIds}`이며 `path`는 `hint/event/gold`다. 경로가 있다는 이유만으로 확정 수급으로 판정하지 않는다. 자세한 이벤트 조건·돌파별 효과·패치별 개정은 필요한 단계에 계약을 확장한다.

## 受け入れ手順

1. 原本を `data/raw/` で保持し、ソースURL・取得日・サーバー・利用条件を記録する。
2. 既存ID・日本語/韓国語名称・別名を対応付ける。Global発売日を韓国用に流用しない。
3. 正規化済みのJSONスナップショットを作る。未確認の値は捏造せず未確認事項として記録する。
4. `npx.cmd tsx scripts/validate/snapshot.ts <ファイル>`で構造・全参照・重複・日付を確認する。
5. 実ゲーム値は独立の期待結果を持つゴールデンケースでも検証する。構造通過は実ゲームの正確性や利用許諾の証明ではない。
6. アプリの単一データ入口 `src/data/snapshot.ts` を、受け入れた固定スナップショットに接続する。

既存スナップショットとの自動マージ・ネットワーク取得・スキーマ移行・DBコネクターはP0では実装しない。P0に計算結果の保存ファイル形式も含まない。

## P1 계보 입력과 규칙 팩

준비 자료 통합은 이 가상 계약과 별도로 `src/domain/reference.ts`의 `uma-p1-reference` 계약을 사용한다. P0 필수 한국어 필드에 일본어를 넣거나 fixture를 verified로 바꾸어 연결하지 않는다. nullable 한국어/표시언어/번역 출처, KR 공식·2차·관측·예측, 그룹·가중치·패치 원문 및 검증 pending을 보존한다. 변환 명령과 필드 의미는 `DATA_INTEGRATION.md`에 정의한다.

P0 스냅샷 v1은 그대로 재사용한다. 추가 정의는 `src/domain/pedigree.ts`다. 실제 게임값이 아직 없어 P1 가상 파일을 별도로 보관한다.

- 슬롯 키: `target`, `parentA`, `parentB`, `grandA1`, `grandA2`, `grandB1`, `grandB2`
- 슬롯 값: `{costumeId: string | null, redFactor: {type, stars} | null}`
- 인자 종류: 기존 10개 적성 키. `stars`는 정수 1/2/3만 허용
- 대상 자신의 인자 및 미선택 슬롯에 남은 인자는 적성 계산에 반영하지 않는다. UI는 해당 입력을 제공하지 않고 비우기 시 인자도 제거한다.
- 규칙 팩: `schemaVersion`, `ruleId`, `snapshotId`, `kind`, `sourceIds`, `affinity`, `aptitude`
- `affinity.terms`: `{termId, label, slotA, slotB, weight}`. 가상 팩은 11관계 합산이며 G1 항목은 없다.
- `affinity.forbiddenSameBasePairs`: 같은 인물을 금지하는 슬롯 쌍. 현재 가상 제한이며 실제 규칙 확인이 필요하다.
- `aptitude.starSteps`: `{minStars, gradeSteps}` 배열. 0별/0단계에서 시작하고 별수 임계점은 오름차순, 상승 단계는 감소하지 않는다. `initialCap: A`

규칙과 스냅샷은 ID·출처·fixture/verified 상태를 일치시켜 검증한다. 조부 형제 슬롯을 교환해도 상성 가중치와 금지 조건이 같아야 한다. 앱은 `src/data/pedigree-data.ts`에서 두 팩을 함께 검증하고 고정한다.

P0 진단 화면은 기존 `src/data/snapshot.ts`의 P0 fixture를 계속 사용한다. 실제 자료가 들어오면 P1 진입점에 별도의 검증 팩을 연결한다. 실제 공식이 현재 관계 가중 합으로 표현되지 않으면 규칙 스키마와 엔진도 확장하고 독립 대조 테스트를 수행한다. 자세한 절차는 `P1_VALIDATION.md`를 따른다.

## P3 실제 DB 확장

기존 P3 계약을 유지한 선택 필드 확장은 [P4_DATA_CONTRACT.md](P4_DATA_CONTRACT.md)를 따른다. 실제 출처와 출시일 분리는 [P3_DATA_EXPANSION.md](P3_DATA_EXPANSION.md)에 기록한다.


## 2026-11-05 트레이너스 교차검증 보강

한국어 스킬명 164개를 보완하고 기존 출시일·미래시·게임 효과량을 유지했다. 출처별 ID 대응과 조건부 이벤트, 충돌 및 정량 참고 자료는 [검증 보고서](P3_TRAINERS_CROSSCHECK.md), [정량 계약](P4_QUANTITATIVE_DATA_CONTRACT.md)을 참고한다. 정량 참고 자료는 현재 순위에 사용하지 않는다.
