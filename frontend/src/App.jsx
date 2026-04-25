import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import DetailPage from "./pages/DetailPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import MonthPage from "./pages/MonthPage.jsx";

function AppShell() {
  return <div className="app-shell"><Outlet /></div>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="years/:year/months/:month" element={<MonthPage />} />
        <Route path="records/:recordId" element={<DetailPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
