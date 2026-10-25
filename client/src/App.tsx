import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./state/AuthContext";
import { Loading } from "./components/ui";
import { AppShell } from "./components/Layout";
import Login from "./pages/Login";
import SetupWizard from "./pages/SetupWizard";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Money from "./pages/Money";
import Workers from "./pages/Workers";
import WorkerDetail from "./pages/WorkerDetail";
import Suppliers from "./pages/Suppliers";
import SupplierDetail from "./pages/SupplierDetail";
import Materials from "./pages/Materials";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Documents from "./pages/Documents";
import Notes from "./pages/Notes";
import Settings from "./pages/Settings";
import SearchPage from "./pages/SearchPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.needsSetupWizard && location.pathname !== "/setup") return <Navigate to="/setup" replace />;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const { me, loading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/setup" element={me ? <SetupWizard /> : <Navigate to="/login" replace />} />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
      <Route path="/projects/:id" element={<RequireAuth><ProjectDetail /></RequireAuth>} />
      <Route path="/money" element={<RequireAuth><Money /></RequireAuth>} />
      <Route path="/workers" element={<RequireAuth><Workers /></RequireAuth>} />
      <Route path="/workers/:id" element={<RequireAuth><WorkerDetail /></RequireAuth>} />
      <Route path="/suppliers" element={<RequireAuth><Suppliers /></RequireAuth>} />
      <Route path="/suppliers/:id" element={<RequireAuth><SupplierDetail /></RequireAuth>} />
      <Route path="/materials" element={<RequireAuth><Materials /></RequireAuth>} />
      <Route path="/tasks" element={<RequireAuth><Tasks /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
      <Route path="/documents" element={<RequireAuth><Documents /></RequireAuth>} />
      <Route path="/notes" element={<RequireAuth><Notes /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="/search" element={<RequireAuth><SearchPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
