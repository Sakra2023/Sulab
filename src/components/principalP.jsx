import Layout from './Layout';
import styles from "../assets/css/principal.module.css"
import { useState, useEffect, useRef } from 'react';

import whatsapp from "../../src/assets/img/whatsapp.png"
import tiktok from "../../src/assets/img/tiktok.png"
import instagram from "../../src/assets/img/instagram.png"
import LogoImagen from "../../src/assets/img/perrrr.png"


import { FaPlane, FaMobileAlt, FaTv, FaGamepad } from 'react-icons/fa';

export default function Principal() {
  // ✅ Usar rutas relativas - el proxy de Nginx manejará la redirección
  const API_URL = ''; // Vacío para usar rutas relativas

  // Datos vacíos - se llenarán desde API
  const [topUsuarios, setTopUsuarios] = useState([]);
  const [premiosDestacados, setPremiosDestacados] = useState([]);
  const [emprendimientos, setEmprendimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [ganadorActual, setGanadorActual] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [currentGroup, setCurrentGroup] = useState(0);
  const [autoPlayEmprendimientos, setAutoPlayEmprendimientos] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const carruselRef = useRef(null);
  const socketRef = useRef(null);

  // ============================================
  // FUNCIÓN PARA OBTENER URL COMPLETA DE IMAGEN
  // ============================================
  const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    const cleanPath = imagePath.replace(/^\/+/, '');
    // ✅ Usar ruta relativa para imágenes estáticas
    return `/${cleanPath}`;
  };

  // ============================================
  // FUNCIÓN PARA OBTENER TOKEN
  // ============================================
  const getToken = () => {
    const token = localStorage.getItem('token') ||
      sessionStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      sessionStorage.getItem('authToken');

    if (!token) {
      console.log('⚠️ No se encontró token de autenticación, conectando como anónimo');
      return null;
    }

    return token.replace(/^["']|["']$/g, '').trim();
  };

  // ============================================
  // FUNCIÓN PARA OBTENER RANKING DESDE API
  // ============================================
  const fetchRanking = async () => {
    try {
      // ✅ Usar ruta relativa
      const response = await fetch('/api/principalP', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('No se pudo cargar el ranking');
        } else {
          setError(`Error ${response.status}: ${response.statusText}`);
        }
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.success && data.ranking) {
        const usuariosFormateados = data.ranking.map(usuario => ({
          id: usuario.id,
          nombre: usuario.nombre,
          puntos: usuario.puntos,
          nivel: usuario.nivel,
          foto: usuario.foto || '👤',
          premio: obtenerPremioPorNivel(usuario.nivel),
          fecha: obtenerFechaActual()
        }));

        setTopUsuarios(usuariosFormateados);
        setError(null);
      } else {
        setError(data.message || 'Error al cargar el ranking');
      }
    } catch (error) {
      console.error('Error fetching ranking:', error);
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // FUNCIÓN PARA OBTENER PREMIOS DESDE API PÚBLICA (ACTUALIZADA CON STOCK Y FECHAS)
  // ============================================
  const fetchPremios = async () => {
    try {
      // ✅ Usar ruta relativa
      const response = await fetch('/api/premios/public', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Error fetching premios:', response.status);
        return;
      }

      const data = await response.json();

      if (data.success && data.premios) {
        const premiosFormateados = data.premios.slice(0, 4).map(premio => ({
          id: premio.id,
          titulo: premio.titulo,
          categoria: premio.categoria,
          descripcion: premio.descripcion,
          puntos: premio.puntos || 0,
          imagen: premio.imagen,
          stock: premio.stock || 0,
          vecesCanjeado: premio.vecesCanjeado || 0,
          fechaRegistro: premio.fechaRegistro,
          fechaVencimiento: premio.fechaVencimiento,
          icono: obtenerIconoPorCategoria(premio.categoria)
        }));
        setPremiosDestacados(premiosFormateados);
      }
    } catch (error) {
      console.error('Error fetching premios:', error);
    }
  };

  // ============================================
  // FUNCIÓN PARA OBTENER EMPRENDIMIENTOS DESDE API PÚBLICA (CON LOGO_IMAGEN, CIUDAD Y REDES SOCIALES)
  // ============================================
  const fetchEmprendimientos = async () => {
    try {
      // ✅ Usar ruta relativa
      const response = await fetch('/api/emprendimientos/public', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Error fetching emprendimientos:', response.status);
        return;
      }

      const data = await response.json();

      if (data.success && data.emprendimientos) {
        const emprendimientosFormateados = data.emprendimientos.map(emp => ({
          id: emp.id,
          nombre: emp.nombre,
          categoria: emp.categoria,
          direccion: emp.direccion,
          ciudad: emp.ciudad || 'Sin ciudad',
          horario: emp.horario || 'Consultar',
          logo_imagen: emp.logo_imagen || null,
          whatsapp: emp.whatsapp || null,
          instagram: emp.instagram || null,
          tiktok: emp.tiktok || null,
          icono: obtenerIconoPorCategoriaEmprendimiento(emp.categoria)
        }));
        setEmprendimientos(emprendimientosFormateados);
      }
    } catch (error) {
      console.error('Error fetching emprendimientos:', error);
    }
  };

  // ============================================
  // FUNCIONES AUXILIARES
  // ============================================
  const obtenerPremioPorNivel = (nivel) => {
    switch (nivel) {
      case 'Diamante': return 'Viaje Todo Pagado';
      case 'Oro': return 'Smart TV 55"';
      case 'Plata': return 'Smartphone Gama Media';
      default: return 'Auriculares Inalámbricos';
    }
  };

  const obtenerFechaActual = () => {
    const fecha = new Date();
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${fecha.getDate()} de ${meses[fecha.getMonth()]} de ${fecha.getFullYear()}`;
  };

  const obtenerIconoPorCategoria = (categoria) => {
    const categoriaLower = categoria?.toLowerCase() || '';
    if (categoriaLower.includes('viaje') || categoriaLower.includes('experiencia')) return <FaPlane size={32} />;
    if (categoriaLower.includes('telefono') || categoriaLower.includes('movil')) return <FaMobileAlt size={32} />;
    if (categoriaLower.includes('tv') || categoriaLower.includes('televisor')) return <FaTv size={32} />;
    if (categoriaLower.includes('juego') || categoriaLower.includes('consola')) return <FaGamepad size={32} />;
    return <FaTv size={32} />;
  };

  const obtenerIconoPorCategoriaEmprendimiento = (categoria) => {
    const categoriaLower = categoria?.toLowerCase() || '';
    if (categoriaLower.includes('tecnologia') || categoriaLower.includes('tech')) return '💻';
    if (categoriaLower.includes('moda')) return '👗';
    if (categoriaLower.includes('restaurante') || categoriaLower.includes('gastronomia')) return '🍽️';
    if (categoriaLower.includes('salud') || categoriaLower.includes('gimnasio')) return '💪';
    if (categoriaLower.includes('libro') || categoriaLower.includes('cultura')) return '📚';
    if (categoriaLower.includes('hogar') || categoriaLower.includes('ferreteria')) return '🔧';
    return '🏪';
  };

  // ============================================
  // SOCKET.IO PARA ACTUALIZACIONES EN TIEMPO REAL
  // ============================================
  useEffect(() => {
    const connectSocket = async () => {
      try {
        const io = (await import('socket.io-client')).default;
        const token = getToken();

        const socketConfig = {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          auth: {
            token: token || ''
          }
        };

        // ✅ Socket se conecta al mismo origen (usando ruta relativa)
        socketRef.current = io('/', socketConfig);

        socketRef.current.on('connect', () => {
          if (token) {
            console.log('✅ Conectado al servidor de ranking con autenticación');
          } else {
            console.log('✅ Conectado al servidor de ranking como anónimo');
          }
        });

        socketRef.current.on('ranking-actualizado', (data) => {
          console.log('📊 Ranking actualizado en tiempo real');
          if (data.success && data.ranking) {
            const usuariosFormateados = data.ranking.map(usuario => ({
              id: usuario.id,
              nombre: usuario.nombre,
              puntos: usuario.puntos,
              nivel: usuario.nivel,
              foto: usuario.foto || '👤',
              premio: obtenerPremioPorNivel(usuario.nivel),
              fecha: obtenerFechaActual()
            }));
            setTopUsuarios(usuariosFormateados);
          }
        });

        // ✅ NUEVO: Escuchar actualizaciones de stock en tiempo real
        socketRef.current.on('stock-actualizado', (data) => {
          console.log('📦 Stock actualizado:', data);
          if (data.success) {
            setPremiosDestacados(prevPremios =>
              prevPremios.map(premio =>
                premio.id === data.premioId
                  ? { ...premio, stock: data.nuevoStock, vecesCanjeado: data.vecesCanjeado }
                  : premio
              )
            );
          }
        });

        socketRef.current.on('connect_error', (error) => {
          console.error('Error de conexión socket:', error.message);
        });

        socketRef.current.on('disconnect', (reason) => {
          console.log('❌ Desconectado del servidor:', reason);
        });

      } catch (error) {
        console.error('Error inicializando socket:', error);
      }
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // ============================================
  // EFECTO PARA CARGAR DATOS INICIALES
  // ============================================
  useEffect(() => {
    const cargarDatos = async () => {
      setLoading(true);
      await Promise.all([
        fetchRanking(),
        fetchPremios(),
        fetchEmprendimientos()
      ]);
      setLoading(false);
    };

    cargarDatos();
  }, []);

  // Detectar si es móvil
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Desactivar autoplay de emprendimientos en móvil
  useEffect(() => {
    if (isMobile) {
      setAutoPlayEmprendimientos(false);
    }
  }, [isMobile]);

  // Calcular grupos de 3 emprendimientos (solo para desktop)
  const grupos = [];
  for (let i = 0; i < emprendimientos.length; i += 3) {
    grupos.push(emprendimientos.slice(i, i + 3));
  }

  const siguienteGanador = () => {
    if (topUsuarios.length === 0) return;
    setGanadorActual((prev) => (prev + 1) % topUsuarios.length);
  };

  const anteriorGanador = () => {
    if (topUsuarios.length === 0) return;
    setGanadorActual((prev) => (prev - 1 + topUsuarios.length) % topUsuarios.length);
  };

  const avanzarEmprendimientos = () => {
    if (grupos.length === 0) return;
    setCurrentGroup((prev) => (prev + 1) % grupos.length);
  };

  const retrocederEmprendimientos = () => {
    if (grupos.length === 0) return;
    setCurrentGroup((prev) => (prev - 1 + grupos.length) % grupos.length);
  };

  // Efecto para cambio automático cada 5 segundos (ganadores)
  useEffect(() => {
    let intervalo;

    if (autoPlay && topUsuarios.length > 0) {
      intervalo = setInterval(() => {
        siguienteGanador();
      }, 5000);
    }

    return () => {
      if (intervalo) clearInterval(intervalo);
    };
  }, [autoPlay, ganadorActual, topUsuarios.length]);

  // Efecto para auto-play de emprendimientos (solo en desktop)
  useEffect(() => {
    let intervalo;

    if (autoPlayEmprendimientos && !isMobile && grupos.length > 0) {
      intervalo = setInterval(() => {
        avanzarEmprendimientos();
      }, 4000);
    }

    return () => {
      if (intervalo) clearInterval(intervalo);
    };
  }, [autoPlayEmprendimientos, isMobile, grupos.length]);

  const manejarInteraccionUsuario = (nuevoIndice) => {
    setAutoPlay(false);
    setGanadorActual(nuevoIndice);
    setTimeout(() => setAutoPlay(true), 10000);
  };

  const manejarInteraccionEmprendimientos = (direccion) => {
    if (isMobile) return;
    setAutoPlayEmprendimientos(false);
    if (direccion === 'adelante') {
      avanzarEmprendimientos();
    } else {
      retrocederEmprendimientos();
    }
    setTimeout(() => setAutoPlayEmprendimientos(true), 10000);
  };

  const manejarIndicadorClick = (index) => {
    if (isMobile) return;
    setAutoPlayEmprendimientos(false);
    setCurrentGroup(index);
    setTimeout(() => setAutoPlayEmprendimientos(true), 10000);
  };

  // ✅ FUNCIÓN CORREGIDA: Renderiza imagen o emoji según logo_imagen CON BOTONES DE REDES SOCIALES
  const renderEmprendimientoCard = (emprendimiento) => (
    <div key={emprendimiento.id} className={styles.emprendimientoCardHorizontal}>
      <div className={styles.emprendimientoIconoHorizontal}>
        {emprendimiento.logo_imagen ? (
          <img
            src={getImageUrl(emprendimiento.logo_imagen)}
            alt={emprendimiento.nombre}
            className={styles.emprendimientoImagen}
            onError={(e) => {
              e.target.style.display = 'none';
              if (e.target.nextSibling) {
                e.target.nextSibling.style.display = 'flex';
              }
            }}
          />
        ) : (
          <span className={styles.iconoHorizontal}>{emprendimiento.icono}</span>
        )}
      </div>

      <div className={styles.emprendimientoInfoHorizontal}>
        <h3 className={styles.emprendimientoNombreHorizontal}>{emprendimiento.nombre}</h3>
        <span className={styles.emprendimientoCategoriaHorizontal}>{emprendimiento.categoria}</span>

        <div className={styles.emprendimientoDetallesHorizontal}>
          <div className={styles.detalleHorizontal}>
            <span className={styles.detalleIconoHorizontal}>📍</span>
            <p className={styles.detalleTextoHorizontal}>{emprendimiento.direccion}</p>
          </div>

          {/* ✅ CAMBIO: Ahora muestra la ciudad en lugar del teléfono */}
          <div className={styles.detalleHorizontal}>
            <span className={styles.detalleIconoHorizontal}>🏙️</span>
            <p className={styles.detalleTextoHorizontal}>{emprendimiento.ciudad}</p>
          </div>

          <div className={styles.detalleHorizontal}>
            <span className={styles.detalleIconoHorizontal}>⏰</span>
            <p className={styles.detalleTextoHorizontal}>{emprendimiento.horario}</p>
          </div>
        </div>

        {/* ✅ NUEVO: Botones de Redes Sociales */}
        {(emprendimiento.whatsapp || emprendimiento.instagram || emprendimiento.tiktok) && (
          <div className={styles.redesSocialesContainer}>
            {emprendimiento.whatsapp && (
              <a
                href={emprendimiento.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialBtnWhatsapp}
                title="WhatsApp"
              >
                <img className={styles.redes} src={whatsapp} alt="logo whatsapp" />
                WhatsApp
              </a>
            )}
            {emprendimiento.instagram && (
              <a
                href={emprendimiento.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialBtnInstagram}
                title="Instagram"
              >
                <img className={styles.redes} src={instagram} alt="logo de instagram" />
                Instagram
              </a>
            )}
            {emprendimiento.tiktok && (
              <a
                href={emprendimiento.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialBtnTiktok}
                title="TikTok"
              >
                <img className={styles.redes} src={tiktok} alt="logo Tiktok" />
                TikTok
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ✅ Componente CORREGIDO para renderizar foto de usuario (acepta rutas relativas)
  const renderUserPhoto = (foto, nombre) => {
    if (!foto) return <span className={styles.avatarEmoji}>👤</span>;

    const imageUrl = getImageUrl(foto);

    if (imageUrl) {
      return (
        <img
          src={imageUrl}
          alt={nombre}
          className={styles.avatarImage}
          onError={(e) => {
            e.target.style.display = 'none';
            if (e.target.nextSibling) {
              e.target.nextSibling.style.display = 'flex';
            }
          }}
        />
      );
    }

    return <span className={styles.avatarEmoji}>👤</span>;
  };

  // Componente para renderizar imagen del premio
  const renderPremioImage = (imagen, titulo) => {
    if (!imagen) return null;

    const imageUrl = getImageUrl(imagen);
    if (!imageUrl) return null;

    return (
      <img
        src={imageUrl}
        alt={titulo}
        className={styles.premioImagen}
        onError={(e) => {
          e.target.style.display = 'none';
        }}
      />
    );
  };

  if (loading) {
    return (
      <Layout>
        <div className={styles.containerPrincipal}>
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <div className={styles.spinner}></div>
            <p>Cargando datos...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error && topUsuarios.length === 0) {
    return (
      <Layout>
        <div className={styles.containerPrincipal}>
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <p style={{ color: 'red' }}>{error}</p>
            <button onClick={fetchRanking} style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}>
              Reintentar
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={styles.containerPrincipal}>
        {/* Sección principal */}
        <div className={styles.conta1}>
          <div className={styles.box1}>
            <div className={styles.box11}>
              <h1 className={styles.titu}>Compra, Acumula, Gana.</h1>
            </div>
            <div className={styles.box12}>
              <p className={styles.parra}>
                LabPoints: tu forma de convertir cada compra en ahorro y experiencias exclusivas.
                Canjea como quieras y cuando quieras.
              </p>
              <p className={styles.parra}>
                Colecciona. Canjea. Disfruta. Cada visita suma, y cada punto abre nuevas posibilidades.
              </p>
            </div>
          </div>
          <div className={styles.box2}>
            <div className={styles.imagenPlaceholder}>
              {/*  <p className={styles.imagenTexto}>LabPoints App</p> */}
              <img src={LogoImagen} alt="" />

            </div>
          </div>
        </div>

        {/* SECCIÓN DE PREMIOS DESTACADOS */}
        {premiosDestacados.length > 0 && (
          <section className={styles.destacadosSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>🏆 Premios Destacados</h2>
              <p className={styles.sectionSubtitle}>
                Los premios más populares entre nuestra comunidad
              </p>
            </div>

            <div className={styles.premiosGrid}>
              {premiosDestacados.map((premio) => (
                <div key={premio.id} className={styles.premioCard}>
                  <div className={styles.premioHeader}>
                    <div className={styles.premioIcon}>
                      {premio.imagen ? renderPremioImage(premio.imagen, premio.titulo) : premio.icono}
                    </div>
                    <div className={styles.premioInfo}>
                      <h3 className={styles.premioNombre}>{premio.titulo}</h3>
                      <span className={styles.premioCategoria}>{premio.categoria}</span>
                    </div>
                  </div>
                  <p className={styles.premioDescripcion}>{premio.descripcion}</p>

                  {/* ✅ NUEVO: Mostrar stock y veces canjeado */}
                  <div className={styles.premioStockInfo}>
                    <div className={styles.stockItem}>
                      <span className={styles.stockLabel}>📦 Stock disponible:</span>
                      <span className={`${styles.stockValue} ${premio.stock <= 0 ? styles.stockAgotado : ''}`}>
                        {premio.stock > 0 ? premio.stock : 'Agotado'}
                      </span>
                    </div>
                    <div className={styles.stockItem}>
                      <span className={styles.stockLabel}>🔄 Veces canjeado:</span>
                      <span className={styles.stockValue}>{premio.vecesCanjeado}</span>
                    </div>
                  </div>

                  {/* ✅ NUEVO: Mostrar fechas de registro y vencimiento */}
                  <div className={styles.premioFechasInfo}>
                    {premio.fechaRegistro && (
                      <div className={styles.fechaItem}>
                        <span className={styles.fechaLabel}>📅 Registrado:</span>
                        <span className={styles.fechaValue}>{premio.fechaRegistro}</span>
                      </div>
                    )}
                    {premio.fechaVencimiento && (
                      <div className={styles.fechaItem}>
                        <span className={styles.fechaLabel}>⚠️ Vence:</span>
                        <span className={`${styles.fechaValue} ${styles.fechaVencimiento}`}>
                          {premio.fechaVencimiento}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className={styles.premioPuntos}>
                    <span className={styles.puntosLabel}>Puntos necesarios:</span>
                    <span className={styles.puntosValor}>
                      {(premio.puntos || 0).toLocaleString()} LP
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sección: Cómo funciona - CORREGIDO ✅ */}
        <section className={styles.comoFuncionaSection}>
          <div className={styles.comoFuncionaHeader}>
            <h2 className={styles.comoFuncionaTitulo}>⚡ ¿Cómo funciona LabPoints?</h2>
            <p className={styles.comoFuncionaSubtitulo}>Simple, justo y rentable - Así ganas y ahorras</p>
          </div>

          <div className={styles.comoFuncionaGrid}>
            <div className={styles.pasoCard}>
              <div className={styles.pasoNumero}>1</div>
              <div className={styles.pasoIcono}>🛒</div>
              <h3 className={styles.pasoTitulo}>Compra</h3>
              <p className={styles.pasoDescripcion}>
                Realiza compras en cualquiera de nuestros emprendimientos afiliados
              </p>
            </div>

            <div className={styles.pasoCard}>
              <div className={styles.pasoNumero}>2</div>
              <div className={styles.pasoIcono}>📊</div>
              <h3 className={styles.pasoTitulo}>Acumula</h3>
              <p className={styles.pasoDescripcion}>
                <strong>10 LabPoints = $1 gastado</strong><br />
                Ejemplo: $30 de compra = 300 puntos
              </p>
            </div>

            <div className={styles.pasoCard}>
              <div className={styles.pasoNumero}>3</div>
              <div className={styles.pasoIcono}>🎯</div>
              <h3 className={styles.pasoTitulo}>Canjea</h3>
              <p className={styles.pasoDescripcion}>
                <strong>200 LabPoints = $1 de descuento</strong><br />
                Canjea como quieras y cuando quieras
              </p>
            </div>

            <div className={styles.pasoCard}>
              <div className={styles.pasoNumero}>4</div>
              <div className={styles.pasoIcono}>🚀</div>
              <h3 className={styles.pasoTitulo}>Multiplica</h3>
              <p className={styles.pasoDescripcion}>
                Participa en promociones especiales con <strong>multiplicadores de puntos</strong>
              </p>
            </div>
          </div>
        </section>

        {/* Sección de Emprendimientos */}
        {emprendimientos.length > 0 && (
          <section className={styles.emprendimientosSection}>
            <div className={styles.emprendimientosHeader}>
              <h2 className={styles.emprendimientosTitulo}>📍 Nuestros Emprendimientos</h2>
              <p className={styles.emprendimientosSubtitulo}>
                Descubre donde puedes acumular LabPoints
                {!isMobile && (
                  <span className={styles.autoPlayInfo}>
                    {autoPlayEmprendimientos ? " 🔄 Auto-play activado" : " ⏸️ Auto-play pausado"}
                  </span>
                )}
              </p>
            </div>

            <div className={styles.carruselHorizontalContainer}>
              {!isMobile && grupos.length > 1 && (
                <button
                  className={styles.carruselHorizontalBtn}
                  onClick={() => manejarInteraccionEmprendimientos('atras')}
                  aria-label="Grupo anterior"
                >
                  ‹
                </button>
              )}

              <div className={styles.carruselHorizontalWrapper}>
                {isMobile ? (
                  <div className={styles.mobileCarruselTrack}>
                    {emprendimientos.map((emprendimiento) => renderEmprendimientoCard(emprendimiento))}
                  </div>
                ) : (
                  <div
                    className={styles.carruselHorizontalTrack}
                    style={{ transform: `translateX(-${currentGroup * 100}%)` }}
                    ref={carruselRef}
                  >
                    {grupos.map((grupo, grupoIndex) => (
                      <div key={grupoIndex} className={styles.grupoEmprendimientos}>
                        <div className={styles.tripleCardContainer}>
                          {grupo.map((emprendimiento) => renderEmprendimientoCard(emprendimiento))}
                          {grupo.length < 3 && Array.from({ length: 3 - grupo.length }).map((_, index) => (
                            <div key={`empty-${index}`} className={styles.emptyCard}></div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!isMobile && grupos.length > 1 && (
                <button
                  className={styles.carruselHorizontalBtn}
                  onClick={() => manejarInteraccionEmprendimientos('adelante')}
                  aria-label="Siguiente grupo"
                >
                  ›
                </button>
              )}
            </div>

            {!isMobile && grupos.length > 1 && (
              <div className={styles.carruselHorizontalControles}>
                <button
                  className={styles.controlBtnHorizontal}
                  onClick={() => setAutoPlayEmprendimientos(!autoPlayEmprendimientos)}
                >
                  {autoPlayEmprendimientos ? '⏸️ Pausar' : '▶️ Reanudar'}
                </button>

                <div className={styles.carruselHorizontalIndicadores}>
                  {grupos.map((_, index) => (
                    <button
                      key={index}
                      className={`${styles.indicadorHorizontal} ${currentGroup === index ? styles.indicadorHorizontalActivo : ''
                        }`}
                      onClick={() => manejarIndicadorClick(index)}
                      aria-label={`Ir a grupo ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Sección de Ranking - CORREGIDA */}
        {topUsuarios.length > 0 && (
          <section className={styles.rankingSection}>
            <div className={styles.rankingHeader}>
              <h2 className={styles.rankingTitulo}>🏆 Top LabPoints</h2>
              <p className={styles.rankingSubtitulo}>Los usuarios con más puntos acumulados</p>
            </div>

            <div className={styles.rankingContainer}>
              <table className={styles.rankingTable}>
                <thead>
                  <tr>
                    <th>Posición</th>
                    <th>Usuario</th>
                    <th>Puntos</th>
                    <th>Nivel</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsuarios.map((usuario, index) => (
                    <tr key={usuario.id}>
                      <td className={styles.posicion}>
                        <span className={styles.badge}>{index + 1}</span>
                      </td>
                      <td className={styles.nombreUsuario}>
                        <div className={styles.usuarioInfo}>
                          <div className={styles.usuarioFoto}>
                            {renderUserPhoto(usuario.foto, usuario.nombre)}
                          </div>
                          <span className={styles.usuarioNombre}>{usuario.nombre}</span>
                        </div>
                      </td>
                      <td className={styles.puntos}>
                        <strong>{usuario.puntos.toLocaleString()}</strong> <small>pts</small>
                      </td>
                      {/* CORREGIDO: span correctamente dentro de td */}
                      <td className={styles.nivelCell}>
                        <span className={styles.nivel}>
                          {usuario.nivel === 'Diamante' ? '💎 Diamante' :
                            usuario.nivel === 'Oro' ? '🥇 Oro' :
                              usuario.nivel === 'Plata' ? '🥈 Plata' : '🥉 Bronce'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.rankingFooter}>
              <p className={styles.rankingNota}>
                * El ranking se actualiza en tiempo real. ¡Acumula puntos y aparecerás aquí!
              </p>
            </div>
          </section>
        )}

    
        {/* FOOTER */}
        <footer className={styles.footer}>
          <div className={styles.footerContainer}>
            <div className={styles.footerCol}>
              <h3 className={styles.footerLogo}>LabPoints</h3>
              <p className={styles.footerDesc}>
                Convierte cada compra en ahorro y experiencias exclusivas.
              </p>
              <div className={styles.socialLinks}>
                <a
                  href="https://www.instagram.com/sulab.2023/?hl=en"
                  aria-label="Instagram"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img className={styles.redes} src={instagram} alt="logo de instagram" />
                </a>
                <a
                  href="https://www.tiktok.com/@sulab.2023"
                  aria-label="TikTok"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img className={styles.redes} src={tiktok} alt="logo de tiktok" />
                </a>
              </div>
            </div>

            <div className={styles.footerCol}>
              <h4>Enlaces útiles</h4>
              <ul>
                <li><a href="#">Términos y condiciones</a></li>
                <li><a href="#">Política de privacidad</a></li>
              </ul>
            </div>

            <div className={styles.footerCol}>
              <h4>Contacto</h4>
              <ul>
                <li>📧 soporte@gmail.com</li>
                <li>📞 +593 992852633</li>
                <li>📍 Ciudad, Azogues</li>
              </ul>
            </div>
          </div>

          <div className={styles.footerBottom}>
            <p>© {new Date().getFullYear()} LabPoints - Todos los derechos reservados</p>
          </div>
        </footer>
      </div>
    </Layout>
  );
}