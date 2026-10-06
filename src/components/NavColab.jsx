import { NavLink, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { useState, useEffect } from "react"
import styles from "../assets/css/navv.module.css"
import Arbol from "../assets/img/arbol.png"
import InicioC from "../assets/img/colab-inicio.png"
import Logout from "../assets/img/logout.png"
import InventarioC from "../assets/img/colab-inventario.png"
import PuntosC from "../assets/img/colab-puntos.png"
import FactuC from "../assets/img/colab-factu.png"
import paloma from "../assets/img/palomaRR.png"

export default function NavColab() {
  const { logoutUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile) {
      setIsSidebarOpen(false)
    }
  }, [location.pathname, isMobile])

  const handleLogout = async () => {
    try {
      await logoutUser()
      navigate("/", { replace: true })
    } catch (error) {
      console.error("Error en logout:", error)
    }
  }

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  const closeSidebar = () => {
    setIsSidebarOpen(false)
  }

  return (
    <>
      {/* Logo móvil - siempre visible */}
      {isMobile && (
        <div className={styles.mobileLogo}>
          <div className={styles.logo1}>
            <img className={styles.arr} src={Arbol} alt="Arbol de navidad" />
            <div className={styles.texto}>
              <p className={styles.texto1}>Su</p>
              <p className={styles.texto2}>Lab</p>
            </div>
          </div>
        </div>
      )}

      {/* Botón Hamburguesa */}
      {isMobile && (
        <button
          className={`${styles.hamburgerBtn} ${isSidebarOpen ? styles.open : ''}`}
          onClick={toggleSidebar}
          aria-label="Menú"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      )}

      {/* Overlay */}
      {isMobile && isSidebarOpen && (
        <div className={styles.mobileOverlay} onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <nav className={`${styles.navAdminContainer} ${isMobile && isSidebarOpen ? styles.open : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logo1}>
            <img className={styles.arr} src={Arbol} alt="Arbol de navidad" />
            <div className={styles.texto}>
              <p className={styles.texto1}>Su</p>
              <p className={styles.texto2}>Lab</p>
            </div>
          </div>
        </div>

        <div className={styles.navAdminLinks}>
          <NavLink
            to=""
            end
            onClick={() => isMobile && closeSidebar()}
            className={({ isActive }) =>
              isActive ? `${styles.navAdminItem} ${styles.active}` : styles.navAdminItem
            }
          >
            <img className={styles.iconn} src={InicioC} alt="" />
            Inicio
          </NavLink>

          <NavLink
            to="inve"
            onClick={() => isMobile && closeSidebar()}
            className={({ isActive }) =>
              isActive ? `${styles.navAdminItem} ${styles.active}` : styles.navAdminItem
            }
          >
            <img className={styles.iconn} src={InventarioC} alt="" />
            Inventario
          </NavLink>

          <NavLink
            to="pun"
            onClick={() => isMobile && closeSidebar()}
            className={({ isActive }) =>
              isActive ? `${styles.navAdminItem} ${styles.active}` : styles.navAdminItem
            }
          >
            <img className={styles.iconn} src={PuntosC} alt="" />
            Puntos
          </NavLink>

          <NavLink
            to="factu"
            onClick={() => isMobile && closeSidebar()}
            className={({ isActive }) =>
              isActive ? `${styles.navAdminItem} ${styles.active}` : styles.navAdminItem
            }
          >
            <img className={styles.iconn} src={FactuC} alt="" />
            Facturacion
          </NavLink>
        </div>
        <img className={styles.paloma} src={paloma} alt="" />
        <button
          onClick={handleLogout}
          className={styles.navAdminLogout}
        >
          <img className={styles.iconnL} src={Logout} alt="" />
          Cerrar Sesión
        </button>
      </nav>
    </>
  )
}