# P4에 전달할 데이터 계약

P0~P2 계약과 P3 `uma-p3-skill-support` v1을 유지한다. 이번 확장은 구버전 회귀 부분 집합을 계속 읽을 수 있도록 선택 필드로 추가했다.

- `supports[].ownerBaseId?`: 원본 등장 인물 ID. 친구/NPC도 있어 육성 가능 인물 목록의 외래키로 무조건 제한하지 않는다.
- `supportSkills[].eventId?/choiceId?/hintLevel?`: 명시적으로 연결된 이벤트·선택지·힌트. 없으면 미확인이고 확정 획득이 아니다.
- `supportEvents?`: 카드/등장 인물 연결 근거를 `raw.ownerKind`, `raw.ownerId`, `raw.family`에 보존. `choices[].skills`는 직접 해석한 보상만 담는다. 인물 기준 참고 이벤트를 카드 고유 이벤트로 승격하지 않는다.
- `scenarioSkillRoutes?`: 시나리오의 스킬 획득 가능 경로. 구체적인 링크·성공 조건 미검증 행은 확정 수급에서 제외한다.
- `research?`: 코스·각질·출처·수집일·출처 보고값. `status: context-unverified`는 마신 이득/Pt 또는 발동률 계산에 쓰지 않는다.
- `tournaments[].server?`: KR 또는 JP. 현행 P3 UI에는 KR 챔미만 연결하며 JP 일정은 별도 파일로 관리한다.
- `tournaments[].conditions.season`: 원본 양의 정수 코드를 보존한다. 1~4 이외 코드를 임의로 번역하지 않는다.

한국 일정은 공식 확정·2차 자료 날짜·출시 관측일·예측·미확인을 구분한다. `releasedBy`는 최초 출시일이 아니고 과거 시점으로 소급할 수 없다. 최신 효과가 존재한다는 이유로 과거 한국 효과에 적용하지 않는다. 빈 `patchOverrides`는 같은 패치라는 인증이 아니다.

P4는 동일한 유효 스킬 집합에 대해 조합의 합집합을 비교하고 중복 스킬을 신규 기여로 중복 계산하지 않아야 한다. 현재 단계에서 카드 희귀도 자체 감점·백인자 확률 곱셈·완주율 추정·가짜 마신 수치를 추가하지 않는다. 금색 하위 관계는 명시적 `lower_skill`만 사용하고 variant/진화/계승 관계와 구별한다. P4 조합 탐색은 아직 구현하지 않았다.


## 2026-11-05 트레이너스 교차검증 보강

한국어 스킬명 164개를 보완하고 기존 출시일·미래시·게임 효과량을 유지했다. 출처별 ID 대응과 조건부 이벤트, 충돌 및 정량 참고 자료는 [검증 보고서](P3_TRAINERS_CROSSCHECK.md), [정량 계약](P4_QUANTITATIVE_DATA_CONTRACT.md)을 참고한다. 정량 참고 자료는 현재 순위에 사용하지 않는다.
