// 아직 연결하지 않은 화면(생성 M-02·M-03, 통계, 내 번호 등) — 다음 작업에서 packages/ui·app-core 화면으로 바꾼다.
import { Header, StateView } from "@lotto-lab/ui";
import { href } from "../routes.ts";

export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <Header title={title} />
      <StateView
        kind="empty"
        title="준비 중"
        description="이 화면은 다음 업데이트에서 제공됩니다."
        action={
          <a className="ll-button" data-variant="secondary" href={href("/")}>
            홈으로 돌아가기
          </a>
        }
      />
    </>
  );
}
