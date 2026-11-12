import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { readAppConfig } from "./config.ts";
import { bootstrap } from "./core.ts";
import { followColorScheme } from "./native.ts";
import { createAdapters } from "./platform/index.ts";

followColorScheme();
const core = bootstrap(createAdapters(), readAppConfig());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App core={core} />
  </StrictMode>,
);
