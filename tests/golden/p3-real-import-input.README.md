# P3 실제 자료 계약 회귀 추출

`p3-real-import-input.json`은 준비된 `audit-input/uma_db/json`과 `data-integration/data`에서 ID 기준으로 추출한 실제 레코드다. 11개 스킬·4개 서포트 및 연결된 원본 관계/리비전/돌파, 도쿄 2400m와 실제 레이스, 시나리오 2개의 부분 집합이다. 게임 수치나 날짜를 임의 생성하지 않았다.

검증용 변형(누락 근거, 중복 ID, 잘못된 날짜 등)은 테스트 코드에서만 구성한다. `a` 64자리 manifest 값은 입력 경계 테스트용 표식이며 실제 원본 인증이 아니다. 전체 원본 manifest SHA-256은 `data/local/p3-import.validation.json`에 기록한다. 변환 구조·과거 그룹 순위 대조의 통과를 한국 서버 현행 패치 검증으로 해석하지 않는다.
