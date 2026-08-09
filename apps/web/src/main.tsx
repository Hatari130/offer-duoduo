import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AuthProvider } from "./app/AuthContext";
import "@offerflow/ui/tokens.css";
import "./styles/global.css";
import "./styles/auth.css";
import "./styles/shell.css";
import "./styles/chat.css";
import "./styles/data-pages.css";
import "./styles/membership.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
