import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import "@/app/styles.css";
import "@/app/jobkoi-theme.css";

const overlay = new URLSearchParams(location.search).get("surface") === "overlay";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App overlay={overlay} />
  </React.StrictMode>
);
