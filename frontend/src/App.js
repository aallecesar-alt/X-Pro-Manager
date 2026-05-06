import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { I18nProvider } from "@/lib/i18n.jsx";
import AuthPage from "@/pages/AuthPage";
import AppShell from "@/pages/AppShell";

function Gate() {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="label-eyebrow text-text-secondary">Loading...</div>
      </div>
    );
  }
  return user ? <AppShell /> : <Navigate to="/auth" replace />;
}

function PublicGate({ children }) {
  const { user } = useAuth();
  if (user === null) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function App() {
  useEffect(() => { document.title = "Inter Car · Auto Manager"; }, []);
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster theme="dark" position="top-right" />
          <Routes>
            <Route path="/auth" element={<PublicGate><AuthPage /></PublicGate>} />
            <Route path="/*" element={<Gate />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
