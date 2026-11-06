# 데이터 확보·정규화·검증 실행 계획 v1.0

**조사일:** 2026-11-04. 외부 웹에서 접근·존재를 확인한 출처를 중심으로 정리. **현재 원본 데이터의 전체 일괄 다운로드, 권리 허락, 한국어 명칭 전수 대조는 완료하지 않았다.**

## 1. 데이터 요구와 출처 대응

| 데이터 | 추천 1차 확인처 | 보조/교차검증 | 가공·배포 전 주의 |
|---|---|---|---|
| 한국 정식 캐릭터·스킬·카드 명칭 | 카카오게임즈 공식 가이드, 공식 게임/공지 | 한국 커뮤니티·DB | 비공식 번역 혼입 금지 |
| 한국 카드/육성마/시나리오 출시일 | 카카오게임즈 공식 공지 및 신뢰할 수 있는 원문 | 공식 발표 인용 보도, 미래시표 | 확정·예상 필드 분리 |
| 일본 원본 ID·적성·스킬·코스·이벤트·서폿 | 게임 DB 구조 설명 및 공개 자료 | 팬 DB 2종 이상 비교 | 데이터 재사용 허가·약관 확인 |
| 7인 기본 상성 원본표 | 계보 계산 툴/검증 가능한 상성 자료 | 표본별 독립 계산 결과 | 다른 서버 패치·의상 ID 확인 |
| 빨간 인자·유전자·적성 보정 | 게임 시스템 검증 자료/동일 조건 사례 | 독립 계산 도구 | 공식·관측·추정 등급 구분 |
| 서포트 일반 힌트·이벤트·금색 연계 | 구조화된 지원 카드 DB | 원게임 확인, 별도 공략 DB | 이벤트 랜덤/선택/하위 연계 분리 |
| 대회별 스킬 효율·마신·유효율 | 해당 대회 분석 자료·검증된 계산 결과 | 한국/일본 후기·동일 코스 교차검증 | 모든 값에 서버·코스·각질·날짜 기록 |
| 육성 캐릭터/서포트 이미지 | 공식 페이지·게임 원저작권 확인 | 이미지 자산 경로 조사의 참고 사례 | **사용·재배포 허가 전 웹 공개 자산 포함 금지** |

## 2. 확인한 실제 출처와 사용 전략

### S1. 한국 공식 표기 및 출시 정보 — 신뢰 기준점

- 카카오게임즈 공식 가이드(육성/계승 화면): https://guide.umms.kakaogames.com/%ED%99%88-%EC%9C%A1%EC%84%B1/
- 카카오게임즈 우마무스메 브랜드/캐릭터 소개: https://umamusume.kakaogames.com/mejiro/index.html
- 한국 업데이트 보도의 근거 확인 예시(2026-10-16 무인도·터커 브라인): https://www.gamemeca.com/view.php?gid=1781920
- 게임 출시/공지 최종 확인은 **카카오게임즈 공식 커뮤니티의 원문**을 연결해 수행. 보도자료·위키를 확정 출시일의 유일한 근거로 사용하지 않음.

**장점:** 한국어 명칭과 출시 날짜의 기준점. **한계:** 스킬 ID, 상성 전체 행렬, 서포트의 세부 이벤트·힌트를 일괄 제공하지 않음.

### S2. 일본 공식/원본 검증

- 일본 Cygames 공식 포털: https://umamusume.jp/
- 일본 공식 2차창작 가이드라인: https://umamusume.jp/derivativework_guidelines
- 원본 데이터 테이블 구조 참고: https://github.com/quantumxiaol/umamusume-dpkg
- 타 DB가 사용하는 대표 구조: `chara_data`, `card_data`, `skill_data`, `support_card_data`, `support_card_effect_table`, `race`, `race_course_set`, `race_track`, `text_data`.

**판단:** 원본 키와 관계 파악에 유용. 게임 파일을 임의 추출·복호화하거나 제3자가 만든 추출물을 재배포하는 법적·약관상 문제는 별도로 검토. 스크립트 코드와 추출 결과는 구분.

### S3. 공개 팬 DB — 구조·교차검증 후보

- 우마무스메 설계도(계보 UI/상성/적성 참고): https://design.u-ma.org/
- Uma Musume Hub(스킬/캐릭터/코스/서폿 스펙): https://mihonostudios.com/database
- Umamusume Wiki 서포트 데이터 모듈: https://umamusu.wiki/Module:Game/Supports/Data
- Uma Support Helper(코스별 스킬 발동·카드 힌트 매칭): https://umasupporthelper.net/
- UmaTools(서포트 힌트·비교·데이터 갱신 구조 연구): https://github.com/daftuyda/UmaTools
- UmamusumeDB(글로벌/일본 타임라인, **한국 서버 아님**): https://umamusumedb.com/
- 일본 fan data snapshot 사례(캐릭터/서폿 이미지 포함, **재배포 권한 미확인**): https://github.com/Tsuyuchan-jp/umamusume-data
- Uma Musume planning tool 독립 엔진 구조 사례: https://github.com/Anthuynh81/Umamusume
- 일본 캐릭터/뉴스 API(범위 제한): https://org.umapyoi.net/

**중요한 제한:** `UmamusumeDB`, `Uma Musume Hub`의 'Global' 또는 'EN' 출시일은 **한국 서버 출시일이 아님**. 이를 KR 출시일로 복사하는 행위 금지. `UmaTools` 코드는 GPL-3.0 표기가 확인됨: **일부 코드 사용 시 의무 검토가 필요하므로 이 프로젝트에서는 독자 구현 원칙 유지**. GitHub 공개 접근은 데이터/아트 재배포 허가가 아니다.

### S4. 한국/일본 대회 공략 — 수치 연구용

- 일본 한신 2200m 인자작 추천(2025-07): https://umamusumelabo.com/chara_support/chanmi-insisupport-202507
- 한국 한신 2200m 인자작 개정 공략: https://gall.dcinside.com/mgallery/board/view/?id=umamusu&no=6191261
- 일본 시나리오/인자작 운영 연구: https://note.com/herohero_3/n/n00eb20335c38
- 일본 시나리오·코스·카드 연구는 **해당 대회 당시 패치**를 기준으로 검증.

**판단:** 스킬 '효율' 데이터의 참고 및 골든테스트에 유용. **공략 작성자의 추천을 검증된 게임 내부 확률/고정 가중치로 오인하지 않음.**

## 3. 소스 확보 우선순위 및 실행 순서

**A단계 — 7인 계산기를 당장 움직이기 위한 최소 데이터**

1. 육성 캐릭터 `character_base_id`·`costume_id`·초기 적성·한국어 표기 20~50개 테스트 집합.
2. 최소 검증 상성 매트릭스/참조 계산 사례(캐릭터 7인별 기대 점수 포함).
3. 적성 등급·빨간 인자 보정 규칙/골든테스트.
4. 대여/소유는 샘플 데이터로 시작. **이미지 없이 플레이스홀더로 우선 구현.**

**B단계 — 전체 계보/유전자 확대**

1. 캐릭터 전체 및 의상별 데이터 확장, 세대별 적성 검증.
2. 로테이션에 필요한 코스·거리·주로 적성 표.
3. 유전자 6성/12성 판정 표 및 기본 상성 외래키 검증.

**C단계 — 추천기 준비**

1. 시나리오/대회/코스·각질·스킬 테이블.
2. 서포트 ID·타입·레어도·돌파·일반 힌트·이벤트·금색 스킬·하위 관계.
3. 한국 대회×각질별 **유효 스킬 목록과 스피드/스태 녹딱**.
4. 본육성 6장 수급 경로와 겹침 조사, 실제 한국 출시/미래시 날짜.

**D단계 — 정기 업데이트**

- 주기적으로 원천 데이터 변경 탐지; 신규 개체/변경 점검; 한국 공식 출시 매핑 추가; 샘플 골든테스트; 승인된 JSON 스냅샷만 게시.
- 일본 선행 데이터는 KR 확정/예상 출시일 메타데이터와 함께 유지; 미래 대회 필터가 자동 반영.

## 4. 표준 데이터 모델 (권장안)

| 엔터티 | 필수 필드 | 유의사항 |
|---|---|---|
| `Character` | `baseId`, `nameKo`, `nameJa`, `aliases[]` | 우마무스메 본체 식별 |
| `Costume` | `costumeId`, `baseId`, `nameKo`, `aptitudes`, `assetKey` | 의상/육성 버전 식별 |
| `Support` | `supportId`, `ownerBaseId`, `rarity`, `type`, `skills[]`, `events[]`, `releaseRef` | 스킬 출처를 hint/event/gold로 분리 |
| `Skill` | `skillId`, `nameKo`, `nameJa`, `costPt`, `effects`, `conditions`, `lowerSkillId?` | 평가가 아닌 **원본 스펙** |
| `Affinity` | `aBaseId`, `bBaseId`, `baseValue`, `sourceVersion` | G1 보너스 없음 |
| `Scenario` | `scenarioId`, `nameKo`, `releaseRef`, `linkedSupports[]` | 해당 시나리오에서 실제 중요한 카드만 |
| `Tournament` | `eventId`, `type`, `courseId`, `startAt`, `dateStatus`, `conditions` | 예정 대회/공식 확정 분리 |
| `Release` | `entityId`, `jpDate`, `krConfirmedDate?`, `krForecastDate?`, `confidence`, `source` | KR 기준 날짜가 없으면 임의 Global 날짜 대입 금지 |
| `SkillAssessment` | `eventId`, `style`, `skillId`, `tier`, `masin?`, `validRate?`, `evidence`, `verifiedAt` | 스펙과 해석을 분리 |
| `Asset` | `entityType`, `entityId`, `variantId?`, `path`, `owner`, `usageStatus`, `credit` | `usageStatus=approved`만 공개 |

대표 JSON 형태(가상 필드·날짜; **실제 출시 데이터 아님**):

```json
{
  "id": "support_demo_B",
  "jpReleaseDate": "2025-10-01",
  "krRelease": {
    "confirmedDate": null,
    "forecastDate": "2027-01-20",
    "status": "forecast",
    "sourceUrl": "https://example.invalid/replace"
  },
  "dataVersion": "2026-11-04"
}
```

추천 날짜 결정 순서:

```ts
function projectAvailability(release, cutoffDate) {
  if (release.krRelease.confirmedDate) {
    return release.krRelease.confirmedDate <= cutoffDate
      ? {available: true, basis: 'confirmed'}
      : {available: false, basis: 'confirmed'};
  }
  if (release.krRelease.forecastDate) {
    return release.krRelease.forecastDate <= cutoffDate
      ? {available: true, basis: 'forecast'}
      : {available: false, basis: 'forecast'};
  }
  return {available: false, basis: 'unknown'};
}
```

*정렬 규칙:* 확정 날짜는 예측 날짜보다 우선; `cutoffDate`는 기본적으로 선택 대회 **시작일**, 사용자가 '현재 기준' 선택 시 서울 현지 날짜. 스킬은 단독 출시 개체가 아니더라도 **스킬을 실제 제공하는 출처/카드의 가용성**을 함께 검증한다.

## 5. 품질 관리/검증 전략

- 구조 검증: 모든 외래키 존재, 중복 ID 0, 의상-본체 관계 완전, 부모 상성 대칭성 검증, 하위 스킬 링크 유효.
- 시점 검증: KR 미래시/확정 상태, 데이터 출처, 적용 시점, 같은 카드의 중복 출시 일정 우선순위.
- 한국어 검증: 정식 이름/의상 이름/스킬 이름이 실제 한국 표기와 일치; 별명은 별도 검색 필드.
- 상성 검증: 최소 20개 이상 실제 확인 계보 fixture; 기본 상성 계산기 간 일치 여부 기록.
- 적성 검증: 7인/31인 세대 경계, 같은 조부모 배치 6개, A 적성 생성 조건, 6/12성 case.
- 추천 검증: 같은 대회에서 일본 과거 공략과 한국 공략 비교하되 **정답 카드 6장 복제**가 아니라 유효 스킬·녹딱·중복의 차이를 확인.
- 출처 분쟁/변경: 변경 전후 스냅샷과 diff 보관; 문제가 있는 출처는 데이터 승인 없이 사용 중지.

## 6. 게임 이미지 확보 현실적 방안

**선호 포맷:** 단일 캐릭터를 식별할 수 있는 정사각형 초상(권장 원본 256×256 이상). 계보에는 48~64px로 축소 표시. 의상 버전이 선택된 경우 **의상과 일치하는 이미지**만 표시.

우선순위:

1. **사용 가능한 권한이 확인된 공식 캐릭터 초상**이 있다면 자산 레지스트리에 소스·권리·버전을 기록하고 사용.
2. 공개 팬 DB/GameTora/기타 서비스의 이미지 URL은 **후보를 찾는 참고**로 활용. 권리자/호스트의 허락 없이 파일을 복제하거나 서비스 서버에서 핫링크하지 않음.
3. 권리가 확인되지 않으면 자체 제작 중립 실루엣, 캐릭터명 첫 글자, 타입/적성 텍스트로 **완전 기능 제공**.
4. 추후 허가/이용조건 확인 후 이미지만 교체할 수 있는 `AssetResolver` 추상화 사용. 이름·ID와 이미지 매핑 검증 테스트 필수.

이론적으로 GameTora 수록 초상, `umamusume-data`의 WebP 아이콘, 공식 한국 브랜드 페이지 이미지는 위치 후보가 될 수 있으나, **현재 이 문서는 이들의 재사용 허가를 확보했다고 주장하지 않는다**.

## 7. 법적/운영 검토 체크

- [ ] 각 원천의 robots.txt/API 약관/요청 제한/재사용 조항 확인.
- [ ] GitHub 프로젝트 라이선스 + **게임 저작권 이미지의 독립적 권리** 확인.
- [ ] 데이터를 공개 사이트에 재배포할 권리가 있는지 확인; 미확인 시 자체 검증·구조만 활용.
- [ ] 저작권·게임 공식과 무관한 비공식 팬 프로젝트라는 표시.
- [ ] 향후 이의 제기 시 특정 이미지만 교체·삭제 가능한 구조.
- [ ] 출처/마지막 검증일/패치 범위를 데이터 팩과 문서에 남김.

## 8. 우선 검증할 불확실성 — 작업으로 해결

1. 실제 **한국 기본 상성표** 확보 가능 여부 및 출처 사용권.
2. 31인 세대별 빨간 인자 적성 반영의 골든테스트.
3. 모든 카드의 이벤트·힌트 공급 정보 수집 난이도(특히 KR 신규 카드).
4. 미래시의 **한국 출시일 예측 데이터**를 어떻게 생성하고 공지와 대조할지.
5. 공식 게임 이미지 사용 범위와 홈페이지 배포 조건.

위 다섯 문제 중 하나가 어려워도 개발을 중단하지 않는다. 부족한 부분은 공식 명칭으로 된 작은 검증 fixture, 도메인 엔진 테스트, 플레이스홀더로 진행한다.
