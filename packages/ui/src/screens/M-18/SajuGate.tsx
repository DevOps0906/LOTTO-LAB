// 사주 화면(M-18·M-19) 인증 게이트(task-041 결정 ④⑤): AuthService 상태가 signedIn일 때만 본문을 그린다.
// loading = 대기, unavailable = 안내·다시 확인, signedOut·consentRequired = M-06 유도. 본문은 user.id를 key로 다시 마운트해
// 계정이 바뀌면 이전 폼·결과·진행 중 응답이 모두 사라진다(로그아웃도 같다).
import { useSyncExternalStore, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { Header } from "../../components/Header";
import { StateView } from "../../components/StateView";

/** app-core AuthState 중 게이트가 쓰는 부분(구조 호환). */
export type SajuAuthState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "signedOut" }
  | { status: "consentRequired" }
  | { status: "signedIn"; user: { id: string } };

export type SajuAuth = {
  state(): SajuAuthState;
  subscribe(listener: () => void): () => void;
  /** 저장소 읽기 실패(unavailable) 뒤 다시 확인 */
  retry(): Promise<unknown>;
};

export function SajuGate({
  auth,
  title,
  subtitle,
  onLogin,
  children,
}: {
  auth: SajuAuth;
  title: string;
  subtitle: string;
  /** 셸이 복귀 경로를 기억하고 M-06으로 보낸다 */
  onLogin: () => void;
  children: (user: { id: string }) => ReactNode;
}) {
  const state = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.state(),
  );
  if (state.status === "signedIn") return <div key={state.user.id}>{children(state.user)}</div>;
  return (
    <div className="ll-gen">
      <Header title={title} subtitle={subtitle} />
      {state.status === "loading" ? (
        <StateView kind="loading" title="로그인 상태를 확인하는 중입니다" />
      ) : state.status === "unavailable" ? (
        <StateView
          kind="error"
          title="로그인 상태를 확인하지 못했어요"
          description="기기 저장소를 읽지 못했어요. 잠시 후 다시 확인해 주세요."
          action={<Button onClick={() => void auth.retry()}>다시 확인</Button>}
        />
      ) : (
        <StateView
          kind="empty"
          title="로그인이 필요해요"
          description={
            state.status === "consentRequired"
              ? "가입 동의를 마치면 사용할 수 있어요. 로그인 화면에서 동의를 이어서 진행하세요."
              : "사주 번호는 회원 기능이에요. 로그인하거나 가입한 뒤 이용하세요. 로그인 전에는 이 기기의 번호를 서버로 보내지 않습니다."
          }
          action={<Button onClick={onLogin}>로그인·가입</Button>}
        />
      )}
    </div>
  );
}
