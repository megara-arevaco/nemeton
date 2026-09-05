import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import { App } from "./components/App";
import { ThemeProvider } from "./components/ThemeProvider";
import { queryClient } from "./queries/queryClient";
const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element is missing");
}
try {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
} catch (error) {
  root.textContent = `No se pudo iniciar la interfaz: ${String(error)}`;
}
