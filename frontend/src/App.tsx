import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { Toasts } from './components/ui';
import { useAuth } from './store/stores';
import { iniciarMonitor, refrescarCache } from './lib/sync';
import { applyTheme, getTheme } from './lib/theme';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventario from './pages/Inventario';
import ProductoDetalle from './pages/ProductoDetalle';
import Productos from './pages/Productos';
import Vencimientos from './pages/Vencimientos';
import StockCritico from './pages/StockCritico';
import Compras from './pages/Compras';
import PedidoDetalle from './pages/PedidoDetalle';
import Intermediario from './pages/Intermediario';
import IngresoMercaderia from './pages/IngresoMercaderia';
import Caja from './pages/Caja';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';
import Importar from './pages/Importar';

function Protegido({ children }: { children: JSX.Element }) {
  const usuario = useAuth((s) => s.usuario);
  const loc = useLocation();
  if (!usuario) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  const usuario = useAuth((s) => s.usuario);

  useEffect(() => { applyTheme(getTheme()); }, []);

  useEffect(() => {
    if (!usuario) return;
    iniciarMonitor();
    refrescarCache().catch(() => undefined); // si no hay red, se usa el cache existente
  }, [usuario]);

  return (
    <>
      <Routes>
        <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <Login />} />
        <Route
          element={
            <Protegido>
              <Layout />
            </Protegido>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="pos" element={<POS />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="inventario/:id" element={<ProductoDetalle />} />
          <Route path="productos" element={<Productos />} />
          <Route path="productos/importar" element={<Importar />} />
          <Route path="vencimientos" element={<Vencimientos />} />
          <Route path="stock-critico" element={<StockCritico />} />
          <Route path="compras" element={<Compras />} />
          <Route path="compras/ingreso" element={<IngresoMercaderia />} />
          <Route path="compras/:id" element={<PedidoDetalle />} />
          <Route path="intermediario" element={<Intermediario />} />
          <Route path="caja" element={<Caja />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="configuracion" element={<Configuracion />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  );
}
