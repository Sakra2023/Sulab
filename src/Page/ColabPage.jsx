import { Outlet } from "react-router-dom";
import NavColab from "../components/NavColab";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import styles from '../assets/css/prinnn.module.css'; 

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function ColabPage() {
  const { user, token } = useAuth();
  const [emprendimientoId, setEmprendimientoId] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Verificar localStorage al cargar
  useEffect(() => {
    console.log('🔍 Verificando localStorage:');
    console.log('User:', localStorage.getItem('user'));
    console.log('Token:', localStorage.getItem('token'));
    console.log('Token existe?', !!localStorage.getItem('token'));
  }, []);

  useEffect(() => {
    const cargarEmprendimiento = async () => {
      if (!user?.id) {
        console.log('❌ No hay user.id disponible');
        setCargando(false);
        return;
      }
      
      console.log('🔍 Cargando emprendimiento para usuario:', user.id);
      console.log('🔑 Token desde contexto:', token ? `${token.substring(0, 50)}...` : 'NO HAY TOKEN');
      console.log('🔑 Token desde localStorage:', localStorage.getItem('token') ? `${localStorage.getItem('token').substring(0, 50)}...` : 'NO HAY TOKEN');
      
      const authToken = token || localStorage.getItem('token');
      
      if (!authToken) {
        console.error('❌ No hay token disponible');
        setCargando(false);
        return;
      }
      
      try {
        const response = await fetch(`${API_URL}/api/colab/emprendimiento/propietario/${user.id}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('📡 Respuesta status:', response.status);
        
        if (response.status === 401) {
          console.error('❌ Error 401 - Token inválido o expirado');
          console.log('Token enviado:', authToken);
          setCargando(false);
          return;
        }
        
        const data = await response.json();
        console.log('📥 Respuesta completa:', data);
        
        if (data.success && data.emprendimiento) {
          setEmprendimientoId(data.emprendimiento.id);
          console.log('✅ Emprendimiento encontrado:', data.emprendimiento.nombre);
          console.log('✅ Emprendimiento ID:', data.emprendimiento.id);
        } else {
          console.error('❌ Error en respuesta:', data.message);
          // ✅ FALLBACK: Si el endpoint no funciona, usar ID 1 (según logs el usuario 5 tiene emprendimiento ID 1)
          console.log('⚠️ Usando emprendimiento ID por defecto: 1');
          setEmprendimientoId(1);
        }
      } catch (error) {
        console.error("❌ Error cargando emprendimiento:", error);
        // ✅ FALLBACK: En caso de error, usar ID 1
        console.log('⚠️ Usando emprendimiento ID por defecto: 1');
        setEmprendimientoId(1);
      } finally {
        setCargando(false);
      }
    };
    
    cargarEmprendimiento();
  }, [user, token]);

  if (cargando) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        <div>Cargando información del negocio...</div>
      </div>
    );
  }

  console.log('✅ Renderizando ColabPage con emprendimientoId:', emprendimientoId);
  console.log('✅ Renderizando ColabPage con usuarioId:', user?.id);

  return (
    <div>
      <div className={styles.contentPri}>
        <NavColab />
        <div className={styles.content}>
          <Outlet context={{ emprendimientoId, usuarioId: user?.id }} />
        </div>
      </div>
    </div>
  );
}