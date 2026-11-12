import type { ComponentPropsWithoutRef } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell, Button, Card, Header, Stat, StateView, Table, Updated, type NavItem } from "../src";

const tabs: NavItem[] = [
  { href: "/", label: "홈", icon: <svg aria-hidden="true" />, current: true },
  { href: "/generate", label: "추천", icon: <svg aria-hidden="true" /> },
  { href: "/stats", label: "통계", icon: <svg aria-hidden="true" /> },
  { href: "/mine", label: "내번호", icon: <svg aria-hidden="true" /> },
];
const side: NavItem[] = [
  { href: "/", label: "대시보드", icon: <svg aria-hidden="true" />, current: true },
  { href: "/lotto", label: "로또 생성", icon: <svg aria-hidden="true" /> },
  { href: "/pension", label: "연금 생성", icon: <svg aria-hidden="true" /> },
  { href: "/settings", label: "설정", icon: <svg aria-hidden="true" /> },
];

describe("AppShell", () => {
  it("모바일 하단 탭(4개)과 768~ 사이드바 내비를 함께 렌더하고 CSS가 구간별로 하나만 보인다", () => {
    const { container } = render(
      <AppShell brandMark={<svg aria-hidden="true" />} brandName="LOTTO LAB" tabItems={tabs} sideItems={side}>
        <p>본문</p>
      </AppShell>,
    );
    const tabbar = screen.getByRole("navigation", { name: "하단 탭" });
    expect(tabbar).toHaveClass("ll-tabbar");
    expect(within(tabbar).getAllByRole("link")).toHaveLength(4);
    expect(within(tabbar).getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");

    const sideNav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(sideNav.closest("aside")).toHaveClass("ll-shell__side");
    // 레일(768~1199): aria-label 유지 + 라벨 span이 호버·포커스 툴팁으로 보인다(styles.css)
    const lotto = within(sideNav).getByRole("link", { name: "로또 생성" });
    expect(lotto).toHaveAttribute("aria-label", "로또 생성");
    expect(lotto.querySelector(".ll-side__label")).toHaveTextContent("로또 생성");
    expect(lotto).not.toHaveAttribute("aria-current");

    expect(screen.getByRole("main")).toHaveTextContent("본문");
    expect(container.firstChild).toHaveClass("ll-shell");
  });

  it("셸의 링크 컴포넌트를 주입받는다", () => {
    function FakeLink(props: ComponentPropsWithoutRef<"a">) {
      return <a data-router="1" {...props} />;
    }
    render(
      <AppShell brandMark={null} brandName="LOTTO LAB" tabItems={tabs} sideItems={side} linkComponent={FakeLink}>
        <p>본문</p>
      </AppShell>,
    );
    for (const link of screen.getAllByRole("link")) expect(link).toHaveAttribute("data-router", "1");
  });
});

describe("StateView", () => {
  it("로딩 알림(status)은 busy가 아니고, 갱신 컨테이너(Card busy)는 따로 aria-busy", () => {
    render(
      <>
        <StateView kind="loading" />
        <Card title="최근 회차" busy>
          목록
        </Card>
      </>,
    );
    const s = screen.getByRole("status");
    expect(s).toHaveTextContent("불러오는 중입니다");
    expect(s.closest("[aria-busy]")).toBeNull();
    expect(screen.getByRole("region", { name: "최근 회차" })).toHaveAttribute("aria-busy", "true");
  });

  it("오류는 alert + 다시 시도 행동", () => {
    render(<StateView kind="error" description="네트워크를 확인하세요." action={<Button>다시 시도</Button>} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("불러오지 못했습니다");
    expect(within(alert).getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("빈 상태는 제목을 바꿀 수 있고 live 역할이 없다", () => {
    render(<StateView kind="empty" title="저장한 번호가 없습니다" />);
    expect(screen.getByText("저장한 번호가 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("기본 블록", () => {
  it("Header·Card·Stat", () => {
    render(
      <>
        <Header title="홈" subtitle="최근 회차 요약" />
        <Card title="이번 주 요약">내용</Card>
        <Stat label="저장한 번호" value="12" delta={{ trend: "up", change: "+2" }} hint="이번 달" />
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "이번 주 요약" })).toHaveClass("ll-card");
    expect(screen.getByText("증가")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("Table은 표와 좁은 화면용 카드 목록을 함께 만든다", () => {
    const rows = [{ round: 1150, date: "2026-11-07" }];
    render(
      <Table
        caption="최근 회차"
        rowKey={(r) => r.round}
        columns={[
          { key: "round", header: "회차", numeric: true },
          { key: "date", header: "추첨일" },
        ]}
        rows={rows}
      />,
    );
    const table = screen.getByRole("table", { name: "최근 회차" });
    expect(within(table).getByRole("columnheader", { name: "회차" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "1150" })).toHaveAttribute("data-numeric", "true");
    const list = screen.getByRole("list", { name: "최근 회차" });
    expect(within(list).getByText("추첨일")).toBeInTheDocument();
  });

  it("Updated는 출처·검증 시각(KST)·미래 예측 아님 고지", () => {
    render(<Updated source="공식 추첨 결과" verifiedAt="2026-11-07T12:40:00Z" basis="최근 100회차" notPrediction />);
    const time = screen.getByText(/2026/);
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-11-07T12:40:00.000Z");
    expect(time.textContent).toContain("21:40");
    expect(screen.getByText("공식 추첨 결과")).toBeInTheDocument();
    expect(screen.getByText("과거 데이터 통계이며 미래 예측이 아닙니다.")).toBeInTheDocument();
  });

  it("Button 기본 type=button, 변형 속성", () => {
    render(<Button variant="pension">연금 생성</Button>);
    const b = screen.getByRole("button", { name: "연금 생성" });
    expect(b).toHaveAttribute("type", "button");
    expect(b).toHaveAttribute("data-variant", "pension");
  });
});
