import { Outlet } from "react-router-dom";
import NavUser from "../components/NavUser";
import styles from '../assets/css/prinnn.module.css'; 

export default function UsuarioPage() {
    return (
        <div>
            <div className={styles.contentPri}>
                <NavUser />
                <div className={styles.content}>
                    <Outlet />
                </div>
            </div>
        </div>
    );
}