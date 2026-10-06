// components/Nosotros.jsx
import Layout from './Layout';
import styles from "../assets/css/nosotros.module.css"
import { FaMoneyBillWave, FaGift, FaTag, FaStore, FaPlane, FaMobileAlt, FaTv, FaGamepad, FaClock } from 'react-icons/fa';

export default function Nosotros() {
  // Tipos de canje disponibles
  const tiposCanje = [
    {
      id: 1,
      icono: <FaMoneyBillWave />,
      titulo: "Canje por Dinero",
      descripcion: "Convierte tus puntos en descuentos directos en efectivo",
      ejemplos: [
        "100 puntos = $1 de descuento",
        "500 puntos = $5 en tu próxima compra",
        "1000 puntos = $10 para gastar como quieras"
      ],
      color: "#4fd1c7"
    },
    {
      id: 2,
      icono: <FaGift />,
      titulo: "Canje por Productos",
      descripcion: "Obtén productos exclusivos con tus puntos acumulados",
      ejemplos: [
        "Electrónica: Audífonos, parlantes",
        "Hogar: Electrodomésticos pequeños",
        "Moda: Ropa y accesorios de temporada"
      ],
      color: "#10b981"
    },
    {
      id: 3,
      icono: <FaTag />,
      titulo: "Descuentos Especiales",
      descripcion: "Accede a descuentos exclusivos en tiendas afiliadas",
      ejemplos: [
        "20% de descuento en restaurantes",
        "2x1 en entradas de cine",
        "Descuento progresivo según puntos"
      ],
      color: "#8b5cf6"
    }
  ];

  // Premios destacados
  const premiosDestacados = [
    {
      id: 1,
      icono: <FaPlane />,
      titulo: "Viajes y Experiencias",
      puntos: 25000,
      descripcion: "Viaje todo incluido a destinos nacionales",
      categoria: "Experiencia Premium"
    },
    {
      id: 2,
      icono: <FaMobileAlt />,
      titulo: "Smartphone de Última Generación",
      puntos: 18000,
      descripcion: "Teléfono flagship del año",
      categoria: "Electrónica"
    },
    {
      id: 3,
      icono: <FaTv />,
      titulo: "TV 4K 55 Pulgadas",
      puntos: 15000,
      descripcion: "Televisor inteligente con todas las apps",
      categoria: "Entretenimiento"
    },
    {
      id: 4,
      icono: <FaGamepad />,
      titulo: "Consola de Videojuegos",
      puntos: 12000,
      descripcion: "Consola + 2 juegos incluidos",
      categoria: "Gaming"
    }
  ];

  // Tiendas afiliadas destacadas
  const tiendasAfiliadas = [
    {
      id: 1,
      nombre: "Supermercado Mega",
      categoria: "Supermercado",
      descuentos: "2x en puntos los fines de semana",
      icono: "🛒"
    },
    {
      id: 2,
      nombre: "TechWorld",
      categoria: "Electrónica",
      descuentos: "10% extra al canjear puntos",
      icono: "💻"
    },
    {
      id: 3,
      nombre: "Moda Express",
      categoria: "Ropa",
      descuentos: "Puntos dobles en temporada",
      icono: "👕"
    },
    {
      id: 4,
      nombre: "Café Central",
      categoria: "Restaurante",
      descuentos: "Bebida gratis cada 500 puntos",
      icono: "☕"
    },
    {
      id: 5,
      nombre: "Cinepolis Premium",
      categoria: "Entretenimiento",
      descuentos: "2x1 en entradas",
      icono: "🎬"
    },
    {
      id: 6,
      nombre: "Gimnasio Power",
      categoria: "Deportes",
      descuentos: "1 mes gratis al canjear",
      icono: "🏋️"
    }
  ];

  return (
    <Layout>
      <div className={styles.containerPrincipal}>
        {/* Sección Hero */}
        <div className={styles.heroSection}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              Más que puntos, <span className={styles.heroHighlight}>experiencias únicas</span>
            </h1>
            <p className={styles.heroSubtitle}>
              En LabPoints transformamos tus compras diarias en premios increíbles,
              descuentos exclusivos y oportunidades especiales.
            </p>
            <div className={styles.heroStats}>
              <div className={styles.statItem}>
                <span className={styles.statNumber}>100+</span>
                <span className={styles.statLabel}>Tiendas Afiliadas</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statNumber}>50K+</span>
                <span className={styles.statLabel}>Usuarios Activos</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statNumber}>$500K+</span>
                <span className={styles.statLabel}>En Premios Entregados</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sección: ¿Qué puedes ganar? */}
        <section className={styles.premiosSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>🎁 ¿Qué puedes ganar con LabPoints?</h2>
            <p className={styles.sectionSubtitle}>
              Tres formas flexibles de disfrutar tus puntos acumulados
            </p>
          </div>

          <div className={styles.tiposCanjeGrid}>
            {tiposCanje.map((tipo) => (
              <div key={tipo.id} className={styles.canjeCard} style={{ borderTopColor: tipo.color }}>
                <div className={styles.canjeIcon} style={{ color: tipo.color }}>
                  {tipo.icono}
                </div>
                <h3 className={styles.canjeTitle}>{tipo.titulo}</h3>
                <p className={styles.canjeDesc}>{tipo.descripcion}</p>
                <div className={styles.ejemplosList}>
                  {tipo.ejemplos.map((ejemplo, index) => (
                    <div key={index} className={styles.ejemploItem}>
                      <span className={styles.ejemploIcon}>✓</span>
                      <span>{ejemplo}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.canjeBadge} style={{ backgroundColor: `${tipo.color}20` }}>
                  <span style={{ color: tipo.color }}>Disponible ahora</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 
            
                {/* Sección: Tiendas Afiliadas 
        <section className={styles.tiendasSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>🤝 Tiendas Afiliadas con Beneficios Especiales</h2>
            <p className={styles.sectionSubtitle}>
              Canjea con ventajas exclusivas en nuestros socios comerciales
            </p>
          </div>

          <div className={styles.tiendasGrid}>
            {tiendasAfiliadas.map((tienda) => (
              <div key={tienda.id} className={styles.tiendaCard}>
                <div className={styles.tiendaHeader}>
                  <span className={styles.tiendaIcono}>{tienda.icono}</span>
                  <div>
                    <h3 className={styles.tiendaNombre}>{tienda.nombre}</h3>
                    <span className={styles.tiendaCategoria}>{tienda.categoria}</span>
                  </div>
                </div>
                <div className={styles.tiendaBeneficio}>
                  <span className={styles.beneficioIcon}>🎯</span>
                  <div className={styles.beneficioInfo}>
                    <span className={styles.beneficioTitulo}>Beneficio Exclusivo</span>
                    <span className={styles.beneficioTexto}>{tienda.descuentos}</span>
                  </div>
                </div>
                <div className={styles.tiendaVentajas}>
                  <div className={styles.ventaja}>
                    <FaClock className={styles.ventajaIcon} />
                    <span>Canje instantáneo</span>
                  </div>
                  <div className={styles.ventaja}>
                    <FaStore className={styles.ventajaIcon} />
                    <span>Multiples sucursales</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.tiendasNota}>
            <p>
              💡 <strong>Tip Pro:</strong> Algunas tiendas ofrecen "Días de Puntos Dobles" 
              y promociones especiales para usuarios LabPoints. ¡Mantente atento!
            </p>
          </div>
        </section>
            
            */}







        {/* ============================================= */}
        {/* FOOTER */}
        {/* ============================================= */}
        <footer className={styles.footer}>
          <div className={styles.footerContainer}>
            {/* Columna 1 - Logo y descripción */}
            <div className={styles.footerCol}>
              <h3 className={styles.footerLogo}>LabPoints</h3>
              <p className={styles.footerDesc}>
                Convierte cada compra en ahorro y experiencias exclusivas.
              </p>
              <div className={styles.socialLinks}>
                <a href="#" aria-label="Instagram" target="_blank" rel="noopener noreferrer">📷</a>
                <a href="#" aria-label="Facebook" target="_blank" rel="noopener noreferrer">📘</a>
                <a href="#" aria-label="Twitter" target="_blank" rel="noopener noreferrer">🐦</a>
                <a href="#" aria-label="TikTok" target="_blank" rel="noopener noreferrer">🎵</a>
              </div>
            </div>

            {/* Columna 2 - Enlaces rápidos */}
            <div className={styles.footerCol}>
              <h4>Enlaces útiles</h4>
              <ul>
                <li><a href="#">Términos y condiciones</a></li>
                <li><a href="#">Política de privacidad</a></li>
                <li><a href="#">Preguntas frecuentes</a></li>
                <li><a href="#">Centro de ayuda</a></li>
              </ul>
            </div>

            {/* Columna 3 - Contacto */}
            <div className={styles.footerCol}>
              <h4>Contacto</h4>
              <ul>
                <li>📧 soporte@labpoints.com</li>
                <li>📞 +123 456 7890</li>
                <li>📍 Ciudad, País</li>
              </ul>
            </div>

            {/* Columna 4 - Descarga la app */}
            <div className={styles.footerCol}>
              <h4>Descarga la app</h4>
              <div className={styles.appButtons}>
                <button className={styles.appBtn} onClick={() => window.open('#', '_blank')}>
                  📱 App Store
                </button>
                <button className={styles.appBtn} onClick={() => window.open('#', '_blank')}>
                  📲 Google Play
                </button>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className={styles.footerBottom}>
            <p>© {new Date().getFullYear()} LabPoints - Todos los derechos reservados</p>
          </div>
        </footer>
      </div>
    </Layout>
  );
}