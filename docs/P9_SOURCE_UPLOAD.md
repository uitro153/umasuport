# GitHub 최초 소스 업로드 범위

대상: `https://github.com/uitro153/umasuport.git`. Git LFS와 Pages/Actions 배포 설정은 사용하지 않는다. 기존 코드·UI·계산·테스트·게임 데이터 내용은 변경하지 않는다.

## SQLite 사용처

`data/local/p3-integrated.sqlite`는 119,619,584바이트인 로컬 데이터 가공·교차검증 DB다. 브라우저와 `src`는 SQLite를 읽지 않는다. `vite.config.ts` 개발 미들웨어는 현재 `p1-reference.json`, `p3-skill-support.json`, `p5-forecast.json`만 제공한다. 일반 `npm run build`의 prebuild는 P0/P1 fixture와 P3 golden JSON 계약을 검증하며 SQLite를 요구하지 않는다.

DB는 `scripts/refresh-p3.mjs`가 원본 `umamusume_partial.sqlite`를 복사하고 P3 스냅샷·스킬·서포트·이벤트·수급 테이블을 추가하는 데 사용한다. `scripts/trainers/run.mjs`는 명칭·이벤트·정량 근거 테이블을 통합한다. `scripts/validate/p41-integrity.mjs`와 일부 단계별 감사 명령은 DB를 읽거나 불변 해시를 검사한다. 이들은 일반 앱 실행/빌드 명령과 별개다.

DB 전체를 현재 앱 JSON만으로 동일하게 재생성할 수 있다고 보장하지 않는다. 원본 DB·원본 JSON·추가 수집 자료가 필요하며 기존 로컬 원본과 가공 DB는 삭제하지 않는다. 향후 Actions에서 일반 빌드를 한다면 이 DB를 다운로드하거나 재생성할 필요가 없다. 별도의 데이터 통합/DB 무결성 감사를 자동화하려면 먼저 원본 자료 공급·해시·보관 정책을 정해야 한다. 이번에는 workflow를 만들지 않는다.

## 추적할 자료

- `src`, `scripts`, `tests`, `public/robots.txt`, 문서·요구사항, npm lockfile와 기존 Vite/TypeScript/Playwright 설정
- 현재 P1/P3/P5 앱 JSON 3종과 P8 V1 계보 예제 2개
- `data/assets`, `data/curated`, `data/normalized`, `data/fixtures`, `data/snapshots`의 기존 출처·계약·정규화 자료
- 이미지 경로·ID 매핑·출처·권리 상태 메타데이터만 포함하며 실제 게임 이미지 바이너리는 제외

최종 사용자 결정은 **이미지 제외 소스 업로드**다. 의상 272개, 서포트 아이콘 566개·전체 일러스트 566개, 총 PNG 1,404개(50,410,510바이트)는 로컬에 그대로 보존한다. 이미지의 `pending` 권리 상태와 프로덕션 공개 이미지 게이트도 유지한다. 새 clone에는 해당 이미지 파일이 없으며 필요한 로컬 검증에는 별도 비공개 자산 공급이 필요하다. 현재 실제 대형 JSON은 개발 전용 엔드포인트에서 제공되므로, 향후 정적 사이트의 실데이터 공급 방식은 별도 배포 단계에서 다뤄야 한다. 이번 업로드를 위해 해당 경계를 변경하지 않는다.

## 제외 근거

최초 검토 후보 2,449개·715,587,316바이트에서 로컬 DB, 재생성 가능한 추천/탐색 결과, 과거 비교 기준선, 백업·검증 보고서와 중복 매니페스트를 추적 대상에서 제외한다. 원본 파일은 모두 로컬에 보존한다. 특히 `data/local/p85-assets/game-assets/manifest.json`은 `data/assets/p85-manifest.json`과 해시가 같은 복사본이며, 실제 PNG에는 중복이 없다. 상세 파일명·크기·사유는 [제외 목록](P9_UPLOAD_EXCLUSIONS.json)을 따른다.

`node_modules`, 빌드·테스트 산출물, `.preview`, 캐시·로그·개인 환경설정·키 파일, `data/raw`의 수집 원본은 기존/보완된 `.gitignore` 규칙으로 제외한다. 소스 업로드에 포함되지 않는 선택적 데이터 감사 명령의 입력은 로컬 원본으로 별도 공급해야 한다. 기존 일부 과거 E2E의 `.preview` 입력 자료도 생성 산출물이며 이번 저장소에 공개하지 않는다.

검증은 파일 목록·크기·비밀정보 패턴·공개 Git 이력의 이미지 부재 및 SQLite 없는 소스 복사본의 일반 빌드로 제한한다. 128건 E2E와 전체 check는 재실행하지 않는다.

SQLite·원본 수집 자료·추천 캐시·검증 보고서가 없는 업로드 전용 복사본에서 `npm run build`(prebuild 포함)가 통과했다. 이 확인은 기존 설치 의존성을 재사용했으며 DB 재생성이나 배포 설정을 수행하지 않았다. 업로드 대상에 100 MiB 이상 파일·알려진 비밀정보 패턴은 발견되지 않았다. 이미지 포함으로 작성했던 미전송 최초 커밋은 로컬 백업 브랜치에 보존하고, 공개 main은 그 커밋을 부모로 갖지 않는 이미지 없는 최초 커밋으로 구성한다. 백업 브랜치는 push하지 않는다.

최종 이미지 제외 소스 복사본에서도 `npm run build`(prebuild 포함)가 통과했다. 그 복사본에는 SQLite와 게임 이미지가 모두 없다. 로컬 PNG 1,404개와 통합 DB는 그대로 남아 있다.
