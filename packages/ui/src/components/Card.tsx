import { useId, type ReactNode } from "react";

export type CardProps = {
  title?: ReactNode;
  /** 제목 줄 오른쪽(더보기 링크·버튼 등) */
  action?: ReactNode;
  /** 제목 요소 수준. 페이지 h1 아래 카드는 기본 h2 */
  headingLevel?: 2 | 3;
  /** 내용 갱신 중이면 true → aria-busy(로딩 알림 StateView는 이 카드 바깥에 둔다) */
  busy?: boolean;
  className?: string;
  children?: ReactNode;
};

export function Card({ title, action, headingLevel = 2, busy, className, children }: CardProps) {
  const headingId = useId();
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section
      className={className ? `ll-card ${className}` : "ll-card"}
      aria-labelledby={title ? headingId : undefined}
      aria-busy={busy || undefined}
    >
      {(title || action) && (
        <div className="ll-card__head">
          {title && (
            <Heading id={headingId} className="ll-card__title">
              {title}
            </Heading>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
