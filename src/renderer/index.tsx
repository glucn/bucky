import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AccountsProvider } from "./context/AccountsContext";

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <AccountsProvider>
      <App />
    </AccountsProvider>
  </React.StrictMode>
);
