export function translationLabel(status: string, hasKoreanName: boolean): string {
  if (status.startsWith('cross-dataset-identity-verified')) return '교차 대응 확인 · 공식명 검수 대기';
  return hasKoreanName ? '출처 번역' : '한국어 명칭 미확인';
}

export function eventServerLabel(server: string): string {
  if (server === 'KR') return '한국 경로 원자료 · 획득 보장 아님';
  if (server === 'JP') return '일본 참고 · 한국 적용 검증 대기';
  return '적용 서버 미확인 · 한국 수급에 추가하지 않음';
}
