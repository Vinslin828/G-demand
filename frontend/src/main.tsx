import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { MessageProvider } from "./context/MessageContext";
import "./i18n/index";
import "./index.css";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MessageProvider>
      <App />
    </MessageProvider>
  </StrictMode>,
)
