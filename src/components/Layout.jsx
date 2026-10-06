// components/Layout.jsx
import { NavLink, Link } from 'react-router-dom';
import styles from '../assets/css/navbar.module.css';
import Arbol from "../assets/img/arbol.png"

export default function Layout({ children }) {
  return (
    <div>
      <nav className={styles.navbar}>
        <div className={styles.logo}>
          <div className={styles.logo1}>
            <img className={styles.arr} src={Arbol} alt="Arbol de navidad" />
            <div className={styles.texto}>
              <p className={styles.texto1}>Su</p>
              <p className={styles.texto2}>Lab</p>
            </div>
          </div>
        </div>

        <div className={styles.menu}>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
            }
          >
            Inicio
          </NavLink>


          {/* 
          
          <NavLink 
            to="/nosotros"
            className={({ isActive }) => 
              isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
            }
          >
            Nosotros
          </NavLink>
          
          */}

        </div>

        <div className={styles.authButtons}>
          <NavLink
            to="/login"
            className={({ isActive }) =>
              isActive ? `${styles.loginBtn} ${styles.active}` : styles.loginBtn
            }
          >
            Iniciar Sesión
          </NavLink>
          <NavLink
            to="/register"
            className={({ isActive }) =>
              isActive ? `${styles.registerBtn} ${styles.active}` : styles.registerBtn
            }
          >
            Registrarse
          </NavLink>
        </div>
      </nav>

      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}