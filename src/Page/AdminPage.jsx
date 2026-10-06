// Page/NavAdminPage.jsx
import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import NavAdmin from "../components/NavAdmin";
import styles from '../assets/css/prinnn.module.css';

export default function NavAdminPage() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={styles.container}>
      <NavAdmin />
      <div className={`${styles.content} ${isMobile ? styles.contentMobile : ''}`}>
        <Outlet />
      </div>
    </div>
  );
}