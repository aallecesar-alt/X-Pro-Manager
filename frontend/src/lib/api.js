import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;
export const PUBLIC_API_BASE = `${BACKEND_URL}/api/public`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("intercar_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

export const formatCurrency = (v, locale = "pt-BR", currency = "USD") =>
  new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(v || 0);

export const formatNumber = (v) => new Intl.NumberFormat("en-US").format(v || 0);
