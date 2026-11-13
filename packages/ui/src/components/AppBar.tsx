import { useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { Sheet } from "./Sheet";

export type AppBarProps = {
  /** 가운데 제목(화면당 h1 하나 — 768~에서 보이는 기존 Header는 다른 h1을 쓰지 않도록 소비 측이 정한다) */
  title: ReactNode;
  /** 뒤로가기 링크 주소(해시 등). 없으면 onBack, 둘 다 없으면 버튼 자리를 비운다 */
  backHref?: string;
  onBack?: () => void;
  /** 뒤로가기 접근성 이름(기본 "뒤로 가기") */
  backLabel?: string;
  /** 정보(i) 버튼 → 바텀시트. 기존 안내 문구(고지·출처 설명 등)를 여기로 옮긴다 */
  info?: { title: string; content: ReactNode };
  /** 정보 버튼 왼쪽에 둘 추가 도구(선택) */
  actions?: ReactNode;
};

/**
 * 하위 화면 앱바(task-047 L1): [뒤로가기] · 가운데 제목 · [정보(i)].
 * ~767에서만 보이고 768~에서는 숨는다(.ll-appbar) — 768~ 배치는 기존 Header·경로 표시를 `.ll-only-wide`로 감싸 유지한다.
 */
export function AppBar({ title, backHref, onBack, backLabel = "뒤로 가기", info, actions }: AppBarProps) {
  const [open, setOpen] = useState(false);
  return (
    <header className="ll-appbar">
      <span className="ll-appbar__side">
        {backHref ? (
          <a className="ll-icon-button" href={backHref} aria-label={backLabel}>
            <Icon name="back" />
          </a>
        ) : onBack ? (
          <button type="button" className="ll-icon-button" aria-label={backLabel} onClick={onBack}>
            <Icon name="back" />
          </button>
        ) : null}
      </span>
      <h1 className="ll-appbar__title">{title}</h1>
      <span className="ll-appbar__side ll-appbar__side--end">
        {actions}
        {info && (
          <button type="button" className="ll-icon-button" aria-label={`${info.title} 안내`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
            <Icon name="info" />
          </button>
        )}
      </span>
      {info && (
        <Sheet open={open} onClose={() => setOpen(false)} title={info.title}>
          {info.content}
        </Sheet>
      )}
    </header>
  );
}
