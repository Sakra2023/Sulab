import { Route, Routes } from "react-router-dom"
import { AuthProvider } from "./context/AuthContext"
import ProtectedRoute from "./routes/ProtectedRoute"

import AdminPage from "./Page/AdminPage"
import LoginPage from "./Page/login"
import ColabPage from "./Page/ColabPage"
import UsuarioPage from "./Page/UsuarioPage"

import Principal from "./components/principalP"
import Nosotros from "./components/Nosotros"

import InicioA from "./components/Admin/inicio"
import UsuarioA from "./components/Admin/usuarios"

import InicioC from "./components/Cola/inicioC"
import InvetarioC from "./components/Cola/inventario"
import ContabilidadC from "./components/Cola/Contabilidad"
import PuntosC from "./components/Cola/Puntos"

import FactuC from "./components/Cola/factu"

import InicioU from "./components/Usuario/inicioU"
import HistoriU from "./components/Usuario/historial"
import NotifiU from "./components/Usuario/notificacionesU"

import Register from "./components/Register"
import NotiA from "./components/Admin/noti"


import RecuperacionContra from "./Page/ResetearPage"

import './App.css'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Principal />} />
        {/*  <Route path="/nosotros" element={<Nosotros />} />      */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Register />} />
        
        {/* ✅ RUTA PARA RECUPERACIÓN DE CONTRASEÑA */}
        <Route path="/reset-password/:token" element={<RecuperacionContra />} />
        
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminPage />
            </ProtectedRoute>
          }
        >
          <Route index element={<InicioA />} />
          <Route path="inicio" element={<InicioA />} />
          <Route path="lista" element={<UsuarioA />} />
          <Route path="noti" element={<NotiA />} />
        </Route>

        <Route path='/Colab' element={<ProtectedRoute allowedRoles={['colab']} ><ColabPage /></ProtectedRoute>}>
          <Route index element={<InicioC />} />
          <Route path="pun" element={<PuntosC />} />
          <Route path="conta" element={<ContabilidadC />} />
          <Route path="inve" element={<InvetarioC />} />
          <Route path="factu" element={<FactuC />} />
        </Route>

        <Route path='/usuario' element={<ProtectedRoute allowedRoles={['usuario']} ><UsuarioPage /></ProtectedRoute>}>
          <Route index element={<InicioU />} />
          <Route path="histo" element={<HistoriU />} />
          <Route path="not" element={<NotifiU />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App