# P8.6 — 통합 계보·선택 갤러리·시각형 출력 검증

기준일: 2026-11-05 (Asia/Seoul). **P8.6 구현과 Codex의 PC·모바일 회귀·시각 검수를 완료했다.** 단위 테스트 592개와 현재 브라우저 목록의 112개 시나리오를 확인했다. 브라우저 결과는 최초 전체 실행과 수정 후 집중 재실행을 대조한 결과이며, 한 번에 112개를 모두 통과한 실행으로 표현하지 않는다. 기술 검증과 이미지 공개 재배포 권리는 별개다. 외부 공개 배포와 후속 Work 독립 QA는 수행하지 않았다.

## 1. 최종 지시문과 변경 전 기준선

사용자가 최종 지시로 지정한 `P86_CODEX_IMPLEMENTATION_SPEC.md`를 적용했다. ZIP SHA-256은 `62826ccb0b7ae738a769bfa505d247d3759a07b5517a54a0ced625096f82a816`이다. 원본 ZIP은 Downloads에서 읽고, 경로 이탈이 없는지 검사한 뒤 `.preview/p86-handoff/`에 풀었다.

동봉 Work QA 보고서3종과 사용자 제작7/31인 원본2개, GameTora 육성마·서포트 화면2개 및 기술 정보 노출 참고 이미지를 실제 열어 확인했다. 기존 P8·P8.5 검증·이미지 출처 문서와 현행 코드도 대조했다. Work 초안의 장문 PNG 유지 제안보다 최종 지시문의 **기본 트리 PNG와 편성·수급표** 요구를 우선했다. 참고 이미지의 인물·별수는 기본 게임 데이터로 채우지 않았다.

Work 보고서 안의 `qa-evidence/` 원시 로그·일부 캡처는 이 ZIP에 동봉되지 않았다. 그 링크의 내용을 새로 확인했다고 가정하지 않고, 보존한 실제 P8.5 소스에서 독립적으로 기준 화면과 좌표를 다시 얻었다. `.preview/p86-baseline/`과 `scripts/validate/p86-baseline.mjs`를 사용했으며 기존 사용자 브라우저 저장소를 사용하지 않았다.

| 변경 전 증거 | 실제 보존 파일 |
|---|---|
| 의상·서포트 선택 | `before-{1440,1024,768,375}-{costumes,supports}.png` |
| 7인·기존31인 폼 | `before-{1440,1024,768,375}-{tree7,tree31}.png` |
| 기존 우선순위 | `before-{1440,1024,768,375}-priorities.png` |
| 연결선 좌표 | `before-connector-measurements.json` |
| 데이터·엔진·V1 보호 해시 | `.preview/p86-baseline/protected-sha256.json` |

파일명만 적은 산출물의 기본 경로는 `.preview/p86-artifacts/`다. 기존 P8/P8.5 산출물을 이번 결과로 덮어쓰지 않았다.

변경 전후 실제 화면을 다음과 같이 보존했다. 31인 전체 데이터는 넓은 내부 캔버스에 있으므로 화면 캡처에서는 상단과 이동한 분기를 함께 확인한다.

| 화면 | 변경 전 1440 / 375 | 변경 후 1440 / 375 |
|---|---|---|
| 육성마 선택 | [PC](../.preview/p86-artifacts/before-1440-costumes.png) / [모바일](../.preview/p86-artifacts/before-375-costumes.png) | [PC](../.preview/p86-artifacts/desktop-1440-costume-gallery.png) / [모바일](../.preview/p86-artifacts/mobile-375-costume-gallery.png) |
| 서포트 선택 | [PC](../.preview/p86-artifacts/before-1440-supports.png) / [모바일](../.preview/p86-artifacts/before-375-supports.png) | [PC](../.preview/p86-artifacts/desktop-1440-support-gallery.png) / [모바일](../.preview/p86-artifacts/mobile-375-support-gallery.png) |
| 7인 계보 | [PC](../.preview/p86-artifacts/before-1440-tree7.png) / [모바일](../.preview/p86-artifacts/before-375-tree7.png) | [PC](../.preview/p86-artifacts/desktop-1440-user-tree7.png) / [모바일](../.preview/p86-artifacts/mobile-375-user-tree7.png) |
| 31인 계보 | [PC](../.preview/p86-artifacts/before-1440-tree31.png) / [모바일](../.preview/p86-artifacts/before-375-tree31.png) | [PC 상단](../.preview/p86-artifacts/desktop-1440-user-tree31-top.png) / [모바일 분기](../.preview/p86-artifacts/mobile-375-user-tree31-branch.png) |
| 스킬 우선순위 | [PC](../.preview/p86-artifacts/before-1440-priorities.png) / [모바일](../.preview/p86-artifacts/before-375-priorities.png) | [PC](../.preview/p86-artifacts/desktop-1440-user-priorities.png) / [모바일](../.preview/p86-artifacts/mobile-375-user-priorities.png) |

전체 산출물·원시 로그별 실행 상태·파일 SHA-256은 [산출물 안내](../.preview/p86-artifacts/README.md)와 [manifest.json](../.preview/p86-artifacts/manifest.json)에 연결한다. 이 파일들은 로컬 참고 검증 자료이며 공개 재배포 허가를 의미하지 않는다.

## 2. 같은31노드의 7/31인 통합 계보

`UnifiedLineageTree`와 순수 표시 함수 `getLineageTreeGeometry`를 추가했다. 7인 접힘은 본육성1·부모2·조부4, 펼침은 **동일 상위7 + 증조8 + 고조16**이다. 기본 캐릭터를 임의로 넣지 않는다. 상위7의 월드 좌표·스타일·연결은 같은 데이터에서 유지하고, 표시 상태만 바꾼다.

- 카드 선택 또는 노드 찾기에서 상세 편집을 열어 의상·적인자·별수·잠금·동일 의상 실물 교체·혈통 확인을 관리한다. 모바일은 하단 시트를 사용한다.
- 넓은 트리는 내부 가로·세로 이동, 키보드 방향키, 분기·노드 이동과80/100/150% 확대를 지원한다. 페이지 전체를31명 폭으로 늘리지 않는다.
- 기존 증조·고조의 거대 상시 입력 폼은 제거했다. 목표 적성·중상작 로테이션 필요 적성·유전자·잠금·배분 제약은 **31인 인자 계획·배분 설정**에서 기존 상태와 엔진을 재사용한다.
- P7 실제 보유 백인자·제작 목표·노드 우선순위·노드 추천은 계속 스킬·서포트 화면의 **인자작 계획**에 있다. 기본 계보에 다시 합치지 않았다.
- 접힘/펼침·줌·조회는workspace에 기록하지 않는다. UUID 생성·계보 교체·자동 배치·적인자 배분을 호출하지 않으며, 계산/평가도입력 기반으로메모화했다.

`presentation-roundtrip-{before,after}.json`의 실제 내보내기와 별도 validation JSON에서 전체31인 입력·parentIds·UUID·보유·잠금·노드 목표·저장 dirty를 대조한다. 테스트 인자는 실제 canonical ID와 사용자 합성 기록이며, 한국 서버에서 관측한 완성 인자 인증이 아니다.

## 3. QA-01 연결선과 QA-02 안내 수정

기존 CSS25%/75% 선을 실제 `parentIds` 관계의 SVG로 교체했다. 노드의DOM 경계를 ResizeObserver로 읽어 같은 월드 좌표계에서 자식 하단 중앙과 실제 부모 상단 중앙을 잇는다. 노드·선에 같은 패닝/줌 변환을 적용한다. 접히면 숨은24명의 선도 제거한다.

독립적인 네 조부 혈통이 같은 높이의 수평선 끝에서 붙어 보이는 문제도 코드 검토에서 발견했다. 외곽/안쪽 분기의 중간 높이를 나눠 실제 관계의 선만 이어 보이도록 했으며, PNG 역시 공통 `edge.points`를 사용한다.

| 화면 폭 | P8.5 직접 재현한 최대 중심 오차 | P8.6 측정 |
|---|---:|---|
| 1440px | 68.5 CSS px | 0.00006103515625 CSS px |
| 1024px | 15.5 CSS px | 0.00006103515625 CSS px |
| 768px | 25.5 CSS px | 0.00006103515625 CSS px |
| 375px | 2 CSS px | 0.00006103515625 CSS px |

새 검사는 실제 31인 V1을 복원한 후 4화면폭×3캔버스확대율×7/31모드로 선의 from/to 좌표와 DOM 앵커를 대조했다. PC·모바일 프로젝트별 24개, 총 48개 조합이 모두 1 CSS px 허용오차를 만족했다. 실제 좌표와 캡처는 [PC 측정](../.preview/p86-artifacts/desktop-connector-measurements.json), [모바일 측정](../.preview/p86-artifacts/mobile-connector-measurements.json), `*-lineage-{width}-{7,31}-{80,100,150}pct.png`에 있다. 브라우저 자체 Ctrl+줌이나 실물 휴대폰의 모든 핀치 동작을 인증한 것으로 표현하지 않는다.

표의 오차는 x/y축별 최대 절댓값이다. 독립적으로 원시 좌표를 다시 계산해 총 864개 관계선·1,728개 끝점·3,456개 축 좌표를 대조했으며, 끝점의 유클리드 거리 최대도 0.00006823937919616058 CSS px였다. 선의 관계 집합은 V1 `parentIds`와 일치했다.

QA-02의 `게임 이미지 미사용`은 실제 계보 하단의 **로컬 참고용 이미지·공개 이용허가 미확인**으로 수정했다. 필요한 고지를 한 줄로 유지했다.

## 4. 독립적인 두 자동 기능과 데이터 보존

| 기능 | 호출과 변경 범위 | 사용자 동작·보호 |
|---|---|---|
| 7인 배치 | 기존 `enumerateLineageArrangements` 그대로. 허용된 조부 배치와 연결된 혈통 이동 | **7인 배치안 보기 → 비교 → 명시 적용**. 취소는원본변경0 |
| 31인 적인자 | 기존 `allocateRedFactors` 그대로. 허용된 깊은 조상 계획 인자만 | **31인 적인자 배분안 만들기 → 인자/적성 차이 → 명시 적용**. 별도취소 |

상위7 캐릭터·현재 혈통·확정/잠금 인자·개체 소유 관계·UUID와 목표 제약을 유지한다. 미리보기 signature에 계획·기준일·필터/설정·개체 상태를 포함해 입력이 바뀐 결과를 적용하지 못하게 한다. 유효하지 않은 날짜는 현재일 fallback과 구분해 실행을 막는다. 새 스키마나 불완전한 되돌리기를 추가하지 않았다.

실제 PC·모바일에서 두 기능의 미리보기·취소·적용을 각각 실행했다. 7인 배치 취소와 31인 배분 취소 모두 전체 입력이 같았다. 검증 사례의 7인 적용은 부모의 연결만 이동했고, 31인 적용은 잠기지 않은 깊은 조상 18명의 계획 적인자만 바꿨다. 상위 7인·잠긴 고조와 전체 31개 UUID는 유지됐다. 잘못된 날짜와 같은 의상의 새 실물 UUID로 변경한 경우 두 이전 미리보기 모두 적용을 차단했다. [PC 증거](../.preview/p86-artifacts/desktop-automation.validation.json)와 [모바일 증거](../.preview/p86-artifacts/mobile-automation.validation.json), 각 `*-automation-*.json/png`에 전후 입력과 미리보기가 있다.

공개식 159점(31/26/24/22/23/15/18), 유전자 12/12/12/6, 6배치·잠금·현재/미래 출시 제약도 단위·실DB·기존 브라우저 회귀에서 유지했다. 자동 기능의 범위 검사는 게임 규칙을 새로 독립 인증한 것과 구분한다.

## 5. 이미지 중심 갤러리와 스킬 설정

| 화면 폭 | 의상 열 수 | 서포트 열 수 |
|---|---:|---:|
| 1440px | 6 | 10 |
| 1024px | 5 | 9 |
| 768px | 4 | 6 |
| 375px | 2 | 3 |

실제 모달 안의 열 수를 브라우저에서 측정했다. 서포트는 자동 그리드라 제안 열 수에 억지로 맞추지 않는다. 의상은 정사각 초상화·캐릭터명·의상명을 기본으로, 서포트는 정사각 아이콘·타입 아이콘·은색R/금색SR/프리즘SSR·선택 여부를 중심으로 표시한다. 카드 선택과44px 이상 별도 상세 버튼을 구분하고, hover 없이 키보드·터치로 상세에 접근한다. 전체 카드 아트는 상세에서 원비율로 제공한다.

검색/ID 검색·정렬·출시 제한·해제·검색0건/초기화·Escape 복귀·포커스·선택 취소를 유지했다. 타입7×레어도3×출시상태3=63교집합은 기존 판정을 그대로 쓴다. 같은 인물의 기본/웨딩, R/SR/SSR/다른SSR, 친구/그룹의 실제 이미지를 재사용했다. 갤러리에서 보이는 이미지의 브라우저 decode도 확인했다. 측정8건·실제캡처24개·직접열어확인한표본은 `galleries-validation.json`에 있다.

전역 스킬 우선순위는 원래도 추천 실행 전에 있었고, 이번에는 기본 펼침으로 발견하기 쉽게 했다. 대회/시나리오→본육성6장→전역 목표→보유/대여→실행 순서를 유지한다. P7 노드 목표는 인자작 계획 영역에서독립 관리하며 중복 편집·암묵적 복사를 하지 않는다. 결과 상단에는 **이번 계산에 적용한 대회·각질·시나리오·범위·카드 조건·필수/강함/선호 목표**를 표시하고, 변경 시 이전 결과를 무효화한다.

Windows에 설치된 Edge의 PC 및 모바일 터치 에뮬레이션에서 1440×1000, 1024×1000, 768×1000, 375×812를 실제 조작했다. 7인→31인→분기 이동→노드 편집과 본육성 6장→전역 목표→적용 결과 요약을 확인했으며, 페이지 가로 넘침과 pageerror는 0이었다. [PC 흐름](../.preview/p86-artifacts/desktop-user-flow.validation.json), [모바일 흐름](../.preview/p86-artifacts/mobile-user-flow.validation.json)에 관측값이 있다. 최종 캡처는 보이는 그림의 decode 이후 얻었고, 실제 7명 초상화·6장 카드 식별 및 모바일 하단 편집 시트를 열어 확인했다.

기본 카드와 본육성 슬롯은 이름·그림·레어도·타입·필요한 가용 상태만 표시한다. DB ID·UUID·이미지 치수·원본 출처·2차 자료 날짜는 기본 카드, 결과, 계획 비교와 PNG에서 숨겼다. ID 검색과 사용자가 여는 기술 상세, JSON, 내부 감사 데이터는 유지했다. `data-*` 검증 속성에 남은 ID를 보이는 텍스트로 혼동하지 않는다.

## 6. 기본 PNG3종과100% 시각 검수

기본 버튼은 새로운 시각형 출력을 생성한다. 장문 세로 로그는 기본 출력으로 사용하지 않는다. 화면과 PNG는 같은 계보 지오메트리를 공유한다.

| 기본 출력 | 실제 형태 | 최종 해상도·파일 |
|---|---|---|
| 7인 | 초상화·이름/의상·적인자·고정과 상성/적성의 7인 트리 | **1914×1476**, [PC](../.preview/p86-artifacts/desktop-lineage-7-images.png) / [모바일](../.preview/p86-artifacts/mobile-lineage-7-images.png) |
| 31인 | 같은 상위 7과 증조 8·고조 16, 넓은 고해상도 트리 | **3972×2037**, [PC](../.preview/p86-artifacts/desktop-lineage-31-images.png) / [모바일](../.preview/p86-artifacts/mobile-lineage-31-images.png) |
| 서포트 6장 | 실제 아트 3×2 편성 + 두 단의 4열 스킬 수급표 | **2080×3005**, [PC](../.preview/p86-artifacts/desktop-support-6-images.png) / [모바일](../.preview/p86-artifacts/mobile-support-6-images.png) |

서포트 표는 현재 `compatibleSkillIds` 전부를 사용자 필수/우선 목표→녹딱→나머지 목표 순서로 표시한다. `스킬명 / 공급 서포트와 편성번호 / 힌트·이벤트·금색 하위 경로 / 조건·확실성`을 제공한다. 현재6장과 `getCompatiblePlanRoutes`가 확인한 선택 분기만 사용한다. 일부 이벤트 미확인과 별도 힌트 경로가 겹치면 힌트행을 유지하고 미확인 경로를 구분한다. 획득 기회·조건 미확인·성공 분기·확정 보상을 혼동하지 않으며 성공률을 생성하지 않는다.

새 출력은UUID·nodeId·게임ID·이미지 규격·snapshot·긴 출처/로그를 인쇄하지 않는다. 내부 canonical ID와 모든31 UUID·백인자·연결·선택 이벤트/경로는V1 JSON과 문서 `audit`, Canvas기록/자동 대조에 남긴다. 고지footer는작은한줄이다. 그림 실패 시 동일 대상의 이름/의상/인자는 유지하며, 다른 카드로 바꾸지 않는다. 원비율, 입력 서명/Blob 전후 검사, 컴포넌트 종료 차단, Canvas 높이/면적 상한을 유지했다.

실제 PC·모바일의 3종×2개를 다운로드하고 6개 전체 파일을 열어 확인했다. [고조 이름·인자](../.preview/p86-artifacts/desktop-lineage-31-100pct.png), [잠금 혈통](../.preview/p86-artifacts/desktop-lineage-31-protected-100pct.png), [스킬 표](../.preview/p86-artifacts/desktop-support-table-100pct.png)는 원본을 리샘플링하지 않은 100% 픽셀 crop이다. 넓은 전체 구조와 이름·인자·카드 원비율·행 경계·footer·잘림 여부를 별도로 검수했다. 31인의 고조 글자와 전체 48개 목표의 수급표가 읽히며, 기본 출력에 기술 ID나 긴 출처가 없다.

각 종류의 PC·모바일 파일은 바이트가 동일했다. SHA-256은 7인 `c3a36f3ea98314532be941827ecce13a9e800aa1d30e604b533d055bb27078d8`, 31인 `f31f4f42f33c6ed8787c57ce811e25e248b192a5e25f58efa549ddd6ebf35ccb`, 6장 `81472e918231d5fb1feafe9d7868647719f72464f4ca2bebff8cb7b2538477f9`다. [시각 검수 기록](../.preview/p86-artifacts/png-visual-qa.json)은 이 해시와 실제로 연 화면의 범위를 기록한다.

현재 추천은 CM39 한신 2200m·선행·균형·시나리오 11·미래시 허용·가상 4돌파, 터다지기 필수/선행 코너○ 우선의 기존 B 편성(30175·30113·30140·10126·30226·30107)이다. **374+8=382점, 양립 목표 48개, 녹딱 8개**를 유지했다. [PC 수급표 전수 대조](../.preview/p86-artifacts/desktop-support-table-coverage.validation.json)와 [모바일 대조](../.preview/p86-artifacts/mobile-support-table-coverage.validation.json)는 48개 실제 스킬 ID·이름·공급 카드·현재 입력 서명과 출력 행을 대조한다. ID는 감사 자료에만 있으며 기본 PNG에는 인쇄하지 않는다.

추가로 1440/1024/768/375px 각각에서 **실제 내보내기 버튼을 눌러 3종을 다운로드**했다. PC·모바일 프로젝트별 12개, 총 24개이며 `*-{width}-flow-{7,31,supports}.png`로 대표 6파일과 분리해 보존했다. [PC 4폭 출력](../.preview/p86-artifacts/desktop-four-width-output.validation.json)과 [모바일 4폭 출력](../.preview/p86-artifacts/mobile-four-width-output.validation.json)에 각 파일의 실제 치수·SHA·이미지 ID·현재 결과 서명·스킬 행 대조가 있다. 세 종류의 해상도는 위와 같고, 같은 종류는 8개 모두 바이트가 같았다. 모든 서포트 출력에 현재 스킬 48개가 빠짐없이 인쇄됐다. 이는 단순 창 크기 변경 후 미리보기 검사로 대체하지 않았다.

[4폭 시각 검수](../.preview/p86-artifacts/four-width-output.visual-qa.json)에는 실제로 연 새 PNG 12개와 같은 종류별 바이트 동일성, 최신 UI 8개 재열람 범위를 기록했다. 추가 검증 후 대표 6개 PNG 해시는 그대로였으며, 스크롤 위치로 바뀐 모바일 7인 화면 1개의 검수 해시는 실제 최신 캡처를 연 뒤 갱신했다.

## 7. P8 V1·추천·게임 원본 회귀

P0/P1/P3/P5 게임 계약과 `uma-saved-plan` schemaVersion1/formatVersion1은 그대로다. 표시모드·줌·패닝·갤러리 검색·필터는V1에 넣지 않았다. 현재 데이터로 추천/저장6장을 재평가하고, 과거 `resultSnapshot`을 새 수급표 입력으로 쓰지 않는다.

새 실DB CLI에서159점7항목,31개 소유자/입력 roundtrip,유전자12/12/12/6과6배치, 현재6장의374+8=382/양립48/녹8 및 선택 이벤트 계획 일치를 확인했다. SQLite integrity ok·FK0·내장 스냅샷/정규화 행 일치다. P3는2,223스킬·566서포트·16,207경로·5,457이벤트를 그대로 재사용했다. 한국 인증 정량값과 백인자 자격 직접 인증은0건을 유지한다.

실제 PC·모바일에서 31노드를 직접 입력하고 저장·새로고침·명시 복원을 수행했다. 각 파일은 18,425바이트로 복원 전후 SHA와 전체 JSON·입력·메타데이터가 같았다. 31개 고유 UUID, 같은 의상 24개의 독립 실물 UUID, 30개 부모 연결, 적인자 25개, 잠금 2개, 보유 기록 2개/계획 기록 1개 및 미확인 별수 2개가 보존됐다. 전역/노드 목표, 본육성 6장과 각각의 돌파, 보유·대여 설정도 비교했다. [저장·복원 증거](../.preview/p86-artifacts/p86-persistence-evidence.json)에 전후 실제 다운로드 JSON과 화면, SHA를 연결했다. 사용자 인자 입력은 합성 검증 기록이며 게임 DB와 혼합하지 않았다.

보호 대상 P1/P3/P5 JSON·SQLite·추천 엔진·7인 배치 엔진·적인자 배분 엔진·V1 도메인 8파일의 SHA가 모두 같았다. 추가로 전체 `src/engine` 26파일, `src/domain` 12파일, fixture 5파일, snapshot 1파일과 이전 P8 산출물 29개·P8.5 산출물 70개의 바이트가 유지됐다. 기준은 `.preview/p86-baseline/protected-sha256.json`, 최종 감사는 [p86-preservation.validation.json](../data/local/p86-preservation.validation.json)이다. 새로운 게임 메타 수집·가중치·동률 정책·계산 수식 변경은 하지 않았다.

## 8. 실제 실행 기록·실패·재검증

| 새로 실행한 검사 | 확인 결과 | 원시 로그 |
|---|---|---|
| `npm.cmd run check` 최종 | 단위 592/42파일·lint·TypeScript·계약·build 통과 | `.preview/p86-check-delivery.log` |
| 트레이너스 교차검증 | 6통과 | `.preview/p86-trainers.log` |
| 실DB 저장/계산/추천 | 통과·SQLite ok/FK0 | `.preview/p86-p8-data.log` |
| 기존 전체 이미지·필터·대회 | 1,404/63교집합/53대회·원본 무결성 통과 | `.preview/p86-assets-data.log` |
| 새 갤러리와 기존 선택 검사 |20distinct 통과(18+수정 후2 재검사) | `p86-galleries-e2e*.log`, `p86-reference-focused.log` |
| PNG·워크플로·표시 불변성 |20중18통과 후 시각2건 fixture시간 수정, 최신PNG/불변성10통과 | `p86-output-integration-e2e.log`, `p86-output-focused-e2e.log` |
| 최초 전체 브라우저 108 | 96통과/12실패, 실패 원문 보존 | `.preview/p86-e2e-full.log` |
| 31인 직접 입력·저장·복원 재검사 | PC·모바일 2통과, 전체 JSON·메타·SHA 동일 | `.preview/p86-save-final-e2e.log` |
| 집중 재검사 26 | 24통과/2실패. 최초 실패의 나머지 10개 모두 통과; 새 흐름의 텍스트 API 불일치 2개는 아래 재검사 | `.preview/p86-final-focused-e2e.log` |
| 새 사용 흐름 재검사 | PC·모바일 2통과 | `.preview/p86-user-flow-final-e2e.log` |
| 최종 기본 라벨·이미지 decode 후 4폭 사용 흐름 | PC·모바일 2통과, 4폭 각각 넘침·pageerror 0 | `.preview/p86-user-flow-image-ready-e2e.log` |
| 네 폭에서 3종 PNG 실제 버튼 다운로드 | 기존 사용 흐름 2개를 보강해 재통과, 총 24 PNG·48행 전수 대조 | `.preview/p86-four-width-output-e2e.log` |
| 최종 테스트 보강 후 lint·TypeScript | 둘 다 exit 0 | `.preview/p86-final-test-lint-type.log` |
| 최종 감사 스크립트 lint | exit 0 | `.preview/p86-evidence-lint-delivery.log` |
| 현재 브라우저 사례 목록 | 22파일·112시나리오. 최초 108 + 독립 자동기능 2 + 4폭 사용흐름 2 | `.preview/p86-e2e-final-list.log` |
| 최종 정적 빌드·권리 경계 | 기본 PNG 0·직접404, root/nested 각각 1,404 decode·3 Canvas 표본 성공 | `.preview/p86-static-delivery.log` |

별도 명시가 없는 로그는 `.preview/`에 있다. 현재 목록의 **112개 시나리오 모두 이번 작업 중 통과한 실행이 있다.** 최초 전체 실행의 96개와 그 실패 12개를 복구한 재실행, 이후 추가된 자동 기능 2개·사용 흐름 2개를 시나리오별로 대조한다. 집중 실행에 중복 포함된 PNG·연결선·접힘 보존 검사를 새 시나리오로 더하지 않았다. 이전 P8/P8.5·Work의 테스트 수나 반복 실행 수를 이번 고유 사례 수로 합산하지 않는다. 원시 로그와 실패 trace는 별도로 유지한다.

[고유 사례 전수 대조](../.preview/p86-artifacts/p86-e2e-case-coverage.validation.json)는 현재 `--list`와 실행 로그를 `[프로젝트]+파일명+전체 테스트 제목`으로 정확히 연결한다. PC 56/56, 모바일 56/56, 누락 0이며 각 사례의 마지막 관측도 통과다. 소스 줄 번호나 재실행 횟수를 다른 사례로 세지 않는다. 초기 실패 이력 14건도 남겼다. 이 감사는 서로 다른 실행 당시 소스 바이트까지 동일하다고 인증하지 않는다.

마지막 4폭 출력 보강은 기존 사용 흐름 2개의 검사 범위를 넓힌 것이며 시나리오 수를 114개로 늘려 세지 않았다. 앱 소스나 대표 PNG 6개를 바꾸지 않았고, 이후 테스트 lint·TypeScript와 사례 대조를 다시 수행했다.

재현 명령은 `npm.cmd run check`, `npm.cmd run test:trainers`, `npm.cmd run data:validate:p8`, `npm.cmd run data:validate:p85`, `npm.cmd run data:validate:p86`, `npm.cmd run data:validate:p86:static`이다. 전체 브라우저는 `npm.cmd run test:e2e -- --output .preview/p86-full-test-results`, 집중 범위는 `node scripts/validate/p86-focused.mjs`, 최종 사용 흐름은 `npx.cmd playwright test tests/e2e/p86-user-flow.spec.ts`다. Windows 프로세스 생성 제한 때문에 TSX/브라우저 검사는 허용된 sandbox escalation으로 실행했다. 자동 승인 거부는 없었다.

실패 이력:

1. 변경 전 캡처 첫 시도에서 존재하지 않는 테스트 ID를 사용해 중단됐다. 보존한 P8.5의 실제 접근성 이름으로 고쳐 네 크기 캡처를 완료했다.
2. 갤러리 첫 실행의6건, 다음 실행의2건은 새 제목/축약 출시 라벨/레어도 위치에 맞지 않던 기존 선택자였다. 축약 상태와 명시적인 기술 상세를 모두 확인하도록 이관했고, 검사 의미를 삭제하지 않았다.
3. 새 표시 불변성 테스트의 고정 시각이 실DB CLI가 갱신한V1 예시 생성일보다 빨라 내보내기가 엄격 검증에서 거부됐다. 원본V1을 수정하지 않고 해당 격리 브라우저 시각을 생성/수정일 이후로 두어 재검증했다.
4. 최초 전체 실행의 12개 실패는 PC·모바일 각각 같은 여섯 기존 선택자였다. 중앙 편집기와 실물 요약의 중복 버튼 이름, 깊은 조상의 축약 출시 상태, 명시적 상세로 이동한 P4.1 출처/P5 일본 날짜, 새 7인 배치 미리보기 버튼을 예전 방식으로 찾았다. 실제 새 조작 위치에 맞게 범위를 한정하고 상세를 열어 원래 검증 의도를 유지했다. 긴 31인 저장 복원 2개는 별도 실행으로, 나머지 10개는 집중 실행으로 모두 통과했다. 엔진 기대값을 변경해 통과시키지 않았다.
5. 집중 실행의 새 사용 흐름 2개는 보이는 `innerText`를 캡처한 뒤 기본 `textContent`와 비교해 공백 표현이 달랐다. `useInnerText: true`로 같은 API끼리 대조해 통과했다. 마지막 기본 가용성 라벨 정리 후에도 4폭 흐름을 다시 실행했다. 캡처는 보이는 이미지 decode를 기다려 지연 로딩 중 빈 그림을 최종 화면으로 제출하지 않게 했다.
6. 실제 UI 검수에서는 기본 7인 카드의 아래 잘림과 폭 변경 후 시선 이동, 독립 혈통의 수평선이 붙어 보이는 문제가 발견됐다. 카드 폭/캔버스 높이·resize 중심 유지·관계선 중간 높이를 고쳤고 최종 연결선/4폭 사용 흐름/PNG를 재생성·검수했다. 이는 위의 테스트 선택자 이관과 별개의 제품 수정이다.

## 9. 이미지·권리 게이트와 정적 로딩

이미지 매핑을 이름으로 다시 만들지 않았다. 기존 의상272종·서포트566아이콘·566전체아트,총1,404PNG·누락0을 사용한다. 원본매니페스트와 실제 파일 SHA/ID를 재검증했다. 공개권리는 **승인0 / pending838 canonical ID**이며 신규 허가를 확보한 것으로 표시하지 않는다. 출처·조건은 [P85_ASSET_SOURCES.md](P85_ASSET_SOURCES.md), 전 보류 ID는 `data/assets/p85-public-release-blocked.json`이다.

개발 캐시는 `data/local/p85-assets/game-assets/`, 명시적 비공개 검증 출력은 기존 `.preview/p85-private-static`을 재사용한다. 일반 `public/`·`dist/`에 보류 이미지를 자동 포함하지 않는다. 공개outDir를 지정한 private flag는 삭제 전에 거부한다. P86 정적 검증은 기존 검사기를 `--p86`으로 실행해 이번 로그/캡처/결과를 별도로 보존한다. 결과는 `data/local/p86-static-assets.validation.json`이다.

이번 실제 검사에서 기본 배포PNG0·JS 인라인PNG0·직접GET404, `/`와 `/nested/uma/` 각각1,404/1,404 디코딩·3종 Canvas 비오염 및PNG변환이 통과했다. 재배포 권리 검사는보류838 때문에 의도적으로 차단된다. 외부 공개 호스팅과 전체 게임DB의 프로덕션 공급은P9 범위다.

## 10. 남은 범위와 최종 판정

**P8.6 필수 구현과 로컬 기술·UI 검증을 완료했다.** 실제 이미지로 캐릭터/의상을 고르고, 동일 31인 계보를 접고 펼치며 노드를 편집하고, 6장 카드와 현재 양립 스킬 수급표를 화면·PNG에서 읽는 흐름을 확인했다. 후속 Work 독립 QA는 이 보고서·원시 자료를 이용해 수행할 수 있으며 이번 Codex 검수와 구분한다.

미해결 기능 결함이나 검수에서 발견한 재현 가능한 잘림은 남기지 않았다. 시각적 선택으로 모바일 본육성 슬롯 아이콘은 약 52px이고 새 선택 갤러리의 약 96px 아이콘보다 작다. 이름·타입·등급과 조작은 확인했으나 실물 휴대폰·스크린리더·모든 브라우저/폰트 조합까지 인증한 것은 아니다. 좁은 화면의 31인은 내부 이동이 필요한 설계이며 전원을 한 화면에 축소하지 않는다. 일부 한국어 이름이 없으면 일본어 이름을 유지하고 추측 번역하지 않는다. 한국 서버 게임 실측·정량 마신 인증·이미지 권리는 별도다.

공개 이미지권리838건과P9 전체DB공급·공개배포·주번들분할은 남는다. 현재 주번들 약983kB 경고가 있으나 이미지 바이너리를 인라인하지 않았다. 계정/클라우드·종마 추천·새 확률모델·엔진 재설계는 추가하지 않았다.
