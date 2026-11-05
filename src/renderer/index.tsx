import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AccountsProvider } from "./context/AccountsContext";
import { SecurityBoundary } from "./components/SecurityBoundary";
import { BookSetupBoundary } from "./components/BookSetupBoundary";

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <SecurityBoundary>
      <BookSetupBoundary>
        <AccountsProvider>
          <App />
        </AccountsProvider>
      </BookSetupBoundary>
    </SecurityBoundary>
  </React.StrictMode>
);
