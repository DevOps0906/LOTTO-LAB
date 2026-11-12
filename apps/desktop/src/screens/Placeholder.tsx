// 빈 화면 틀 — 화면 로직은 이후 작업에서 packages/ui·app-core로 채운다.
import { Header, StateView } from "@lotto-lab/ui";

export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <Header title={title} />
      <StateView kind="empty" title="준비 중인 화면입니다" description="이 화면은 다음 작업에서 채워집니다." />
    </>
  );
}
