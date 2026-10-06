// Page/Principal.jsx
import { Outlet } from "react-router-dom"


export default function Principal() {
  return (
    <div>
      <Navbar />
      <div className="content">
        <Outlet />
      </div>
    </div>
  )
}