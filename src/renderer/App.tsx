import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Accounts } from "./pages/Accounts";
import { Dashboard } from "./pages/Dashboard";
import { AccountTransactionsPage } from "./pages/AccountTransactionsPage";
import { Checkpoints } from "./pages/Checkpoints";
import { Categories } from "./pages/Categories";
import { InvestmentPortfolios } from "./pages/InvestmentPortfolios";
import { PortfolioDetailsPage } from "./pages/PortfolioDetailsPage";
import { PositionDetailsPage } from "./pages/PositionDetailsPage";
import { PerformanceReportsPage } from "./pages/PerformanceReportsPage";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";

const App: React.FC = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <Navbar />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 p-6 min-h-0 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/accounts" element={<Navigate to="/accounts/manage" replace />} />
              <Route path="/accounts/:accountId/transactions" element={<AccountTransactionsPage />} />
              <Route path="/accounts/manage" element={<Accounts />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/checkpoints" element={<Checkpoints />} />
              <Route path="/investments" element={<InvestmentPortfolios />} />
              <Route path="/investments/:portfolioId" element={<PortfolioDetailsPage />} />
              <Route path="/investments/:portfolioId/position/:tickerSymbol" element={<PositionDetailsPage />} />
              <Route path="/investments/:portfolioId/reports" element={<PerformanceReportsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
};

export default App;
