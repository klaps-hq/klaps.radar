import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { TemplateErrorBoundary } from "./components/TemplateErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TemplateErrorBoundary>
      <App />
    </TemplateErrorBoundary>
  </StrictMode>
);
