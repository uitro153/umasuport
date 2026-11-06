# P8.5 이미지 출처·전체 ID 검사

확인일: 2026-11-05. 이 문서는 로컬 기능용 자산 확보·매핑과 공개 재배포 허가를 구분한다. 실제 공개 배포는 수행하지 않았다.

## 확보 결과

현재 P1 reference의 의상 **272종**, P3의 서포트 **566장**을 canonical ID로 추출했다. 제공된 `audit-input/uma_db/images`와 기존 `asset.json`의 이미지838개를 재사용하고, 서포트 전체 일러스트566개만 보완했다. 다른 의상의 그림이나 비슷한 이름으로 대체한 항목은 없다.

| 유형 | ID 대상 | 실제 파일 | 형식/해상도 | 누락/오류 |
|---|---:|---:|---|---:|
| 의상별 정사각 초상화 | 272 | 272 | PNG128×128 | 0 |
| 서포트 카드 아이콘 | 566 | 566 | PNG128×128 | 0 |
| 서포트 전체 카드 일러스트 | 566 | 566 | PNG300×400 | 0 |

총1,404PNG,50,410,510바이트. 서로 다른 ID/유형 간 같은 파일 경로·동일 SHA-256은0건이다. 모든 제공 썸네일의 원본 SHA-256 일치, source filename의 숫자ID와 canonical ID 일치, 실제PNG signature/IHDR·크기·해시를 전수 검사했다. 서포트 전체 일러는 같은 숫자 support ID의 GameTora 이미지 URL·응답형식·실제 가로세로비를 검사했다. 파일 존재만으로 이미지 의미가 맞는다고 인증하지 않고 아래 대표 실제 페이지 및 시각 대조를 추가했다.

전체 검사: `data/assets/p85-validation.json`. 전체 파일/출처/원본 자산 ID/해시/매핑/권리 상태: `data/assets/p85-manifest.json`. PNG와 같은 매니페스트의 실제 비공개 캐시는 `data/local/p85-assets/game-assets/`이며 `public/`와 물리적으로 분리했다. JS용 경량 인덱스는 `data/assets/p85-index.json`이고 PNG 바이너리는 JS에 인라인하지 않는다.

## 원본 제공 방식과 ID

썸네일은 사용자가 제공한 원자료의 `json/asset.json`을 프로젝트에 보존한 `data/raw/p3-base-2026-11-04/json/asset.json`에서 정확히 대응한다. 제공 패키지는 [UmaTools 해당 출처](https://github.com/daftuyda/UmaTools/tree/d0a2a652605ca319e4176445c1e1bf52a8cd8fdb/public/assets)의 `character_thumbs`/`support_thumbs`를 기록했다. 해당 pinned URL의 현재 재접근 여부와 관계없이 제공 파일의 원래 해시를 전부 대조했다.

[UmaTools 현재 수집 코드](https://github.com/daftuyda/UmaTools/blob/main/scripts/data/gametora.js)에서 의상은 GameTora의 `/images/umamusume/characters/thumb/chara_stand_{charId}_{cardId}.png`, 서포트는 `/images/umamusume/supports/support_card_s_{supportId}.png`라는 전용 썸네일을 그대로 다운로드하는 것을 확인했다. 이 작업에서 전신 그림을 새로 잘라 초상화로 만들지 않았다. 카드명·언어·캐릭터명으로 이미지를 추정하지 않는다.

전체 서포트 일러스트는 [GameTora30175 실제 상세 페이지](https://gametora.com/umamusume/supports/30175-mejiro-ramonu)의 이미지 링크가 노출하는 [전체 카드300×400 PNG](https://media.gametora.com/umamusume/supports/full/small/30175.png)를 기준으로, 기존 DB의566개 supportId에 대해 동일한 숫자형 URL을 조회했다. 전부HTTP200·image/png·300×400으로 확인했다. 각 응답의 원래 URL·ETag·Last-Modified와 취득일은 `data/assets/full-art-downloads/{id}.json`에 있다. 접근 거부 우회나 서버CORS 우회 프록시는 사용하지 않았다.

표시형 supportCardId는 기존 P3의 `supportId`와 같은 canonical 게임 ID이며 새 ID 체계를 만들지 않았다. `costume:100101`과 `support:100101`처럼 유형별 이름 공간을 분리한다.

## 실제 의미·시각 대조

두 검수용 PNG와 HTML을 `.preview/p85-artifacts/costume-contact-sheet.*`, `support-contact-sheet.*`로 보존했다. PNG를 직접 열어 아래20개 실제 ID의 이름·의상/일러와 아이콘을 확인했다. 결과는 같은 폴더의 `asset-visual-samples.json`이다. 이는 대표20개 시각 대조이며 838개 전부를 사람이 독립 육안 검수한 것으로 표현하지 않는다.

- 에어 그루브101801 기본/101802 웨딩은 서로 다르며 [101802 Wedding 상세](https://gametora.com/umamusume/characters/101802-air-groove)의 해당 의상과 일치한다.
- 마야노 탑건102401 기본/102402 웨딩 역시 독립 이미지이며 [102402 Wedding 상세](https://gametora.com/umamusume/characters/102402-mayano-top-gun)의 부케 의상과 일치한다.
- 오구리 캡100601/100602, 스페셜 위크100101/100102의 기본/다른 의상도 구분했다.
- 스페셜 위크 [R10001](https://gametora.com/umamusume/supports/10001-special-week), [SR20043](https://gametora.com/umamusume/supports/20043-special-week), [SSR30001](https://gametora.com/umamusume/supports/30001-special-week), [다른 SSR30025](https://gametora.com/umamusume/supports/30025-special-week)의 서로 다른 일러스트와 각 아이콘의 얼굴/장면이 대응한다.
- 타즈나10021/30021은 같은 인물의 다른 카드이며 [SSR30021 상세](https://gametora.com/umamusume/supports/30021-tazuna-hayakawa)의 Friend 분류와 일치한다. [그룹30067](https://gametora.com/umamusume/supports/30067-the-thrones-assemblage)·[그룹30137](https://gametora.com/umamusume/supports/30137-ancestors-guides)은 친구 카드로 바꾸지 않았다.
- 20001·30175·30113·30140의 원본 카드도 타입·이름·일러와 아이콘을 대조했다.

전체 서포트 원본 `type`은 speed125/stamina97/power101/guts112/intelligence101/friend25/group5다. 정규화 값과 raw.type이 전부 같음을 검사했다. 이미지 작업으로 친구/그룹 분류나 추천 정책을 수정하지 않는다.

## 권리·이용조건 조사와 공개 배포 게이트

소유권과 공개 접근, 코드 라이선스, 게임 그림 재배포 허가는 서로 다르다.

- [Cygames 이용규약 제6조](https://umamusume.jp/terms/)는 게임 자료의 권리가 Cygames/해당 권리자에 있음을 명시한다. 별도 명시 없이 게임 자산의 권리를 이전하는 문서가 아니다.
- [공식 2차 창작 가이드라인](https://umamusume.jp/derivativework_guidelines)은 팬 활동과 허용되지 않는 표현·이용 조건을 다룬다. 이 문서를 원본 게임 추출 이미지 전체의 무조건적인 재배포 허가로 승격하지 않았다.
- [GameTora의 자료 권리 표기](https://gametora.com/umamusume/supports/30175-mejiro-ramonu)는 게임 자료의 권리가 Cygames에 있음을 밝힌다. GameTora에 공개되어 있거나 다운로드가 된다는 사실을 재배포 라이선스로 해석하지 않는다.
- [UmaTools의 GPL3 표기](https://github.com/daftuyda/UmaTools#license)는 코드 저장소의 라이선스다. 제공 원자료 README도 게임 이미지 저작권을 별도로 구분하므로 게임 이미지의 재배포 허가로 취급하지 않는다.
- [Umamusume Wiki의 실제 카드 파일](https://umamusu.wiki/File:Support_Card_30168.png)은2048×2731 고해상도 원본을 제공하지만, 일반 사이트 콘텐츠의 CC BY-SA와 별도로 게임 자료의 Cygames 권리를 표시한다. 이를 해결된 게임아트 재배포 허가로 간주하지 않았다. 기존 자료+GameTora300×400으로 실제 필요한 해상도를 확보해 이 고해상도 원본은 추가 복사하지 않았다.

따라서 현재838개 ID의 `rightsStatus:pending`, `publicRedistribution:not-verified`를 유지한다. 사용자가 제공한 자료와 명시적으로 요청한 로컬 개발·PNG 참고 기능에는 정확하게 매핑한 파일을 사용할 수 있도록 `usageScope:local-reference`로 분리했다. 사용자는 별도 허가 문서가 없음을 확인했고, 기술 구현·로컬 검증을 계속하되 공개 배포 파일에 자동 포함하지 말도록 명시했다. 실제 공개 호스팅을 수행하지 않았으며 공개 권리가 해결되었다고 보고하지 않는다.

공개 배포 보류의 전체838개 canonical ID와 원인은 `data/assets/p85-public-release-blocked.json`이다. 로컬 이미지 확보 누락은0개이고 공개 재배포 권리 확인은838개 보류라는 다른 집계다. `npx.cmd tsx scripts/assets/validate-assets.ts --public-release`는 이 권리 문제가 남으면 의도적으로 실패한다. 유효한 별도 허가 문서가 확보되면 원문 출처·대상 범위·조건을 검증한 후 상태와 게이트를 변경해야 한다.

## Canvas·정적 파일

GameTora30175 응답의 Access-Control-Allow-Origin은 없었다. 브라우저 Canvas가 제3자 서버 정책에 의존하지 않도록 검증된 로컬 파일을 `data/local/p85-assets/game-assets/`에 보존한다. 개발 서버는 이 폴더의 허용된 자산만 `/game-assets/`로 제공한다. 정상 앱 URL은 BASE_URL을 반영하는 같은 오리진 상대 경로다. 외부주소를 프록시로 바꾸거나 보안 정책을 우회하지 않는다. 캐릭터/서포트 이미지 매핑과 파일은 게임 스냅샷 및 `uma-saved-plan` V1 저장 JSON과 분리한다.

일반 production resolver는 승인되지 않은 이미지를 반환하지 않는다. `import.meta.env.DEV` 또는 명시적인 `VITE_PRIVATE_ASSET_VALIDATION=1`에서만 로컬 참고 이미지를 표시한다. 후자는 별도의 `.preview/p85-private-static` 출력에만 자산을 복사하는 비공개 정적 검증용이며 공개 배포 승인이 아니다. `public/game-assets/`에는 pending 이미지가0개이고 생성기·전수 validator도 이 분리를 검사한다. CLI 권리 게이트 실패만으로 물리적 배포 차단을 인증하지 않고 다음 실제 build/browser 검사를 수행했다.

`scripts/validate/p85-static-assets.ts`를 실행해 아래 결과를 `data/local/p85-static-assets.validation.json`에 기록했다. 실제 정적 이미지/기본·웨딩/아이콘/전체아트 화면은 `.preview/p85-artifacts/private-static-root.png`, `private-static-nested.png`를 생성한 뒤 직접 열어 확인했다.

- `npm.cmd run build` 성공. 일반 `dist/game-assets/`의 pending PNG0개, JS 내 인라인PNG0개, 기본 정적 결과에서 해당 이미지 직접GET은404였다.
- `VITE_PRIVATE_ASSET_VALIDATION=1`인데 `--outDir dist`를 지정한 실제 Vite 실행은 exit1로 거부됐다. 거부 전후 전체 dist 파일 목록/내용 SHA-256이 같아 기존 public 결과를 비우거나 바꾸기 전에 차단된 것을 확인했다.
- `npm.cmd run build:private-assets` 성공. 격리된 `.preview/p85-private-static/game-assets/`에1,404PNG가 존재했다.
- 개발 전용 API를 공급하지 않는 임시 localhost 정적 서버에서 `/`와 `/nested/uma/` 각각1,404개를 실제 Edge `Image.decode()`로 전수 디코딩했다. 둘 다1,404/1,404 성공·크기 일치·오류0이었다. Vite BASE_URL `./`의 중첩 경로도 적용됐다.
- 각 mount에서 의상 초상화·서포트 아이콘·전체아트3개를 실제 Canvas에 그린 뒤 getImageData/toDataURL을 실행해 CORS 오염 없이 PNG 출력이 가능함을 확인했다.
- 공개권리 게이트는 의도대로 exit1이며 승인0/보류838을 유지했다. 검사 전후 원본 게임JSON3개·SQLite·추천 엔진의5SHA는 모두 같았다.

위 검사는 정적 이미지 기술 검증이다. P9의 전체 게임 DB 프로덕션 로딩·공개 호스팅 또는 이미지 재배포 법적 허가를 인증한 것이 아니다. 임시 서버와 브라우저는 검사 후 종료했다.

## 실행

```powershell
npx.cmd tsx scripts/assets/build-assets.ts
npx.cmd tsx scripts/assets/validate-assets.ts
npx.cmd tsx scripts/assets/visual-assets.ts
npx.cmd vitest run tests/unit/game-assets.test.ts
npx.cmd tsx scripts/validate/p85-static-assets.ts
```

생성기는 기존 서포트 전체아트 캐시를 검증해 재사용한다. 네트워크 수집 없이 재생성하려면 `--no-download`, 다른 제공 원자료 폴더는 `--source-root`를 지정한다. 빌드·전수 검사 전후 P1/P3/P5 JSON·SQLite·추천 엔진의5SHA는 기존P8 기준과 동일하다.
