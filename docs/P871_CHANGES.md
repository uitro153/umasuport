# P8.7.1 수정 결과

확인일: 2026-11-06 (Asia/Seoul). 외부 배포는 수행하지 않았다.

| 수정 항목 | 결과 |
|---|---|
| 부모 중복 계보 방지 | 완료 — canonical 본체로 직접 부모/자식·부모 쌍 검사, 다른 가지 재사용 허용 |
| 로테이션 설정 제거 | 완료 — 배분과 저장 계획 비교 모두 옛 숨은 설정을 무시 |
| 31인 계보 가로 확장 | 완료 — 1920px에서 310px 설정 패널 + 나머지 트리, 설정 접기 지원 |
| 계보 비우기 버튼 이동 | 완료 — 도구 모음·위험색·확인/취소, 잠금 실패 시 입력 보존 |
| 스킬 목표 10개 지원 | 완료 — 전역/노드·검증·추천·V1에 반영, 초과 입력 거부 |
| 빠른 선택 기본값 제거 | 완료 — 새 환경 0개, 기존 사용자 목록 보존, 기본 복원 버튼 제거 |
| 주요 버튼 위치·디자인 | 완료 — 추천 조건/배분 목표/미리보기 가까이 배치, 주·보조·위험 구분 |
| 다크 테마 | 완료 — OS 초기값·전환·별도 로컬 저장, 이미지/PNG 원색 유지 |
| 성공 알림 개선 | 완료 — 작업 영역에 표시, 성공 약3초 후 소멸·오류는 유지 |
| 저작권 Footer | 완료 — 모든 주요 화면 공통 고지와 공식 가이드라인 링크 |
| 검색엔진 색인 제외 | 완료 — 원본/빌드 HTML noindex·nofollow·noimageindex 및 robots.txt |

주요 파일: `engine/lineage-validity.ts`, `lineage-goals.ts`, `lineage-arrangements.ts`, `plan-comparison.ts`; `ui/reference/ReferencePage.tsx`, `ui/lineage/LineageDesigner.tsx`, `UnifiedLineageTree.tsx`; `engine/skill-priorities.ts`, 두 저장 스키마, `ui/skills/SkillPrioritySettings.tsx`, `SupportRecommendations.tsx`; `ui/ThemeToggle.tsx`, `SiteFooter.tsx`, `ActionNotice.tsx`, 테마 CSS; `index.html`, `public/robots.txt`. 경로는 `src/` 기준이다.

실제 확인: 집중 단위9사례와 PC·모바일 핵심4사례 통과(수정 후 재확인 포함). 실제 DB의 10개 우대 목표가 모두 평가되고 보너스80점, 10개 필수 목표 처리·11개 거부·V1 보존을 확인했다. 159점을 포함한 기존 배치 점수는 유지됐다. 옛 잘못된 V1을 불러와 경고/취소/잠금 오류/해제 후 비우기를 확인했다. 잠금 오류가 React 상태 갱신 중 화면을 종료하던 결함도 수정했다.

타입·빌드·lint 통과. [파일 확인](../.preview/p871/file-checks.json)에서 실제 JSON/SQLite4개와 PNG 렌더러 원본 보존, 빌드 Meta·robots를 확인했다. 전체601개 단위·116개 E2E·성능 벤치마크는 실행하지 않았다. 기존 테스트 중 변경된 상한·빠른 선택·제거된 UI 기대값은 수정했으나 종합 회귀 통과로 보고하지 않는다.

대표 화면: [PC31인·다크](../.preview/p871/desktop-31-dark.png), [모바일31인·다크](../.preview/p871/mobile-31-dark.png), [라이트](../.preview/p871/desktop-31-light.png), [추천 버튼](../.preview/p871/desktop-recommend-action-dark.png), [Footer](../.preview/p871/mobile-footer.png). 실제 브라우저 캡처를 열어 버튼 대비·증조 이름·너비·모바일 조작 영역을 확인했다. 모바일은 에뮬레이션이다.

P9 전 확인: 전체 회귀와 기존 합성 계보의 새 유효성 조건, 3종 PNG 재다운로드, 실제 정적 데이터·이미지 공급 및 하위 경로를 통합 검증한다. 기존 이미지 권리 pending은 그대로이며 Footer는 재배포 허가가 아니다. 프로젝트 하위 `robots.txt`는 호스트 루트 정책과 다를 수 있고 검색·이미지 색인 제외를 보장하지 않는다. 공개 후 검색엔진 동작은 이번에 검증하지 않았다.
