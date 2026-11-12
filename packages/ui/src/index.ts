// @lotto-lab/ui — 셸 무관 공유 블록(React 19). 스타일: "@lotto-lab/ui/styles.css"(토큰 CSS 변수만).
export { ActionMenu, type ActionMenuItem, type ActionMenuProps } from "./components/ActionMenu";
export { AlertDialog, type AlertDialogProps } from "./components/AlertDialog";
export { AppShell, type AppShellProps, type NavItem } from "./components/AppShell";
export { Ball, ballLabel, type BallProps, type BallState } from "./components/Ball";
export { BallGrid, type BallGridProps } from "./components/BallGrid";
export { Button, type ButtonProps, type ButtonVariant } from "./components/Button";
export { Card, type CardProps } from "./components/Card";
export { Header, type HeaderProps } from "./components/Header";
export { InfoTip, type InfoTipProps } from "./components/InfoTip";
export {
  NoticeProvider,
  SNACKBAR_ACTION_MS,
  SNACKBAR_MS,
  TOAST_MS,
  useNotice,
  type NoticeAction,
  type NoticeApi,
  type NoticeProviderProps,
  type NoticeTone,
  type SnackbarOptions,
  type ToastOptions,
} from "./components/Notice";
export { Sheet, type SheetProps } from "./components/Sheet";
export { Stat, type StatProps, type StatTrend } from "./components/Stat";
export { StateView, type StateKind, type StateViewProps } from "./components/StateView";
export { Table, type TableColumn, type TableProps } from "./components/Table";
export { Updated, type UpdatedProps } from "./components/Updated";
export { Onboarding, type OnboardingProps } from "./screens/M-05/Onboarding";
export { Home, type HomeLinks, type HomeProps } from "./screens/M-01/Home";
export { Dashboard, RECENT_DRAWS, type DashboardLinks, type DashboardProps } from "./screens/D-01/Dashboard";
export type { ScreenCore } from "./screens/common/data";
export { GenerateSelect, type GenerateSelectLinks, type GenerateSelectProps } from "./screens/M-15/GenerateSelect";
export { LottoGenerator, type LottoGeneratorLinks, type LottoGeneratorProps } from "./screens/M-02/LottoGenerator";
export { PensionGenerator, type PensionGeneratorLinks, type PensionGeneratorProps } from "./screens/M-03/PensionGenerator";
export type { GeneratorCore } from "./screens/common/generator";
export { Statistics, type StatisticsLinks, type StatisticsProps } from "./screens/M-04/Statistics";
export { DrawList, type DrawListLinks, type DrawListProps } from "./screens/M-16/DrawList";
export { DrawDetail, type DrawDetailLinks, type DrawDetailProps } from "./screens/M-11/DrawDetail";
export type { TicketsCore, TicketRecord, TicketOutcome, HistoryRecord } from "./screens/common/ticket";
export { MyTickets, TICKET_PAGE, type MyTicketsLinks, type MyTicketsProps, type MyTicketsTab } from "./screens/M-07/MyTickets";
export { TicketCheck, type TicketCheckLinks, type TicketCheckProps } from "./screens/M-08/TicketCheck";
export { TicketDetail, type TicketDetailLinks, type TicketDetailProps } from "./screens/M-08/TicketDetail";
export { PurchaseRegister, type PurchaseRegisterLinks, type PurchaseRegisterProps } from "./screens/M-09/PurchaseRegister";
export { CLEAR_PHRASE, Settings, type SettingsCore, type SettingsProps, type ThemePreference } from "./screens/M-12/Settings";
