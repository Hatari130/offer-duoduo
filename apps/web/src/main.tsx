import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AuthProvider } from "./app/AuthContext";
import { applyColorTheme, getInitialColorTheme } from "./app/theme";
import "@offerflow/ui/tokens.css";
import "@offerflow/ui/primitives.css";
import "./styles/global.css";
import "./styles/avatar.css";
import "./styles/auth.css";
import "./styles/shell.css";
import "./styles/feedback.css";
import "./styles/chat.css";
import "./styles/data-pages.css";
import "./styles/company-directory.css";
import "./styles/resume-studio.css";
import "./styles/browser-extension.css";
import "./styles/help-center.css";
import "./styles/theme.css";

applyColorTheme(getInitialColorTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
