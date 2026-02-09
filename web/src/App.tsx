import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import RequireAuth from "./components/RequireAuth";
import AppLayout from "./components/AppLayout";

import Home from "./pages/Home";
import Login from "./pages/Login";

import { SidebarProvider } from "./sidebar/SidebarContext";
// Product Page
import ProductPage from "./pages/product/ProductPage";
import ProductSales from "./pages/product/Sales";
import ProductSales12mo from "./pages/product/Sales12mo";
import ProductCost from "./pages/product/Cost";
import ProductPicture from "./pages/product/Picture";
// DTO page
import DtoPage from "./pages/dto/DtoPage";
// Modify Page
import ModifyPage from "./pages/modify/ModifyPage";
// Sales Page
import Sales from "./pages/salesorder/Sales";
import Invoice from "./pages/salesorder/Invoices";
// Report Page
import ReportExportPage from "./pages/reports/ReportExportPage";
import DbBrowserPage from "./pages/reports/DbBrowserPage";
// Settings Page
import Roles from "./pages/settings/Roles";
import Users from "./pages/settings/Users";

function ProtectedLayout() {
  return (
    <RequireAuth>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SidebarProvider>
        <Routes>
          {/* 未登录页面 */}
          <Route path="/login" element={<Login />} />

          {/* 受保护区域 */}
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Home />} />

            {/* Product */}
            <Route path="/product" element={<ProductPage />}>
              <Route path="sales" element={<ProductSales />} />
              <Route path="sales12mo" element={<ProductSales12mo />} />
              <Route path="cost" element={<ProductCost />} />
              <Route path="picture" element={<ProductPicture />} />
            </Route>
            {/* Modify */}
            <Route path="/modify" element={<ModifyPage />} />
            {/* DTO */}
            <Route path="/dto" element={<DtoPage />} />
            {/* Sales */}
            <Route path="/sales" element={<Sales />} />
            <Route path="/sales/invoice" element={<Invoice />} />
            {/* Report */}
            <Route path="/report" element={<ReportExportPage/>} />
            <Route path="/report/database" element={<DbBrowserPage />} />
            {/* Settings */}
            <Route path="/settings" element={<Users />} />
            <Route path="/settings/roles" element={<Roles />} />
            {/* 兜底：所有未知路径回首页 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </SidebarProvider>
    </BrowserRouter>
  );
}
