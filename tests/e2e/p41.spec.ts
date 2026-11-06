import { skillName, supportName } from './name-search-data';
import { test, expect } from '@playwright/test';

test('전체 실DB의 교차검증 명칭과 P4.1 이벤트 양립 계획을 화면에 구분한다', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  // Use the local full source pack, without mocking or inventing game values.
  // Isolate the existing P4.1 source pack; the separately tested P5 increment
  // changes the date basis and the user-authorized recommendation policy.
  await page.route('**/__local/p5-forecast', (route) => route.fulfill({ status: 404, json: {} }));
  await page.goto('/?view=skills');
  await expect(page.getByText('2223', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('566', { exact: true })).toBeVisible();
  await page.locator('#skills-event').selectOption('kr-cm-39');
  await page.locator('#skills-style').selectOption('pace');
  await page.locator('#skills-scenario').selectOption('11');
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).check();
  await expect(page.getByTestId('skills-cutoff')).toHaveText('2026-11-13');
  await page.locator('#skills-list-view').selectOption('all');
  await page.locator('#skills-search').fill(skillName('204262'));
  const translated = page.getByTestId('skill-result-204262');
  await expect(translated).toContainText('별의 반짝임');
  await expect(translated).toContainText('교차 대응 확인 · 공식명 검수 대기');

  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  const result = page.getByTestId('p4-primary-result');
  await expect(result.locator('.p4-card')).toHaveCount(6, { timeout: 30000 });
  await expect(result.locator('.p4-metrics')).toContainText('양립 가능한 목표 50');
  await expect(result.locator('.p4-metrics')).toContainText('패시브 스킬 10');
  await expect(result.locator('.p4-metrics')).toContainText('핵심 목표 8');
  await result.getByText('잠재 경로·미확인 이벤트 구분', { exact: true }).click();
  await expect(result).toContainText('잠재 목표는 51개');
  await expect(result).toContainText('이벤트 양립성 미확인 1개');
  const eventPlan = result.getByTestId('p41-event-plan').first();
  await eventPlan.locator('summary').click();
  await expect(eventPlan).toContainText('성공·실패 확률은 미확인');
  await expect(eventPlan).toContainText('획득 보장 아님');
  await result.getByText(/^자료에 기록된 잠재 수급 경로/).first().click();
  await expect(result.locator('.p4-route-list').first()).toBeVisible();
  await expect(result).toContainText('선택하지 않은 분기와 검증 보류 경로도 포함');
  await expect(page.getByTestId('p87-search-scope')).toContainText('미검증 정량값은 점수에 사용하지 않습니다.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('p41-real-recommendation.png'), fullPage: true });

  await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
  await page.getByLabel('한국 출시 상태', { exact: true }).selectOption('unavailable');
  await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('30311'));
  const future = page.getByTestId('support-candidate-30311');
  await expect(future).toContainText('에프포리아');
  // P8.6 keeps the discovery cell image-first; provenance is an explicit
  // separate action, not text below every gallery icon.
  await future.locator('..').locator('.p86-support-info').click();
  const sourceDetails = page.getByTestId('p86-support-detail');
  await expect(sourceDetails).toContainText('교차 대응 확인 · 공식명 검수 대기');
  await expect(future).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
  await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('30108'));
  await page.getByTestId('support-candidate-30108').click();
  await page.getByText('선택 카드의 이벤트 선택지 · 출처별 참고', { exact: true }).click();
  await expect(page.getByText('적용 서버 미확인 · 한국 수급에 추가하지 않음', { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
