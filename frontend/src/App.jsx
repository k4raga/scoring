import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import DetailPage from "./pages/DetailPage.jsx";
import DocumentsPage from "./pages/DocumentsPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import MarkdownDocumentPage from "./pages/MarkdownDocumentPage.jsx";
import MonthPage from "./pages/MonthPage.jsx";
import RecordsDocumentIndexPage from "./pages/RecordsDocumentIndexPage.jsx";
import SourceFolderPage from "./pages/SourceFolderPage.jsx";

function AppShell() {
  return <div className="app-shell"><Outlet /></div>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="years/:year/months/:month" element={<MonthPage />} />
        <Route path="records" element={<RecordsDocumentIndexPage />} />
        <Route path="records/:recordId/source-folder" element={<SourceFolderPage />} />
        <Route path="records/:recordId/documents" element={<DocumentsPage />} />
        <Route path="records/:recordId/documents/:documentId" element={<MarkdownDocumentPage />} />
        <Route path="records/:recordId" element={<DetailPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
