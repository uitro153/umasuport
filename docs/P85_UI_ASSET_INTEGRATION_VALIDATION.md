# P8.5 — UI 구조·게임 이미지 통합 검증

기준일: 2026-11-05. **기술 구현·이미지 확보/ID 대조·로컬 UI/PNG·기존 회귀 검증 완료. 공개 재배포 허가는 별도 보류.** 사용자는 별도 허가 문서가 없음을 확인했고, 로컬 개발·검증을 계속하되 권리 미확인 이미지를 공개 파일에 자동 포함하지 않도록 지시했다. 이미지 매핑 성공을 이용허가 확보로 표현하지 않는다.

## 1. 기존 화면 대비 UI 변경

| 화면 | 이전 | 변경 |
|---|---|---|
| 육성마 선택 | 텍스트 중심, 글자 대체 이미지 | 의상별 원본128px 정사각 초상화·캐릭터명·의상명 |
| 7/31인 계보 | 각 카드의 반복 백인자·스킬 버튼과 별도 긴 편집 | 상성·혈통·적인자·개체 관리 중심. 이미지와 개체·혈통 상세 제공 |
| 인자작 계획 | 계보와 스킬 화면을 오가며 편집 | 스킬·서포트 화면에서 노드 선택→실제 보유/제작 목표/별수/목표/시점/추천을 연결 |
| 서포트 목록 | 큰 제목·장문 정보 | 왼쪽 카드 아이콘, 가운데 카드명/인물, 오른쪽 타입/레어도. ID/출처/전체 일러는 상세 |
| 대회 목록 | 날짜·일본 회차·설명과 과거 대회 혼재 | 대표 시나리오·대회 형식·거리·경기장 중심. 과거는 별도 표시 |
| PNG | 텍스트 중심 | 현재 검증된 텍스트·계산을 유지하면서 해당 ID의 실제 초상화/카드 아트 추가 |

공통 이미지 컴포넌트는 `src/ui/assets/GameAssetImage.tsx`다. canonical ID 외의 이름/해시 추측 매핑을 하지 않는다. 지연 로딩과 브라우저 캐시를 사용하며 잘못된 이미지 요청은 해당 이름·ID의 빈 이미지 표시로 바꾼다.

## 2. 육성마 이미지 매핑 수·누락

현재 실제 P1 reference의 **의상272종 / 매핑272 / 누락0**. 사용자 제공 원자료 `asset.json`의 `images/character_thumbs/{costumeId}-이름.png`와 제공 파일 SHA-256을 전수 대조했다. UmaTools 수집 코드에서 GameTora의 전용 `chara_stand_{charId}_{cardId}.png` 초상화를 사용하는 출처도 확인했다. 파일은 PNG128×128이며 전신을 새로 잘라 만들지 않았다.

선택 목록·7인 카드·31인 카드·개체 상세·계획 비교·계보 PNG에서 같은 costumeId를 사용한다. 이름/한국어 번역 여부나 기본 의상으로 다른 의상의 이미지를 대체하지 않는다. 전수 자료는 `data/assets/p85-manifest.json`, 검사 결과는 `data/assets/p85-validation.json`이다.

## 3. 서포트 이미지 매핑 수·누락

| 구분 | canonical ID 대상 | 성공 | 누락 | 파일 |
|---|---:|---:|---:|---|
| 의상 초상화 | 272 | 272 | 0 | PNG128×128 |
| 서포트 아이콘 | 566 | 566 | 0 | PNG128×128 |
| 서포트 전체 일러스트 | 566 | 566 | 0 | PNG300×400 |

전체 **1,404PNG·50,410,510바이트**. 같은 카드의 아이콘/전체 일러를 구분하며 기존 P3 `supportId`가 요구사항의 supportCardId와 같은 canonical ID다. 유형별 키 `costume:{id}` / `support:{id}`를 분리한다. 다른 ID/유형의 동일 파일 경로·동일 SHA 의심 중복0건이다.

본육성 선택기·보유 등록 목록·선택6슬롯·추천/기본/대체 편성·계획 비교에 카드 아이콘을 연결했다. 선택기 상세와 추천 상세에는 전체 아트를 제공하고 PNG에는 같은 카드 ID의 전체 아트를 사용한다. PNG 바이너리를 JS 번들에 인라인하지 않는다.

## 4. 실제 출처·이용조건·ID 체계

상세 원문과 조사 근거는 [P85_ASSET_SOURCES.md](P85_ASSET_SOURCES.md)를 따른다.

- 제공838개 썸네일: 기존 사용자 원자료 및 `data/raw/p3-base-2026-11-04/json/asset.json`. pinned UmaTools 원본 파일명·SHA와 실제 costume/support ID를 전부 대조했다.
- 추가566개 아트: GameTora 카드 상세의 동일 숫자 support ID에 연결된 `media.gametora.com/umamusume/supports/full/small/{supportId}.png`. 전부HTTP200/PNG300×400. URL·취득일·ETag·Last-Modified는 `data/assets/full-art-downloads/`에 보존했다.
- Cygames 약관/가이드라인, GameTora 권리 표기, UmaTools 코드 라이선스, Wiki 게임 이미지 권리 표기를 구분해 조사했다. 공개 접근·코드GPL·일반 사이트CC 표기를 게임 원본 아트의 공개 재배포 허가로 승격하지 않았다.

권리 확인 **승인0 / canonical ID838개 pending**. 확보 누락0과 다른 집계다. 보류 전체 ID·원인은 `data/assets/p85-public-release-blocked.json`에 있다. 현재 파일은 `data/local/p85-assets/game-assets/`에 두고 `public/`와 물리적으로 분리했다. 실제 외부 공개 배포는 수행하지 않았다.

## 5. 동일 캐릭터의 다른 의상·카드 구별

대표20개 실제 ID를 원문 페이지·파일·시각으로 대조했다. 두 contact sheet를 실제 열어 확인했으며 결과는 `.preview/p85-artifacts/asset-visual-samples.json`이다. 전수838개 모두를 독립 육안 검수했다고 주장하지 않는다.

- 에어 그루브101801 기본/101802 웨딩, 마야노 탑건102401 기본/102402 웨딩은 이름·옷·부케/초상화가 다르다. 오구리100601/100602, 스페셜 위크100101/100102도 구분했다.
- 스페셜 위크 R10001 / SR20043 / SSR30001 / 다른 SSR30025는 같은 인물이어도 다른 실제 일러스트와 아이콘을 표시한다.
- 친구10021/30021, 그룹30067/30137을 실제 상세의 분류 및 그림과 대조했다. 단순 인물명 유사성으로 친구/그룹을 합치지 않는다.
- UI에서 기본→웨딩 선택, 같은 costumeId의 7인→31인 표시, V1 JSON 복원 후 같은 이미지 경로를 확인했다. 파일 존재·해상도만을 의미적 정확성 인증으로 쓰지 않았다.

## 6. 모든 서포트 필터 동작

타입·레어도·출시·검색을 각각 독립된 표시 상태로 관리하고 교집합으로 적용한다. 전체/스피드/스태미나/파워/근성/지능/친구/그룹 및 전체/R/SR/SSR, 기존 이름·ID 검색/한국 출시 필터를 제공한다. 결과 수·초기화·결과 없음도 포함한다.

실제 원본 타입은 speed125 / stamina97 / power101 / guts112 / intelligence101 / friend25 / group5. 원본 raw.type과 전부 동일했다. UI는 지능의 기존 별칭을 정규화하되 원본 DB 분류를 바꾸지 않는다. 실제566장의 **타입7×레어도3×출시 상태3=63개 교집합**을 독립 집계했다. `data/local/p85-support-filters.validation.json`에 기록했다.

임시 필터·검색은 local UI 상태이며 P8 V1 JSON에 추가하지 않았다. 추천의 가용성·점수·동률 정책은 변경하지 않았다.

## 7. 계보 계산기와 인자작 계획 분리

계보 카드에서 `백인자·스킬` 버튼을 제거했다. 계보에는 캐릭터/의상·빨간 인자·별수·혈통·개체 교체/확인만 남겼다. 스킬 화면의 **인자작 계획**에서 부모·조부를 우선 선택하고 본육성/깊은 조상은 별도 상세 그룹으로 접근한다.

선택 노드의 실제 보유·제작 목표·별수 미확인·미입력/부분/확인 상태, 노드별 우선순위, 현재/미래시 수급 시점, 명시적 노드 추천을 연결한다. 전역 P6 목표는 다른 범위로 유지한다. 같은 노드의 우선순위 편집기가 두 번 보이지 않게 계획 편집 중에는 추천 영역의 중복 편집기를 숨긴다. 편집 상태는 입력과 별개이며 전역 복귀 후 접힌 설정을 다시 열어도 기존 선호 값이 남는다.

nodeId·factorInstanceId·ownerCostumeId·잠금·혈통 재확인·백인자 소유 관계는 그대로다. 단순 개체 조회는 저장 목표를 바꾸지 않는다. 최종 본육성의 백인자 입력을 기본 상성의 필수 조건으로 만들지 않았다.

## 8. 미래시 대회 목록 변경

실제53개 ID를 보존하고 기본 목록에는 **예정14개**, 지난39개는 별도 `지난 대회 목록 포함`으로 표시한다. 저장된 과거 대회를 복원했거나 선택한 경우 그 ID만 별도 그룹에 유지하므로 조용히 다른 대회로 바꾸지 않는다.

표시 예시:

- CM39: `[무인도] [챔미] [중거리 2200m] 한신`
- CM44: `[Beyond Dreams] [챔미] [중거리 2200m] デルマー`

CM44의 실제 데이터는 한신이 아니라 델마의 일본어 원문 지명이다. 새 UI 테스트에서 처음 한신으로 잘못 둔 기대값은 원본 코스를 확인해 고쳤고 게임 데이터를 기대값에 맞춰 바꾸지 않았다. 한국어 지명이 없는 항목의 원문 표기는 남아 있다.

대표 시나리오는 대회별 가용 시나리오 중 실제 출시 순서를 사용하며 사용자의 인자작 시나리오 선택을 수정하지 않는다. CM44는 JP시나리오13 출시2026-02-24 < JP대회2026-03-22를 보존해 Beyond Dreams를 표시한다. 한국 예상일6월15일/대회6월14일을 혼용하지 않는다.

기본 제목에서 날짜·일본 회차·장문 설명을 제거했다. 예상 기간·날씨/마장 랜덤·특수 규칙/출처·공식/예측 차이는 기존 상세에서 유지한다. 2027년7～11월5개 월별 후보와 경계 LoH도 그대로다. 종료 판정은 별도44개 KR 기간 근거에서만 가져오고, 현재 시작일이 원래 기간과 다르면 과거로 확정하지 않는다. 예측/미확인 일정은 불확실하다는 이유로 삭제하지 않는다. 원본 strict P3/P5 스키마는 불변이다.

검사 자료는 `src/data/tournament-display-periods.json`, `data/local/p85-tournaments.validation.json`이다. LoH 종료일은 [기존 공식 도움말](https://kakaogames.oqupie.com/portals/1576/articles/65213)의9월21일과 기존2026년 대회 문맥을 함께 사용했으며 새 한국 일정 인증으로 취급하지 않는다.

## 9. 이미지가 반영된 PNG

현재 화면의 검증된 입력·결과를 PngDocument로 변환한다. 출력용 게임 계산/최적화는 호출하지 않는다. 7인/31인에는 해당 costumeId 초상화, 서포트6장에는 동일 supportId 전체 아트를 포함한다. 이름·ID·적인자·백인자·상성·적성·우선순위·양립 이벤트·수급 근거·전체 손익을 보존한다.

원본 비율을 유지하며 이미지 옆에 들어가지 않는 텍스트는 아래 전체 폭으로 이어 쓴다. 그림/문자 로딩 실패는 관련 텍스트와 ID를 유지하고 다른 의상/카드로 대체하지 않는다. 이미지 로드 후와 Blob 생성 후 현재 입력 서명을 다시 확인하며 계획 변경/컴포넌트 종료 시 이전 출력을 차단한다. 높이32,760px/면적 한도를 검사하고 잘린 이미지를 성공으로 표시하지 않는다.

PNG footer에는 Cygames·UmaTools/GameTora 출처와 공개 재배포 허가 pending·로컬 참고용을 한 줄로 표시한다. 실제 이미지 포함 다운로드/실패 대체/비동기 변경 차단을 PC·모바일에서 검사했다. 아래6개 파일을 전부 직접 열어 이미지·한글/일본어·○◎★·소유UUID·줄바꿈·하단을 확인했다. 잘림·텍스트 누락·다른ID 이미지 대체는 발견되지 않았다.

| 출력 | PC·모바일 파일명 접미사 | 해상도 | 이미지 수 | 각 파일 크기 |
|---|---|---:|---:|---:|
| 7인 계보 | `lineage-7-images.png` | 1200×2718 | 7 | 707,714B |
| 31인 계보 | `lineage-31-images.png` | 1200×8295 | 31 | 2,233,119B |
| 서포트6장 | `support-6-images.png` | 1200×8306 | 6 | 2,633,018B |

각각 `.preview/p85-artifacts/desktop-` / `mobile-` 접두사다. 같은 종류의 PC·모바일 PNG는 바이트와 SHA-256까지 동일하다. 대응 `.capture.json`은 Canvas에 전달한 실제 이미지src·ID·위치·크기와 전체 텍스트를 보존한다. 이미지 실패 산출물 `*-lineage-images-failed.png`에서도 이름·인자·ID를 확인했다. 긴 이벤트 source ID의 짧은 마지막 줄은 남지만 텍스트를 생략하지 않는다.

## 10. P8 저장·복원 호환성

`uma-saved-plan` schemaVersion1 / formatVersion1과 실제 저장 필드에 변경이 없다. 기존7/31인 V1 JSON 가져오기·내보내기·현재 DB 재평가를 유지했다. 이미지 경로·검색·타입/레어도 필터·과거 목록 토글을 입력 JSON에 추가하지 않았다.

실제 DB CLI와 PC·모바일 브라우저에서7/31인 입력 완전 일치, 31개 독립UUID, 소유/부모 연결·기록·우선순위·잠금·돌파/대여·모드 보존을 재확인했다. 각31명을 화면에서 입력한 `*-persistence-before.json` / `*-persistence-restored.json`과 저장관리 화면을 보존했다. 기본 상성159(31/26/24/22/23/15/18), P2유전자12/12/12/6성과6배치, 복원 후 30175/30113/30140/10126/30226/30107의374+8=382 / 양립48 / 녹8 및 이벤트 계획이 유지됐다. 실제 사용자 인자 기록을 합성한 사례이며 KR 관측 완성 인자 인증이 아니다.

## 11. 전체 데이터·추천 엔진 회귀

`npm.cmd run check`: ESLint·TypeScript·P0/P1/P3 계약·단위 **583개/41파일**·일반 정적 빌드 통과. 트레이너스 교차검증6개, 실제 P8/이미지/대회/서포트 필터 CLI와 SQLite 읽기 전용 integrity ok/FK위반0도 통과했다. 기존2,223스킬·566카드·16,207경로·5,457이벤트를 재사용했다. 마신 정량 적용0과 기존 데이터 공백은 유지한다.

기존 P8 기준의 아래5SHA가 작업 후에도 동일했다.

| 대상 | SHA-256 |
|---|---|
| P1 reference | `7ff146764bd3453570c523940f323ce1d07abdf259fcdabe1841c8de1f0f466c` |
| P3 JSON | `76f4134c50aa24c086bfc9c4e6f2bdb12d4986da7718695ae498abfe168087b6` |
| P5 JSON | `c629502a00807bfdb1d3c17d274fbcdb7db32b37e04b6ac78f4ec13ed5d2c1c3` |
| SQLite | `4f3812878e4a6b09cba95618cfbfdeee4aa095a5e5bd339df6deaeb8407a3783` |
| 추천 엔진 | `c659d0608aa863e3ee788592fe0371a74e70a9ba49315ecc2518474b85ad2382` |

브라우저 **PC48 + 모바일48 = 서로 다른96건 통과**(기존78+신규18). 전체 실행은94통과/2실패였고, 실패는 양쪽P7 전역 복귀 시 기본 접힘으로 재생성된 설정을 테스트가 펼치지 않은 같은 사례였다. 테스트에서 설정을 펼친 뒤 기존1/5·터다지기strong·선행코너 미선택 검증을 그대로 수행하도록 고쳤으며, 두 건의 집중 재실행이 모두 통과했다. UI나 계산 소스를 점수 기대값에 맞춰 고치지 않았다. 단일 전체 실행에서96건 모두 통과한 것으로 기록하지 않는다.

| 명령/검사 | 실제 결과 | 기록 |
|---|---|---|
| `npm.cmd run check` | 583단위/41파일·lint/type/계약/build 통과 | `.preview/p85-check.log` |
| `npm.cmd run test:trainers` | 6통과 | `.preview/p85-trainers.log` |
| `npm.cmd run data:validate:p8` | 실제 저장·계산·추천·원본 무결성 통과 | `.preview/p85-p8-data.log` |
| `npm.cmd run data:validate:p85` | 1,404파일·63필터 조합·53대회·SQLite 통과 | `.preview/p85-data.log` |
| `npm.cmd run test:e2e` | 94통과, 같은P7화면 검사2건은 아래 재검사 | `.preview/p85-e2e-final.log` |
| `npx.cmd playwright test p7.spec.ts --grep P6 --output .preview/p85-focused-results` | 수정 후 PC·모바일2통과 | `.preview/p85-e2e-focused.log` |
| `npm.cmd run data:validate:p85:static` | 일반/비공개 빌드·root/nested 디코딩·Canvas·권리 차단 통과 | `.preview/p85-static-assets.log` |

새로운 점수/가중치·확률·원본 데이터 수정은 없다. 이전 단계 실DB 검증 이력을 이번에 다시 실행한 것으로 합산하지 않았다.

## 12. PC·모바일 화면과 시각 검수

Windows Edge PC1440×1000 / 모바일375×812 에뮬레이션을 사용했다. 실제 PNG·화면 캡처는 `.preview/p85-artifacts/` 및 `test-results/`에 보존한다. 기본/웨딩 초상화와 카드 contact sheet, 현재 선택·인자작 계획·계보/서포트 PNG를 실제 열어 한글/일본어·○◎★·ID·원본 비율·줄바꿈·잘림을 확인했다.

보존한 화면과 실제 파일:

- `desktop/mobile-wedding-lineage-card.png`: 기본→웨딩 의상 선택 후 실제7인 카드.
- `desktop/mobile-factor-planning-editor.png`: 이동한 소유 노드 백인자·우선순위·추천 편집.
- `desktop/mobile-support-filters.png`: 타입/레어도/한국 출시 교집합과 실제 카드 썸네일 목록.
- `desktop/mobile-compact-tournament-context.png`: 짧은 대회 제목·원문 조건 상세.
- `desktop/mobile-comparison.png`와 `*-comparison-{a,b}.json`: 다른 서포트 카드의 현재 조건 비교.
- `desktop/mobile-persistence-manager.png`, `*-persistence-{before,restored}.json`: 실제31인 저장·복원.
- 위9절의 실제 PNG6개 및 실패 이미지2개, Canvas 텍스트/이미지 캡처.
- `private-static-{root,nested}.png`: 개발 API 없는 정적 경로의 이미지·Canvas 검사.

파일별 크기·SHA·검증 내용은 `.preview/p85-artifacts/manifest.json`과 `README.md`에 정리한다. 브라우저96건의 검증 범위는 위11절과 같으며 모든 실물 휴대폰·브라우저·폰트 조합의 인증을 뜻하지 않는다.

## 13. 정적 이미지 로딩·공개 파일 분리

`data/local/p85-static-assets.validation.json`과 [출처 보고서의 정적 검사](P85_ASSET_SOURCES.md)를 따른다.

- 일반 `npm.cmd run build`: 성공. 기본 `dist`에 pending game PNG0개, JS 인라인PNG0개. 보류 이미지의 직접 요청404.
- `npm.cmd run build:private-assets`: 명시적인 비공개 검증 출력 `.preview/p85-private-static`에만1,404PNG를 복사한다. 공개 outDir로 바꾸면 빌드 전에 거부하며 기존dist SHA도 유지됐다.
- 일반/nested 정적 경로 `/`와 `/nested/uma/`에서 각각1,404/1,404 실제 `Image.decode()` 성공·오류0·형식/크기 일치. 각 경로에서3종 Canvas 읽기/PNG 변환도 성공했다.
- `data:assets:p85:public-audit`: 승인0/보류838 때문에 의도적으로 차단된다. 로컬 기술 성공과 공개 허가를 구분한다.

개발 서버만 비공개 캐시를 엄격한 `/game-assets/{유형}/{숫자ID}.png` 경로로 제공한다. 일반 production resolver는 pending 파일을 반환하지 않는다. 실제 네트워크 접근 제한/CORS 우회 프록시를 쓰지 않는다. 전체 게임DB 프로덕션 공급·실제 호스팅은 P9 범위다.

## 14. 남은 문제·완료 범위·다음 단계

기술적 이미지 확보/매핑100%, 로컬 UI·PNG 통합과 V1 보존, 공개 기본 파일에서의 물리적 분리를 검증한다. **이미지 공개 재배포 허가는 확보하지 않았다.** 보류838개는 원문 조건·대상 범위의 별도 검토가 필요하며 P9에서 자동 공개할 수 없다. 실제 누락/오매핑은0개이지만 전수 독립 육안 인증이나 전체 패치/한국 실측·정량 인증은 아니다.

일부 경기장/신규 시나리오의 한국어 공식명은 없어 원문 표시를 유지한다. 주 JS번들 약969kB의 경고가 남으며 이미지 바이너리는 포함하지 않는다. P9에서 DB 배포·번들 분리·호스팅·권리 승인 자산의 명시적 공개 절차를 검증한다. 엔진 재설계·정밀 육성 시뮬레이터·종마 추천은 추가하지 않았다.

실행 명령:

```powershell
npm.cmd run data:assets:p85 -- --no-download
npm.cmd run data:validate:p85
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run data:validate:p85:static
# 공개 허가 미확인으로 의도된 차단을 확인
npm.cmd run data:assets:p85:public-audit
```
