# P8.7 실사용 흐름·계보·스킬 UI 정리

요구사항 기준일: 2026-11-05 (Asia/Seoul). 실행 시각은 각 원시 로그와 manifest를 따른다. 이름 전용 검색을 포함한 구현·회귀·실제 화면 검수를 완료했다. P9 공개 배포는 수행하지 않았다.

## 기준과 보호 범위

최종 사용자 첨부 `77f42816-d966-4067-b831-6604fe7e914d/붙여넣은 텍스트.txt`의 7개 요구사항을 적용했다. 직전 용어 수정 이후의 현재 소스·테스트를 `.preview/p87-baseline/`에 보존했다. 이전 P8.6의 엔진 파일 해시를 이번 기준으로 잘못 재사용하지 않는다. 이번 기준은 이미 승인된 사용자 표시 용어 변경을 포함한다.

엔진·도메인·fixture·snapshot·이미지 매핑·원본 JSON/SQLite 618파일을 읽기 전용으로 해시 대조한다. 기존 상성·적성·배분·추천 정책과 P8 V1 구조를 변경하지 않는다. 빠른 선택은 계획의 목표와 별도의 브라우저 환경설정이다. 사용자 검색은 캐릭터·의상·카드·스킬의 이름과 별칭만 사용한다. DB ID는 검색어와 안내에서 제외하고 내부 연결 키로만 유지한다.

## 7개 요구사항별 구현

| 요구 | 변경 파일 | 구현 |
|---|---|---|
| 1. 카드에서 갤러리 직접 열기 | `UnifiedLineageTree.tsx`, `ReferencePage.tsx`, `ReferencePicker.tsx`, `LineageCharacterPicker.tsx` | 초상화 버튼은 7/31 모두 해당 노드 갤러리를 직접 연다. 캐릭터·의상·별칭으로만 검색하고 선택 후 닫는다. |
| 2. 적인자 직접 편집 | `LineageNodeEditor.tsx`, `FactorInstanceEditor.tsx`, `p87.css` | 별도 적인자 배지에서 종류·1~3성·잠금을 짧은 편집기로 변경한다. 큰 실물 패널과 기술 식별자·장문 재확인 블록을 기본 흐름에서 제거한다. 실물 기록 초기화·명시 연결 검토는 접힌 기록 관리 및 P7에 남긴다. |
| 3. 상성·시작 적성 재배치 | `LineageSummary.tsx`, `ReferencePage.tsx`, `p87.css` | 트리 위의 상성 합계와 경기장2·거리4·각질4 배지. 점수 구성과 보정 과정은 접힌 상세. 부분 입력·미확인 연결은 계획 예상으로 구분한다. |
| 4. 내부 정보 정리·보안 점검 | `App.tsx`, `SkillAnalysisPage.tsx`, `SupportRecommendations.tsx`, `PlanManager.tsx`, `PlanComparison.tsx`, 갤러리 상세 | DB 버전·SHA·객체 JSON·기술 식별 패널을 일반 UI에서 제거했다. 내부 데이터와 저장 JSON은 유지한다. 개발 진단 화면은 DEV 조건으로 분리한다. |
| 5. 31인 조작 패널 | `LineageDesigner.tsx`, `ReferencePage.tsx`, `p87.css` | PC 왼쪽 목표·배분 패널과 오른쪽 트리. 조부별 상세·긴 설명은 접고 배분 버튼을 패널 초반에 배치한다. 모바일은 상단 설정 후 내부 이동 가능한 트리다. |
| 6. 빠른 선택 개인화 | `SkillPrioritySettings.tsx`, `quick-skill-preferences.ts`, `skill-priorities.css`, `name-search.ts`, `support-filters.ts` | 실제 스킬명 검색에서 추가·중복 방지·삭제·순서 변경·기본 복원. `uma-user-quick-skills-v1` 로컬 키에 별도 저장한다. 카드·보유·백인자도 이름만 검색하며, 숫자 ID로 찾을 수 없다. 목표 5개 한도·가용 판정·일반 하위 매핑은 기존 엔진을 사용한다. |
| 7. 출처·검증 패널 제거 | `ReferencePage.tsx`, `SkillAnalysisPage.tsx`, `P5TournamentInfo.tsx`, `PedigreePage.tsx`, `LineageSkillPanel.tsx` | 장문 출처 패널·내부 조건 객체를 일반 화면에서 제거했다. 한국 적용 미확인·예상 일정·연결 미확인 등 실제 판단에 필요한 경고는 짧게 유지한다. 원자료·문서·저작권 footer·이미지 권리 게이트를 삭제하지 않았다. |

파일명이 짧게 적힌 UI 파일은 `src/ui/` 아래 해당 영역이다. 7인 자동 배치와 31인 적인자 배분은 각각 기존 함수를 호출하고 미리보기·명시 적용·취소·이전 결과 무효화 정책을 유지한다. 접기/펼치기는 여전히 표시 상태일 뿐이다.

## 실제 화면과 검수

산출물 경로는 `.preview/p87-artifacts/`다. 변경 전 실제 화면 10개는 `before-{1440,375}-{seven,node-editor,gallery,allocation,quick-skills}.png`로 보존했다. 기존 사용자 저장소와 별개인 격리 브라우저에서 기존 V1과 실제 ID를 사용했다. 사용자 인자 값은 합성 기록이며 한국 서버 실물 관측으로 인증하지 않는다.

| 화면 | PC | 모바일 |
|---|---|---|
| 7인 상성·적성 요약 | [PC](../.preview/p87-artifacts/desktop-seven.png) | [모바일](../.preview/p87-artifacts/mobile-seven.png) |
| 캐릭터 직접 선택 | [PC](../.preview/p87-artifacts/desktop-direct-gallery.png) | [모바일](../.preview/p87-artifacts/mobile-direct-gallery.png) |
| 적인자 직접 편집 | [PC](../.preview/p87-artifacts/desktop-direct-factor.png) | [모바일](../.preview/p87-artifacts/mobile-direct-factor.png) |
| 31인 조작 패널·트리 | [PC](../.preview/p87-artifacts/desktop-allocation.png) | [모바일](../.preview/p87-artifacts/mobile-allocation.png) |
| 개인 빠른 선택 | [PC](../.preview/p87-artifacts/desktop-quick-skills.png) | [모바일](../.preview/p87-artifacts/mobile-quick-skills.png) |

실제 화면에서는 초상화·인자 편집 경로가 다른지, 10종 등급이 구분되는지, 배분 버튼이 장문의 조부 결과 아래에 숨지 않는지, 모바일 입력·검색 목록이 겹치지 않는지 확인한다. 좁은 화면의 31인은 전부 축소하는 대신 내부 이동을 유지한다.

| 변경 전 화면 | PC 1440px | 모바일 375px |
|---|---|---|
| 계보·하단 요약 | [PC](../.preview/p87-artifacts/before-1440-seven.png) | [모바일](../.preview/p87-artifacts/before-375-seven.png) |
| 기존 큰 편집기 | [PC](../.preview/p87-artifacts/before-1440-node-editor.png) | [모바일](../.preview/p87-artifacts/before-375-node-editor.png) |
| 기존 갤러리 | [PC](../.preview/p87-artifacts/before-1440-gallery.png) | [모바일](../.preview/p87-artifacts/before-375-gallery.png) |
| 기존 배분 설정 | [PC](../.preview/p87-artifacts/before-1440-allocation.png) | [모바일](../.preview/p87-artifacts/before-375-allocation.png) |
| 기존 고정 빠른 선택 | [PC](../.preview/p87-artifacts/before-1440-quick-skills.png) | [모바일](../.preview/p87-artifacts/before-375-quick-skills.png) |

초기 PC 검사에서 빠른 선택 검색 결과의 두 번째 버튼이 기존 `height:100%` 스타일 때문에 다음 목록과 겹쳤다. 결과 행을 세로 flex·자동 높이로 바꾸고 실제 클릭을 재검증했다. 첫 모바일 재로드 검사는 화면 이동이 URL에 저장된다고 잘못 가정해 실패했다. 개인 설정이 유지된 실제 스킬 화면 URL로 다시 열고 새로고침하도록 검사를 수정했다. 두 실패의 원시 로그와 trace는 삭제하지 않는다.

## 계산·저장·출처 보호

캐릭터 선택 시 기존 `updateLineageNode`/`updateLineageFromPedigree`와 `reconcileWorkspaceLineage`를 사용한다. 선택한 캐릭터 자체에 종속되는 백인자·노드 목표는 기존 계약대로 갱신되고, 별개인 적인자·부모 연결·잠금은 무조건 초기화하지 않는다. 실물 UUID 교체와 관계 미확인 상태도 기존 엔진 규칙을 유지하며 임의로 확정하지 않는다.

새 빠른 선택 목록은 P8 V1에 추가하지 않는다. 목록에서 삭제한 스킬의 기존 목표는 남는다. 잘못된 로컬 값·버전·비문자 ID·과대 목록은 기본값으로 안전하게 돌아가며, 저장 불가 시 이번 세션에만 유지한다는 짧은 안내를 제공한다.

검색에는 DB ID를 섞지 않는다. 상위 계보의 기존 상성 후보 계산은 사용자 검색어 없이 실행·메모화하고, 표시 계층에서 이름·의상·별칭만으로 걸러 기존 계산 엔진을 보존한다. 카드·스킬·보유·백인자 검색도 이름 필드만 사용한다. 공백·전각은 정규화하되 실제 의상명의 숫자까지 금지하지 않는다. 같은 이름의 카드는 실제 일러스트·의상·레어도·타입으로 구분한다. E2E 입력도 표시 이름으로 바꿨고, ID 입력은 검색 실패를 확인하는 부정 검증에만 사용한다.

기존 실제 DB의 159점·7개 항목, 12/6성 설계, 6장 추천·이벤트 양립성, V1 가져오기·저장·복원·계획 비교·31 UUID와 PNG를 전체 단위/E2E에서 재검증했다. 이전 단계의 통과 수를 이번 실행으로 합산하지 않는다.

P8.7 전용 PC·모바일 흐름은 V1 가져오기 후 상성 159점·적성 10개, 캐릭터 직접 교체 후 더트 3성 유지, 장거리 2성·잠금 변경을 확인했다. 모든 31개 부모 연결과 교체하지 않은 30개 UUID를 유지하고, 교체한 부모 A만 기존 규칙대로 새 UUID가 됐다. 빠른 선택 변경 전후 V1의 `inputs` 전체가 동일하다. 삭제·정렬·새로고침·기본 복원은 계획 목표를 바꾸지 않는다. 빈 캐릭터의 혈통 잠금 실패는 편집기 안에 짧은 원인을 표시하고 잠금을 적용하지 않는다.

다운로드 PNG 3종은 기존 트리·스킬 수급표 구성을 유지한다. 검증 예제 이름의 `P8.6`은 가져온 사용자의 계획명이며 현재 앱 단계 표기가 아니다.

| 출력 | 실제 PC 다운로드 | 실제 모바일 다운로드 | 크기 |
|---|---|---|---:|
| 7인 트리 | [PC](../.preview/p87-artifacts/regression-p86/desktop-lineage-7-images.png) | [모바일](../.preview/p87-artifacts/regression-p86/mobile-lineage-7-images.png) | 1914×1476 |
| 31인 트리 | [PC](../.preview/p87-artifacts/regression-p86/desktop-lineage-31-images.png) | [모바일](../.preview/p87-artifacts/regression-p86/mobile-lineage-31-images.png) | 3972×2037 |
| 추천 6장·수급표 | [PC](../.preview/p87-artifacts/regression-p86/desktop-support-6-images.png) | [모바일](../.preview/p87-artifacts/regression-p86/mobile-support-6-images.png) | 2080×3005 |

서포트 출력은 정성 374 + 사용자 8 = 382, 양립 목표 48개·패시브 스킬 8개와 실제 힌트/이벤트/금색 하위 경로를 보존한다. 이벤트 조건 미확인과 수급 비보장을 유지한다. UI 정리로 정성 점수나 확률을 새로 만들지 않았다.

## 보안·권리 사전 점검

[읽기 전용 무결성·정적 점검](../.preview/p87-artifacts/integrity-security.validation.json)은 보호 파일 바이트, 제한된 비밀키 패턴, 빌드의 원본 DB/아카이브/이미지·인라인 그림·개발 엔드포인트 포함 여부를 확인한다. 일치한 비밀 값은 로그에 출력하지 않는다. 특정 패턴 부재를 모든 비밀·취약점 부재 인증으로 확대하지 않는다.

로컬 자료 연결은 Vite 개발 middleware와 DEV 로더에만 있다. 정적 산출물에서 전체 실DB를 공급하는 P9 작업은 별도다. React 텍스트 처리와 기존 strict JSON 가져오기(크기·버전·ID·그래프·UUID 검사)는 유지한다. 이미지 838개 canonical ID의 권리는 계속 pending이고 일반 공개 빌드에 그림을 자동 포함하지 않는다. 공개 배포·권리 허가를 수행한 것으로 보고하지 않는다.

현재 빌드의 정적 preview에 실제 GET을 보내 로컬 DB 2경로·SQLite·캐릭터 PNG가 각각 404이며 비공개 payload가 없는지 확인했다. 응답 루트의 SHA를 이번 `dist/index.html`과 대조했다. `Accept: */*`의 SPA HTML fallback을 데이터 노출로 오인하지 않도록 요청의 자료형도 지정했다. [실제 HTTP 결과](../.preview/p87-artifacts/production-boundary.validation.json)를 보존했다.

## 실행 결과와 남은 범위

| 실행 | 결과 | 원시 기록 |
|---|---|---|
| 첫 `npm.cmd run check` | 43파일·599개 단위 통과, lint·TypeScript·계약·build 통과 | `.preview/p87-check.log` |
| P8.7 초기 흐름 | 초기2실패: PC 버튼 겹침 / 모바일 재로드 경로 가정 | `.preview/p87-smoke.log` |
| P8.7 수정 후 흐름 | PC·모바일2통과 | `.preview/p87-smoke-final.log` |
| 첫 전체 `npm.cmd run test:e2e` | 114개 중109통과·5실패: 옛 UI 기대값4·이미지 decode 대기1 | `.preview/p87-e2e-full.log` |
| 첫 전체 실행 후 선택 재검증 | 20개 중18통과·2실패: P4 일반 설명까지 포함한 과도한 CSS 기대값 | `.preview/p87-focused-final.log` |
| P4 기대값 범위 수정 후 | PC·모바일2통과 | `.preview/p87-p4-recovery.log` |
| 이미지 decode 후 화면 재검증 | PC·모바일2통과 | `.preview/p87-visual-final.log` |
| 이름 전용 검색 후 `npm.cmd run check` | **44파일·601개 단위, lint·TypeScript·계약·build 모두 통과** | `.preview/p87-name-check.log` |
| 이름 전용 검색·ID 거부·P8.7 흐름 | PC·모바일4통과 | `.preview/p87-name-smoke.log` |
| 이름 전용 검색 후 전체 `npm.cmd run test:e2e` | **116개 중110통과·6실패**: P3/P4 옛 고정 예제와 최신 DB의 번역명 차이, 24.9분 | `.preview/p87-name-e2e-full.log` |
| 해당 예제 이름을 사용한 P3/P4 및 최종 P8.7 재검증 | PC·모바일12통과. 숫자·조건 기대값 유지 | `.preview/p87-name-fixture-recovery.log` |
| 최종 lint·TypeScript | 통과 | `.preview/p87-name-lint-final.log`, `.preview/p87-name-type-final.log` |
| 원본·정적 최종 점검 | 618개 보존·알려진 자격 증명 패턴/불필요한 공개 자료/개발 endpoint 0 | `.preview/p87-integrity-security-name-final.log` |
| 실제 정적 preview GET | 4개 비공개 자료 경로404·루트 빌드 SHA 일치 | `.preview/p87-http-boundary-name-final.log` |
| 저장 입력·다운로드 비교 | PC·모바일 입력 독립성·31 UUID·부모 연결 및 3종 PNG 동일 바이트 | `.preview/p87-output-audit.log` |

전체 실행의 6실패는 이름 검색 입력을 최신 전체 DB에서 가져왔지만 해당 두 spec은 이전 고정 부분 DB를 표시했던 테스트 오류다. 그 화면에 실제로 있는 번역명을 사용하도록 조회의 데이터 출처를 맞췄다. 브라우저에 ID를 넣는 방식으로 되돌리지 않았으며, 점수·돌파·출시일·대여 제약 검증은 유지했다. 최종 갤러리 캡처도 현재 보이는 이미지의 decode를 기다려 촬영했다.

현재 수집된 **116개 고유 사례(PC58·모바일58)는 모두 통과 증거가 있고 마지막 관측도 통과**다. 최초 실패와 재실행을 삭제하거나 더하지 않는다. 이는 단일 116개 일괄 무실패 실행이라는 주장이 아니다. [사례별 실행 대조](../.preview/p87-artifacts/p87-e2e-case-coverage.validation.json)·[파일/로그 manifest](../.preview/p87-artifacts/manifest.json)·[산출물 색인](../.preview/p87-artifacts/README.md)에 원시 기록과 파일 SHA를 남겼다. 저장·출력의 직접 비교는 [입력·PNG 검사](../.preview/p87-artifacts/output-and-input.validation.json)를 따른다.

시각 검수는 실제 Chromium의 PC·모바일 에뮬레이션 캡처와 다운로드 PNG를 열어 수행했다. 상단 등급 구분·짧은 편집기·이름 검색·갤러리 이미지·빠른 선택 버튼의 겹침 부재를 확인했다. 31인은 내부 이동으로 보고, 전체 구조를 확인하는 PNG는 별도다. 실제 프레임과 범위는 [시각 검수 기록](../.preview/p87-artifacts/visual-qa.json)을 따른다.

알려진 제한은 한국 서버 상성/적성 자체 실측 대기, 기존 미확인 이벤트·번역/출시 자료, 정성 추천의 제한 탐색, 이미지 권리 pending, 500kB 초과 빌드 chunk 경고다. 새 게임 데이터·계산식·확률을 만들거나 인증하지 않았다. 실물 휴대폰·모든 브라우저·권리 승인·한국 실측·P9 공개 호스팅은 이번 검증에 포함하지 않는다.
