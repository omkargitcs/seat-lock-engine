import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";

export default function RequireAuth({ admin = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loading" role="status">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}
