import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { readAppConfig } from "./config.ts";
import { bootstrap } from "./core.ts";
import { createAdapters } from "./platform/index.ts";
import { createThemeController } from "./theme.ts";

const theme = createThemeController();
const core = bootstrap(createAdapters(), readAppConfig());
// 저장된 테마 선호를 적용한다(읽기 실패면 시스템 설정 유지).
core.core?.theme.get().then((t) => theme.set(t), () => {});

/** 모두 삭제(D-09) 뒤 처음 상태(19세 확인부터)로 다시 시작한다. */
function restart() {
  theme.set("system");
  window.location.hash = "/";
  window.location.reload();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App core={core} onThemeChange={(t) => theme.set(t)} onCleared={restart} />
  </StrictMode>,
);
