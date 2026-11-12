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
export type { ScreenCore } from "./screens/common/data";
export { GenerateSelect, type GenerateSelectLinks, type GenerateSelectProps } from "./screens/M-15/GenerateSelect";
export { LottoGenerator, type LottoGeneratorLinks, type LottoGeneratorProps } from "./screens/M-02/LottoGenerator";
export { PensionGenerator, type PensionGeneratorLinks, type PensionGeneratorProps } from "./screens/M-03/PensionGenerator";
export type { GeneratorCore } from "./screens/common/generator";
