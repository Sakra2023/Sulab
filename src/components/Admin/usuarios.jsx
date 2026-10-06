import { useState, useEffect, useMemo } from 'react';
import styles from "../../assets/css/adm/usuarios.module.css";
import io from 'socket.io-client';

// ✅ Usar rutas relativas - el proxy de Nginx manejará la redirección
const API_URL = ''; // Vacío para usar rutas relativas

// Modal de puntos - FUERA del componente principal
const PointsModal = ({
  showPointsModal,
  pointsInput,
  setPointsInput,
  pointsAction,
  setShowPointsModal,
  processPoints
}) => {
  if (!showPointsModal) return null;

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3>{pointsAction === 'add' ? '➕ Agregar Puntos' : '➖ Remover Puntos'}</h3>
          <button
            type="button"
            onClick={() => setShowPointsModal(false)}
            className={styles.closeBtn}
          >
            &times;
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.filterGroup}>
            <label>Cantidad de puntos:</label>
            <input
              type="number"
              value={pointsInput}
              onChange={(e) => setPointsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  processPoints(e);
                }
              }}
              className={styles.filterInput}
              placeholder="Ingresa la cantidad de puntos"
              min="1"
              autoFocus
            />
          </div>
          <div className={styles.modalActions}>
            <button
              type="button"
              onClick={(e) => processPoints(e)}
              className={`${styles.btn} ${pointsAction === 'add' ? styles.btnSuccess : styles.btnWarning}`}
            >
              {pointsAction === 'add' ? '➕ Agregar' : '➖ Remover'}
            </button>
            <button
              type="button"
              onClick={() => setShowPointsModal(false)}
              className={`${styles.btn} ${styles.btnOutline}`}
            >
              ❌ Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Modal de usuario - FUERA del componente principal (CORREGIDO)
const UserModal = ({
  showUserModal,
  selectedUser,
  setShowUserModal,
  handleToggleStatus,
  handleDeleteUser,
  setSelectedUserId,
  setPointsAction,
  setPointsInput,
  setShowPointsModal,
  getNivelColor,
  getStatusColor,
  calcularNivel,
  calcularPuntosSiguienteNivel
}) => {
  // ✅ CORRECCIÓN: Validar ambos estados para cerrar correctamente
  if (!showUserModal || !selectedUser) return null;

  const nivel = calcularNivel(selectedUser.puntosAcumulados || 0);
  const puntosSiguiente = calcularPuntosSiguienteNivel(selectedUser.puntosAcumulados || 0);

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3>👤 Detalles del Usuario</h3>
          <button
            type="button"
            onClick={() => {
              setShowUserModal(false);
            }}
            className={styles.closeBtn}
          >
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.userHeader}>
            <div className={styles.avatarLarge}>
              {selectedUser.foto_url ? (
                <img 
                  src={selectedUser.foto_url} 
                  alt={selectedUser.usuario}
                  className={styles.avatarImageLarge}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<span class="' + styles.avatarIcon + '">👤</span>';
                  }}
                />
              ) : (
                <span className={styles.avatarIcon}>👤</span>
              )}
            </div>
            <div className={styles.userInfo}>
              <h4>{selectedUser.usuario}</h4>
              <div className={styles.userMeta}>
                <span className={styles.userBadge} style={{ backgroundColor: getNivelColor(nivel) }}>
                  {nivel}
                </span>
                <span className={styles.userBadge} style={{ backgroundColor: getStatusColor(selectedUser.activo === 1 ? 'activo' : 'inactivo') }}>
                  {selectedUser.activo === 1 ? 'activo' : 'inactivo'}
                </span>
                <span className={styles.userId}>🆔 {selectedUser.id}</span>
              </div>
            </div>
          </div>

          <div className={styles.userDetailsGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>📧 Email:</span>
              <span className={styles.detailValue}>{selectedUser.email}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>👤 Usuario:</span>
              <span className={styles.detailValue}>{selectedUser.usuario}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>📅 Fecha Registro:</span>
              <span className={styles.detailValue}>
                {selectedUser.fecha_registro ? new Date(selectedUser.fecha_registro).toLocaleDateString() : 'No registrada'}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>🕐 Último Acceso:</span>
              <span className={styles.detailValue}>
                {selectedUser.ultimo_acceso ? new Date(selectedUser.ultimo_acceso).toLocaleDateString() : 'Nunca'}
              </span>
            </div>
          </div>

          <div className={styles.userStats}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>⭐ Puntos Actuales</span>
              <span className={styles.statValue}>{(selectedUser.puntosAcumulados || 0).toLocaleString()}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>🎯 Siguiente Nivel</span>
              <span className={styles.statValue}>
                {puntosSiguiente > 0 ? `${puntosSiguiente} pts para ${nivel === 'Bronce' ? 'Plata' : nivel === 'Plata' ? 'Oro' : 'Diamante'}` : 'Nivel Máximo'}
              </span>
            </div>
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              onClick={() => handleToggleStatus(selectedUser.id)}
              className={`${styles.btn} ${selectedUser.activo === 1 ? styles.btnWarning : styles.btnSuccess}`}
            >
              {selectedUser.activo === 1 ? '⏸️ Suspender' : '▶️ Activar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUserModal(false);
              }}
              className={`${styles.btn} ${styles.btnOutline}`}
            >
              ❌ Cerrar
            </button>
            <button
              type="button"
              onClick={() => {
                handleDeleteUser(selectedUser.id);
                setShowUserModal(false);
              }}
              className={`${styles.btn} ${styles.btnDanger}`}
            >
              🗑️ Eliminar usuario
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Componente principal
export default function User() {
  // Estados principales
  const [usuarios, setUsuarios] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [pointsInput, setPointsInput] = useState('');
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [pointsAction, setPointsAction] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [socket, setSocket] = useState(null);

  // Estados para filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [nivelFilter, setNivelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('puntosAcumulados');
  const [sortDirection, setSortDirection] = useState('desc');

  // ✅ CONEXIÓN SOCKET.IO - CON RUTA RELATIVA
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Conectar al WebSocket con autenticación - RUTA RELATIVA
    const newSocket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    setSocket(newSocket);

    // Escuchar evento de actualización de puntos
    newSocket.on('puntos_actualizados', (data) => {
      console.log('📡 Actualización en tiempo real recibida:', data);
      
      // Actualizar el usuario específico en el estado
      setUsuarios(prevUsuarios => 
        prevUsuarios.map(user => 
          user.id === data.user_id 
            ? { 
                ...user, 
                puntosAcumulados: data.puntos_totales,
                nivel: data.nuevo_nivel || user.nivel
              } 
            : user
        )
      );

      // Si el usuario actualizado está en el modal, actualizarlo también
      if (selectedUser && selectedUser.id === data.user_id) {
        setSelectedUser(prev => ({
          ...prev,
          puntosAcumulados: data.puntos_totales
        }));
      }

      // Mostrar notificación opcional (puedes personalizar)
      if (data.diferencia !== 0) {
        const mensaje = data.diferencia > 0 
          ? `➕ +${data.diferencia} puntos para ${data.user_id}`
          : `➖ ${data.diferencia} puntos para ${data.user_id}`;
        console.log(mensaje);
      }
    });

    // Escuchar eventos de estado de usuario
    newSocket.on('usuario_actualizado', (data) => {
      console.log('📡 Usuario actualizado:', data);
      if (data.user_id) {
        setUsuarios(prevUsuarios =>
          prevUsuarios.map(user =>
            user.id === data.user_id
              ? { ...user, ...data.cambios }
              : user
          )
        );
      }
    });

    // Escuchar eventos de eliminación de usuario
    newSocket.on('usuario_eliminado', (data) => {
      console.log('📡 Usuario eliminado:', data);
      if (data.user_id) {
        setUsuarios(prevUsuarios => 
          prevUsuarios.filter(user => user.id !== data.user_id)
        );
      }
    });

    // Manejar errores de conexión
    newSocket.on('connect_error', (error) => {
      console.error('Error de conexión Socket.IO:', error);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Socket.IO reconectado después de', attemptNumber, 'intentos');
    });

    // Limpiar al desmontar
    return () => {
      if (newSocket) {
        newSocket.off('puntos_actualizados');
        newSocket.off('usuario_actualizado');
        newSocket.off('usuario_eliminado');
        newSocket.off('connect_error');
        newSocket.off('reconnect');
        newSocket.disconnect();
      }
    };
  }, [selectedUser]); // Re-conectar si cambia selectedUser

  // ✅ FUNCIÓN PARA OBTENER HEADERS CON TOKEN
  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  // ✅ FUNCIÓN PARA VERIFICAR TOKEN Y REDIRIGIR
  const redirectToLogin = () => {
    setError('Sesión expirada. Redirigiendo al login...');
    if (socket) {
      socket.disconnect();
    }
    setTimeout(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }, 2000);
  };

  // ✅ Cargar usuarios desde la API CON AUTENTICACIÓN - RUTA RELATIVA
  const cargarUsuarios = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      redirectToLogin();
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      // ✅ Ruta relativa
      const response = await fetch('/api/admin-registro', {
        headers: getAuthHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success) {
        const soloUsuarios = (data.usuarios || []).filter(user => user.rol === 'usuario');
        setUsuarios(soloUsuarios);
      } else {
        setError('Error al cargar usuarios');
      }
    } catch (error) {
      console.error('Error cargando usuarios:', error);
      setError('Error de conexión al cargar usuarios');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarUsuarios();
  }, []);

  // Calcular nivel según puntos
  const calcularNivel = (puntos) => {
    if (puntos >= 10000) return 'Diamante';
    if (puntos >= 5000) return 'Oro';
    if (puntos >= 2000) return 'Plata';
    return 'Bronce';
  };

  // Calcular puntos para siguiente nivel
  const calcularPuntosSiguienteNivel = (puntos) => {
    if (puntos >= 10000) return 0;
    if (puntos >= 5000) return 10000 - puntos;
    if (puntos >= 2000) return 5000 - puntos;
    return 2000 - puntos;
  };

  // Funciones de utilidad
  const getNivelColor = (nivel) => {
    switch (nivel) {
      case 'Diamante': return '#a78bfa';
      case 'Oro': return '#fbbf24';
      case 'Plata': return '#d1d5db';
      case 'Bronce': return '#f97316';
      default: return '#6b7280';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'activo': return '#10b981';
      case 'inactivo': return '#6b7280';
      case 'suspendido': return '#ef4444';
      default: return '#6b7280';
    }
  };

  // Filtrar y ordenar usuarios
  const filteredAndSortedUsers = useMemo(() => {
    let filtered = [...usuarios];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.usuario?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term)
      );
    }

    if (nivelFilter) {
      filtered = filtered.filter(user => calcularNivel(user.puntosAcumulados || 0) === nivelFilter);
    }

    if (statusFilter) {
      const userStatus = (user) => {
        if (user.activo === 1) return 'activo';
        return 'inactivo';
      };
      filtered = filtered.filter(user => userStatus(user) === statusFilter);
    }

    filtered.sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (sortField === 'fecha_registro') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [usuarios, searchTerm, nivelFilter, statusFilter, sortField, sortDirection]);

  // Estadísticas
  const estadisticas = useMemo(() => {
    const totalUsuarios = usuarios.length;
    const usuariosActivos = usuarios.filter(u => u.activo === 1).length;
    const puntosTotales = usuarios.reduce((sum, user) => sum + (user.puntosAcumulados || 0), 0);
    const promedioPuntos = puntosTotales / totalUsuarios || 0;

    const niveles = {
      Diamante: usuarios.filter(u => calcularNivel(u.puntosAcumulados || 0) === 'Diamante').length,
      Oro: usuarios.filter(u => calcularNivel(u.puntosAcumulados || 0) === 'Oro').length,
      Plata: usuarios.filter(u => calcularNivel(u.puntosAcumulados || 0) === 'Plata').length,
      Bronce: usuarios.filter(u => calcularNivel(u.puntosAcumulados || 0) === 'Bronce').length
    };

    return {
      totalUsuarios,
      usuariosActivos,
      puntosTotales,
      promedioPuntos,
      niveles
    };
  }, [usuarios]);

  // Handlers
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleViewUser = (user) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const openPointsModal = (userId, action) => {
    setSelectedUserId(userId);
    setPointsAction(action);
    setPointsInput('');
    setShowPointsModal(true);
  };

  // ✅ PROCESAR PUNTOS CON AUTENTICACIÓN Y SOCKET.IO - RUTA RELATIVA
  const processPoints = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const token = localStorage.getItem('token');
    if (!token) {
      redirectToLogin();
      return;
    }

    if (!pointsInput || pointsInput <= 0) {
      alert('Por favor ingresa una cantidad válida de puntos');
      return;
    }

    const user = usuarios.find(u => u.id === selectedUserId);
    if (!user) {
      alert('Error: Usuario no encontrado');
      return;
    }

    const points = parseInt(pointsInput);

    if (pointsAction === 'remove' && points > (user.puntosAcumulados || 0)) {
      alert('No puedes quitar más puntos de los que tiene el usuario');
      return;
    }

    const newPoints = pointsAction === 'add'
      ? (user.puntosAcumulados || 0) + points
      : (user.puntosAcumulados || 0) - points;

    // ✅ Ruta relativa
    const url = `/api/suma-puntos/${selectedUserId}/puntos`;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ puntosAcumulados: newPoints })
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();

      if (result.success) {
        // ✅ NO llamar a cargarUsuarios() - Socket.IO actualizará en tiempo real
        // Solo actualizar localmente para feedback inmediato
        setUsuarios(prevUsuarios =>
          prevUsuarios.map(u =>
            u.id === selectedUserId
              ? { ...u, puntosAcumulados: newPoints }
              : u
          )
        );
        
        if (selectedUser && selectedUser.id === selectedUserId) {
          setSelectedUser(prev => ({ ...prev, puntosAcumulados: newPoints }));
        }
        
        alert(`${points} puntos ${pointsAction === 'add' ? 'agregados' : 'removidos'} al usuario`);
        setShowPointsModal(false);
        setPointsInput('');
      } else {
        alert('Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error en la petición:', error);
      alert(`Error al ${pointsAction === 'add' ? 'agregar' : 'remover'} puntos: ${error.message}`);
    }
  };

  // ✅ CAMBIAR ESTADO CON AUTENTICACIÓN - RUTA RELATIVA
  const handleToggleStatus = async (userId) => {
    const token = localStorage.getItem('token');
    if (!token) {
      redirectToLogin();
      return;
    }

    const user = usuarios.find(u => u.id === userId);
    const newStatus = user.activo === 1 ? 0 : 1;

    try {
      // ✅ Ruta relativa
      const response = await fetch(`/api/admin-registro/${userId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ activo: newStatus })
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        // Actualizar localmente
        setUsuarios(prevUsuarios =>
          prevUsuarios.map(u =>
            u.id === userId
              ? { ...u, activo: newStatus }
              : u
          )
        );
        
        if (selectedUser && selectedUser.id === userId) {
          setSelectedUser(prev => ({ ...prev, activo: newStatus }));
        }
        
        alert(`Estado del usuario cambiado a ${newStatus === 1 ? 'activo' : 'inactivo'}`);
      } else {
        alert('Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al cambiar estado');
    }
  };

  // ✅ ELIMINAR USUARIO CON AUTENTICACIÓN - RUTA RELATIVA
  const handleDeleteUser = async (userId) => {
    const token = localStorage.getItem('token');
    if (!token) {
      redirectToLogin();
      return;
    }

    if (window.confirm('¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.')) {
      try {
        // ✅ Ruta relativa
        const response = await fetch(`/api/admin-registro/${userId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });

        if (response.status === 401 || response.status === 403) {
          redirectToLogin();
          return;
        }

        const result = await response.json();
        if (result.success) {
          // Eliminar localmente
          setUsuarios(prevUsuarios => prevUsuarios.filter(u => u.id !== userId));
          
          if (selectedUser && selectedUser.id === userId) {
            setShowUserModal(false);
            setSelectedUser(null);
          }
          
          alert('Usuario eliminado correctamente');
        } else {
          alert('Error: ' + result.message);
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Error al eliminar usuario');
      }
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setNivelFilter('');
    setStatusFilter('');
    setSortField('puntosAcumulados');
    setSortDirection('desc');
  };

  const handleExportData = () => {
    const dataToExport = usuarios.map(user => ({
      id: user.id,
      usuario: user.usuario,
      email: user.email,
      puntos: user.puntosAcumulados,
      nivel: calcularNivel(user.puntosAcumulados || 0),
      status: user.activo === 1 ? 'activo' : 'inactivo',
      fecha_registro: user.fecha_registro,
      ultimo_acceso: user.ultimo_acceso
    }));
    const data = JSON.stringify(dataToExport, null, 2);
    navigator.clipboard.writeText(data);
    alert('Datos de usuarios copiados al portapapeles');
  };

  // Componente de Tabla
  const UsersTable = () => {
    if (isLoading) {
      return (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Cargando usuarios...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyMessage}>⚠️ {error}</p>
          <button onClick={cargarUsuarios} className={styles.btnOutline}>
            🔄 Reintentar
          </button>
        </div>
      );
    }

    if (filteredAndSortedUsers.length === 0) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyMessage}>
            📭 No se encontraron usuarios con los filtros aplicados
          </p>
          <button onClick={handleResetFilters} className={styles.btnOutline}>
            🔄 Limpiar filtros
          </button>
        </div>
      );
    }

    return (
      <div className={styles.tableContainer}>
        <table className={styles.usersTable}>
          <thead>
            <tr>
              <th>#</th>
              <th onClick={() => handleSort('usuario')} className={styles.sortable}>
                Usuario {sortField === 'usuario' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('puntosAcumulados')} className={styles.sortable}>
                ⭐ Puntos {sortField === 'puntosAcumulados' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('nivel')} className={styles.sortable}>
                🏆 Nivel
              </th>
              <th onClick={() => handleSort('activo')} className={styles.sortable}>
                📊 Estado {sortField === 'activo' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('fecha_registro')} className={styles.sortable}>
                📅 Registro {sortField === 'fecha_registro' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>⚡ Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedUsers.map((user, index) => {
              const nivel = calcularNivel(user.puntosAcumulados || 0);
              const puntosSiguiente = calcularPuntosSiguienteNivel(user.puntosAcumulados || 0);
              const progreso = user.puntosAcumulados >= 10000 ? 100 :
                (user.puntosAcumulados / 10000) * 100;

              return (
                <tr key={user.id} className={styles.tableRow}>
                  <td className={styles.indexCell}>{index + 1}</td>
                  <td className={styles.userCell}>
                    <div className={styles.userInfoCell}>
                      <span className={styles.avatarSmall}>
                        {user.foto_url ? (
                          <img 
                            src={user.foto_url} 
                            alt={user.usuario}
                            className={styles.avatarImage}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.parentElement.innerHTML = '👤';
                            }}
                          />
                        ) : (
                          '👤'
                        )}
                      </span>
                      <div>
                        <strong>{user.usuario}</strong>
                        <div className={styles.userDetails}>
                          <span>📧 {user.email}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={styles.pointsCell}>
                    <div className={styles.pointsDisplay}>
                      <strong className={styles.pointsValue}>
                        {(user.puntosAcumulados || 0).toLocaleString()} pts
                      </strong>
                      {puntosSiguiente > 0 && (
                        <div className={styles.pointsInfo}>
                          <span className={styles.pointsDetail}>
                            🎯 Faltan {puntosSiguiente} pts para {nivel === 'Bronce' ? 'Plata' : nivel === 'Plata' ? 'Oro' : 'Diamante'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className={styles.pointsActions}>
                      <button
                        type="button"
                        onClick={() => openPointsModal(user.id, 'add')}
                        className={styles.pointsBtn}
                        title="Agregar puntos"
                      >
                        ➕
                      </button>
                      <button
                        type="button"
                        onClick={() => openPointsModal(user.id, 'remove')}
                        className={styles.pointsBtn}
                        title="Remover puntos"
                      >
                        ➖
                      </button>
                    </div>
                  </td>
                  <td>
                    <span
                      className={styles.levelBadge}
                      style={{ backgroundColor: getNivelColor(nivel) }}
                    >
                      {nivel}
                    </span>
                    <div className={styles.levelProgress}>
                      <div
                        className={styles.progressBar}
                        style={{
                          width: `${Math.min(progreso, 100)}%`,
                          backgroundColor: getNivelColor(nivel)
                        }}
                      ></div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={styles.statusBadge}
                      style={{ backgroundColor: getStatusColor(user.activo === 1 ? 'activo' : 'inactivo') }}
                    >
                      {user.activo === 1 ? 'activo' : 'inactivo'}
                    </span>
                  </td>
                  <td className={styles.dateCell}>
                    {user.fecha_registro ? new Date(user.fecha_registro).toLocaleDateString() : 'No registrada'}
                  </td>
                  <td className={styles.actionsCell}>
                    <button
                      type="button"
                      onClick={() => handleViewUser(user)}
                      className={`${styles.actionBtn} ${styles.viewBtn}`}
                      title="Ver detalles"
                    >
                      👁️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(user.id)}
                      className={`${styles.actionBtn} ${user.activo === 1 ? styles.deactivateBtn : styles.activateBtn}`}
                      title={user.activo === 1 ? 'Suspender' : 'Activar'}
                    >
                      {user.activo === 1 ? '⏸️' : '▶️'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(user.id)}
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      title="Eliminar"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className={styles.usersContainer}>
      <h1 className={styles.pageTitle}>👥 Gestión de Usuarios LabPoints</h1>

      <div className={styles.statsGrid}>
        <div className={styles.statCardLarge}>
          <div className={styles.statIcon}>👥</div>
          <div className={styles.statContent}>
            <h3>Total Usuarios</h3>
            <p className={styles.statNumber}>{estadisticas.totalUsuarios}</p>
            <p className={styles.statDetail}>
              {estadisticas.usuariosActivos} activos • {estadisticas.totalUsuarios - estadisticas.usuariosActivos} inactivos
            </p>
          </div>
        </div>

        <div className={styles.statCardLarge}>
          <div className={styles.statIcon}>⭐</div>
          <div className={styles.statContent}>
            <h3>Puntos Totales</h3>
            <p className={styles.statNumber}>{estadisticas.puntosTotales.toLocaleString()}</p>
            <p className={styles.statDetail}>
              Promedio: {Math.round(estadisticas.promedioPuntos).toLocaleString()} pts/usuario
            </p>
          </div>
        </div>

        <div className={styles.statCardLarge}>
          <div className={styles.statIcon}>🏆</div>
          <div className={styles.statContent}>
            <h3>Distribución por Nivel</h3>
            <div className={styles.levelsDistribution}>
              <span style={{ color: '#a78bfa' }}>💎 Diamante: {estadisticas.niveles.Diamante}</span>
              <span style={{ color: '#fbbf24' }}>🥇 Oro: {estadisticas.niveles.Oro}</span>
              <span style={{ color: '#d1d5db' }}>🥈 Plata: {estadisticas.niveles.Plata}</span>
              <span style={{ color: '#f97316' }}>🥉 Bronce: {estadisticas.niveles.Bronce}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.filtersSection}>
        <h3>🔍 Buscar y Filtrar Usuarios</h3>

        <div className={styles.filtersGrid}>
          <div className={styles.filterGroup}>
            <label>Buscar por nombre de usuario o email</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.filterInput}
              placeholder="Ej: usuario123, email@ejemplo.com..."
            />
          </div>

          <div className={styles.filterGroup}>
            <label>Filtrar por nivel</label>
            <select
              value={nivelFilter}
              onChange={(e) => setNivelFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">Todos los niveles</option>
              <option value="Diamante">💎 Diamante</option>
              <option value="Oro">🥇 Oro</option>
              <option value="Plata">🥈 Plata</option>
              <option value="Bronce">🥉 Bronce</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label>Filtrar por estado</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">Todos los estados</option>
              <option value="activo">✅ Activo</option>
              <option value="inactivo">⏸️ Inactivo</option>
            </select>
          </div>
        </div>

        <div className={styles.filterActions}>
          <div className={styles.filterInfo}>
            Mostrando {filteredAndSortedUsers.length} de {usuarios.length} usuarios
          </div>
          <div className={styles.filterButtons}>
            <button onClick={handleResetFilters} className={`${styles.btn} ${styles.btnOutline}`}>
              🧹 Limpiar filtros
            </button>
            <button onClick={handleExportData} className={`${styles.btn} ${styles.btnSecondary}`}>
              📋 Exportar datos
            </button>
          </div>
        </div>
      </div>

      <div >
        <div className={styles.tableHeader}>
          <h3>📋 Lista de Usuarios Registrados</h3>
          <div className={styles.tableStats}>
            <span>Ordenado por: <strong>{sortField === 'puntosAcumulados' ? 'puntos' : sortField}</strong> ({sortDirection})</span>
          </div>
        </div>

        <UsersTable />

        <div className={styles.tableFooter}>
          <p className={styles.tableNote}>
            💡 Usa ➕/➖ para ajustar puntos manualmente. Click en encabezados para ordenar.
          </p>
        </div>
      </div>

      <UserModal
        showUserModal={showUserModal}
        selectedUser={selectedUser}
        setShowUserModal={setShowUserModal}
        handleToggleStatus={handleToggleStatus}
        handleDeleteUser={handleDeleteUser}
        setSelectedUserId={setSelectedUserId}
        setPointsAction={setPointsAction}
        setPointsInput={setPointsInput}
        setShowPointsModal={setShowPointsModal}
        getNivelColor={getNivelColor}
        getStatusColor={getStatusColor}
        calcularNivel={calcularNivel}
        calcularPuntosSiguienteNivel={calcularPuntosSiguienteNivel}
      />

      <PointsModal
        showPointsModal={showPointsModal}
        pointsInput={pointsInput}
        setPointsInput={setPointsInput}
        pointsAction={pointsAction}
        setShowPointsModal={setShowPointsModal}
        processPoints={processPoints}
      />
    </div>
  );
}