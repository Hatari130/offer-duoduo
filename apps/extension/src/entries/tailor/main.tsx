import React from "react";
import ReactDOM from "react-dom/client";
import TailorApp from "./App";
import "@/app/styles.css";
import "./styles.css";
import "@/app/jobkoi-theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TailorApp />
  </React.StrictMode>
);
