import React from "react";
import ReactDOM from "react-dom/client";
import WebApp from "./WebApp";
import "./web.css";

ReactDOM.createRoot(document.getElementById("web-root")!).render(
  <React.StrictMode>
    <WebApp />
  </React.StrictMode>
);
