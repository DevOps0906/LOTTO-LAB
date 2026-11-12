// 약관·개인정보·운영 주체·문의는 확정 전이라 링크 없이 "준비 중"으로 표시한다.
export function SiteFooter() {
  const items = ["이용약관", "개인정보처리방침", "운영 주체", "문의"];
  return (
    <footer className="mt-12 border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl space-y-3 px-page py-8 text-caption text-text-muted">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {items.map((item) => (
            <li key={item}>
              {item} <span aria-label="준비 중">(준비 중)</span>
            </li>
          ))}
        </ul>
        <p>
          LOTTO LAB은 동행복권 등 공식 복권 사업자의 서비스가 아니며, 복권을 판매하거나 구매를 대행·중개하지
          않습니다. 회차 결과는 공식 발표를 출처로 표시합니다.
        </p>
        <p>통계는 과거 기록을 정리한 것이며 미래 결과를 예측하지 않습니다. 만 19세 이상만 이용할 수 있습니다.</p>
      </div>
    </footer>
  );
}
