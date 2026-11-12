import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { isModalOpen, subscribeModal } from "./modal-layer";

/** 토스트 표시 시간(ms) — 결과만, 액션 없음 */
export const TOAST_MS = 3000;
/** 액션 없는 스낵바 기본 표시 시간(ms) */
export const SNACKBAR_MS = 6000;
/** 액션(실행 취소·다시 시도) 있는 스낵바 기본·최소 표시 시간(ms, WCAG 2.2.1) */
export const SNACKBAR_ACTION_MS = 10000;

export type NoticeTone = "info" | "error";
export type NoticeAction = { label: string; onAction: () => void };
export type ToastOptions = { key?: string };
export type SnackbarOptions = {
  message: string;
  /** 실행 취소·다시 시도 1개 */
  action?: NoticeAction;
  /** error면 role=alert */
  tone?: NoticeTone;
  /** ms. 기본 액션 없음 SNACKBAR_MS·액션 있음 SNACKBAR_ACTION_MS(그보다 짧게 줄일 수 없다) */
  duration?: number;
  /** 같은 key는 새로 쌓지 않고 합친다 */
  key?: string;
};
export type NoticeApi = {
  toast: (message: string, options?: ToastOptions) => void;
  snackbar: (options: SnackbarOptions) => void;
  /** 표시 중인 알림을 닫고 다음 알림을 보인다 */
  dismiss: () => void;
};

type Notice = {
  id: number;
  kind: "toast" | "snackbar";
  message: string;
  action?: NoticeAction;
  tone: NoticeTone;
  duration: number;
  key?: string;
};
/** held: 모달이 열려 있음 — 스낵바(닫기·액션 버튼이 있어 포커스 가능)는 대기, 토스트만 표시 */
type QueueState = { current: Notice | null; queue: Notice[]; held: boolean };
type QueueAction =
  | { type: "push"; notice: Notice }
  | { type: "dismiss"; id?: number }
  | { type: "hold"; held: boolean };

const showable = (notice: Notice, held: boolean) => !held || notice.kind === "toast";

// 대기열에서 지금 보일 수 있는 첫 알림을 꺼낸다(보류 중이면 토스트만).
function takeNext(queue: Notice[], held: boolean): Pick<QueueState, "current" | "queue"> {
  const index = queue.findIndex((item) => showable(item, held));
  if (index < 0) return { current: null, queue };
  return { current: queue[index] ?? null, queue: queue.filter((_, i) => i !== index) };
}

// 한 번에 1개, FIFO. 새 스낵바는 표시 중 토스트를 즉시 교체. 같은 key는 그 자리에서 합친다(표시 중이면 시간 다시 시작).
// 모달이 열리면 표시 중 스낵바는 대기열 맨 앞으로 돌아가고, 모달이 닫히면 그때 처음부터 보인다.
function reducer(state: QueueState, action: QueueAction): QueueState {
  const { current, queue, held } = state;
  if (action.type === "hold") {
    if (action.held === held) return state;
    if (action.held) {
      if (current && !showable(current, true)) return { ...takeNext([current, ...queue], true), held: true };
      return { ...state, held: true };
    }
    return current ? { ...state, held: false } : { ...takeNext(queue, false), held: false };
  }
  if (action.type === "dismiss") {
    if (!current || (action.id !== undefined && action.id !== current.id)) return state;
    return { ...takeNext(queue, held), held };
  }
  const notice = action.notice;
  if (notice.key !== undefined) {
    if (current?.key === notice.key && showable(notice, held)) return { current: notice, queue, held };
    const index = queue.findIndex((item) => item.key === notice.key);
    if (index >= 0) return { current, queue: queue.map((item, i) => (i === index ? notice : item)), held };
  }
  if (showable(notice, held) && (!current || (notice.kind === "snackbar" && current.kind === "toast"))) {
    return { current: notice, queue, held };
  }
  return { current, queue: [...queue, notice], held };
}

const NoticeContext = createContext<NoticeApi | null>(null);

const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export type NoticeProviderProps = {
  children: ReactNode;
  /** 하단 주요 버튼과 겹치지 않게 더 띄울 거리(CSS 길이, 토큰 계산식 권장 예: "var(--spacing-control)") */
  offset?: string;
};

/**
 * 토스트·스낵바 제공자(DESIGN.md 4.7). 알림 영역(role=status polite / 오류는 role=alert)을 body에 항상 두고 내용만 바꾼다.
 * 호버·포커스·창 비활성 중에는 타이머를 멈추고 남은 시간부터 이어 간다(WCAG 2.2.1). 포커스를 가로채지 않는다.
 * 스낵바는 닫기 버튼("알림 닫기")·Esc(포커스가 안에 있을 때)로 닫는다. 모달이 열린 동안 스낵바는 대기, 토스트만 보인다.
 * 위치: ~767 하단 탭 위(+safe-area), 768~ 본문 영역(레일·사이드바 제외) 하단 가운데.
 */
export function NoticeProvider({ children, offset }: NoticeProviderProps) {
  const [state, dispatch] = useReducer(reducer, { current: null, queue: [], held: false });
  const modalOpen = useSyncExternalStore(subscribeModal, isModalOpen, () => false);
  useEffect(() => {
    dispatch({ type: "hold", held: modalOpen });
  }, [modalOpen]);
  const seq = useRef(0);
  const api = useMemo<NoticeApi>(
    () => ({
      toast: (message, options) =>
        dispatch({
          type: "push",
          notice: { id: ++seq.current, kind: "toast", message, tone: "info", duration: TOAST_MS, key: options?.key },
        }),
      snackbar: ({ message, action, tone = "info", duration, key }) =>
        dispatch({
          type: "push",
          notice: {
            id: ++seq.current,
            kind: "snackbar",
            message,
            action,
            tone,
            duration: action ? Math.max(duration ?? SNACKBAR_ACTION_MS, SNACKBAR_ACTION_MS) : (duration ?? SNACKBAR_MS),
            key,
          },
        }),
      dismiss: () => dispatch({ type: "dismiss" }),
    }),
    [],
  );

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [windowActive, setWindowActive] = useState(true);
  useEffect(() => {
    const activate = () => setWindowActive(true);
    const deactivate = () => setWindowActive(false);
    window.addEventListener("focus", activate);
    window.addEventListener("blur", deactivate);
    return () => {
      window.removeEventListener("focus", activate);
      window.removeEventListener("blur", deactivate);
    };
  }, []);

  const current = state.current;
  const id = current?.id;
  const duration = current?.duration ?? 0;
  const paused = hovered || focused || !windowActive;
  const remaining = useRef(0);
  // 알림이 바뀌면 남은 시간을 새로 잡는다. 사라진 알림 안의 포커스는 남지 않는다.
  useEffect(() => {
    remaining.current = duration;
    setFocused(false);
  }, [id, duration]);
  useEffect(() => {
    if (id === undefined || paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => dispatch({ type: "dismiss", id }), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [id, paused]);

  const mounted = useMounted();
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  };
  // 포커스가 스낵바 안에 있을 때 Esc = 닫기
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && current) {
      event.stopPropagation();
      dispatch({ type: "dismiss", id: current.id });
    }
  };
  const body = current && (
    <div key={current.id} className="ll-notice" data-kind={current.kind} data-tone={current.tone}>
      <span className="ll-notice__message">{current.message}</span>
      {current.kind === "snackbar" && current.action && (
        <button
          type="button"
          className="ll-notice__action"
          onClick={() => {
            current.action?.onAction();
            dispatch({ type: "dismiss", id: current.id });
          }}
        >
          {current.action.label}
        </button>
      )}
      {current.kind === "snackbar" && (
        <button
          type="button"
          className="ll-icon-button"
          aria-label="알림 닫기"
          onClick={() => dispatch({ type: "dismiss", id: current.id })}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
  const style = offset ? ({ "--ll-notice-offset": offset } as CSSProperties) : undefined;

  return (
    <NoticeContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="ll-notice-region"
            data-ll-live=""
            style={style}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
          >
            <div role="status" aria-live="polite" aria-atomic="true">
              {current?.tone !== "error" && body}
            </div>
            <div role="alert" aria-atomic="true">
              {current?.tone === "error" && body}
            </div>
          </div>,
          document.body,
        )}
    </NoticeContext.Provider>
  );
}

export function useNotice(): NoticeApi {
  const api = useContext(NoticeContext);
  if (!api) throw new Error("useNotice는 <NoticeProvider> 안에서만 쓸 수 있습니다.");
  return api;
}
