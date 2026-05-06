import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = not authed
  const [dealership, setDealership] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("intercar_token");
    if (!token) { setUser(false); return; }
    api.get("/auth/me")
      .then((r) => { setUser(r.data.user); setDealership(r.data.dealership); })
      .catch(() => { localStorage.removeItem("intercar_token"); setUser(false); });
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("intercar_token", data.access_token);
    setUser(data.user); setDealership(data.dealership);
  };

  const signup = async (payload) => {
    const { data } = await api.post("/auth/signup", payload);
    localStorage.setItem("intercar_token", data.access_token);
    setUser(data.user); setDealership(data.dealership);
  };

  const logout = () => {
    localStorage.removeItem("intercar_token");
    setUser(false); setDealership(null);
  };

  const refreshDealership = async () => {
    const { data } = await api.get("/dealership");
    setDealership(data);
  };

  return (
    <AuthContext.Provider value={{ user, dealership, login, signup, logout, refreshDealership }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
