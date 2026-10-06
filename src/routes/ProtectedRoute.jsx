// routes/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ textAlign: "center", marginTop: "2rem" }}>
        <h3>Cargando...</h3>
      </div>
    );
  }

  // SI NO HAY USUARIO, redirige PERO guarda de dónde venía
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si no se especifican roles, permitir acceso
  if (allowedRoles.length === 0) {
    return children;
  }

  const userRole = user.rol?.toLowerCase();
  const allowed = allowedRoles.map(role => role.toLowerCase());

  // Si no tiene el rol adecuado, redirige al inicio
  if (!allowed.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  return children;
}