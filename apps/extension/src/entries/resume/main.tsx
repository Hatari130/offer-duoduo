import React from "react";
import ReactDOM from "react-dom/client";
import ResumeManagerApp from "@/features/resumes/ResumeManagerApp";
import "@/app/styles.css";
import "@/features/resumes/resume-manager.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ResumeManagerApp />
  </React.StrictMode>
);
