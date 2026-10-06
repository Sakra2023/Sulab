import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Hidratar sesión al iniciar
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token");
    
    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
      } catch {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      }
    }
    setLoading(false);
  }, []);

  const loginUser = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("token", authToken);
  };

  const logoutUser = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    setToken(null);
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

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      loginUser,
      logoutUser,
      getAuthHeaders,
      fetchWithAuth,
      isAuthenticated: !!token
    }}>
      {children}
    </AuthContext.Provider>
  );
}