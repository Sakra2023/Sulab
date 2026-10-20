import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// ============================================
// ✅ FUNCIONES AUXILIARES (NUEVAS)
// ============================================

// Decodifica el JWT sin librerías externas
const decodeJWT = (token) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
};

// Verifica si el token expiró
const isTokenExpired = (token) => {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) return true;
  return payload.exp * 1000 < Date.now();
};

// Limpia todo el almacenamiento de sesión
const clearSession = () => {
  localStorage.removeItem("user");
  localStorage.removeItem("token");
  sessionStorage.removeItem("user");
  sessionStorage.removeItem("token");
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // ============================================
  // Hidratar sesión al iniciar (con validación de expiración)
  // ============================================
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token");

    if (storedUser && storedToken) {
      // ✅ Validar expiración antes de aceptar el token
      if (isTokenExpired(storedToken)) {
        clearSession();
      } else {
        try {
          setUser(JSON.parse(storedUser));
          setToken(storedToken);
        } catch {
          clearSession();
        }
      }
    }
    setLoading(false);
  }, []);

  // ============================================
  // ✅ DETECTAR RESTAURACIÓN DESDE BFCACHE
  // (soluciona el problema de la flecha "adelante" del navegador)
  // ============================================
  useEffect(() => {
    const handlePageShow = (event) => {
      if (event.persisted) {
        // La página se restauró desde bfcache
        const storedToken = localStorage.getItem("token");

        if (!storedToken || isTokenExpired(storedToken)) {
          setUser(null);
          setToken(null);
          clearSession();
        }
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // ============================================
  // LOGIN
  // ============================================
  const loginUser = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("token", authToken);
  };

  // ============================================
  // ✅ LOGOUT ROBUSTO (fuerza salida y elimina bfcache)
  // ============================================
  const logoutUser = () => {
    clearSession();
    setUser(null);
    setToken(null);

    // ✅ Forzar navegación completa → elimina bfcache y limpia estado en memoria
    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      window.location.replace("/login");
    }
  };

  // Función auxiliar para obtener headers con autenticación
  const getAuthHeaders = (multipart = false) => {
    const headers = {
      'Authorization': `Bearer ${token}`
    };
    
    // Solo agregar Content-Type si NO es multipart
    if (!multipart) {
      headers['Content-Type'] = 'application/json';
    }
    
    return headers;
  };

  // Función para hacer peticiones autenticadas (AHORA SOPORTA FormData)
  const fetchWithAuth = async (url, options = {}) => {
    // Detectar si el body es FormData
    const isFormData = options.body instanceof FormData;
    
    // Obtener headers (sin Content-Type si es FormData)
    const headers = getAuthHeaders(isFormData);
    
    const config = {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    };

    // Si NO es FormData y hay body, convertirlo a JSON
    if (options.body && !isFormData) {
      config.body = JSON.stringify(options.body);
    }
    // Si es FormData, NO hacer nada (FormData ya tiene su propio Content-Type)

    const response = await fetch(url, config);

    // Si el token expiró, cerrar sesión
    if (response.status === 401) {
      logoutUser();
      throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
    }

    return response;
  };

  // ============================================
  // ✅ BLOQUEO DE RENDER HASTA HIDRATAR
  // (evita que los hijos hagan fetch con "Bearer null")
  // ============================================
  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontSize: "1rem",
        color: "#666"
      }}>
        Cargando sesión...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      loginUser,
      logoutUser,
      getAuthHeaders,
      fetchWithAuth,
      // ✅ isAuthenticated reactivo con validación de expiración
      isAuthenticated: !!token && !isTokenExpired(token)
    }}>
      {children}
    </AuthContext.Provider>
  );
}