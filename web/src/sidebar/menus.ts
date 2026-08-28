// src/config/moduleMenus.ts

export type ModuleKey =
  | "product"
  | "sales"
  | "purchase"
  | "dto"
  | "modify"
  | "report"
  | "inventory"
  | "review"
  | "settings";

export type SidebarItem = {
  label: string;
  to: string;
  end?: boolean;
};

/** ✅ 全局 Home（所有模块通用，永远显示在顶部） */
export const homeMenu: SidebarItem = {
  label: "Home",
  to: "/",
  end: true,
};

export const moduleMenus: Record<ModuleKey, SidebarItem[]> = {
  //product
  product: [
    { label: "Product", to: "/product", end: true },
    { label: "Sales", to: "/product/Sales" },
    { label: "12 Mo.", to: "/product/Sales12mo" },
    { label: "Cost", to: "/product/Cost" },
    { label: "Picture", to: "/product/Picture" },
  ],
//sales
  sales: [
    { label: "Sales", to: "/sales", end: true }, // Sales/Sales.tsx (index.php)
    { label: "Invoice", to: "/sales/invoice" }, // Sales/Invoice.tsx (invoice.php)
  ],
//purchase
  purchase: [
    { label: "FPO", to: "/purchase", end: true },
    { label: "FPO Upload", to: "/purchase/fpo/upload" },
    { label: "OPO", to: "/purchase/opo" },
    { label: "RPO", to: "/purchase/rpo" },
    { label: "Vendor", to: "/purchase/vendor" },
  ],
  //DTO
  dto: [{ label: "DTO", to: "/dto", end: true }],
  //modify
  modify: [{ label: "Modify", to: "/modify", end: true }],
  //data report
  report: [
    { label: "Report", to: "/report", end: true },
    { label: "Data Report", to: "/report/data" },
    { label: "Database", to: "/report/database" },
  ],
  //inventory control
  inventory: [{ label: "Inventory", to: "/inventory", end: true }],
  //order review
  review: [{ label: "Review", to: "/review", end: true }],
  //settings
  settings: [
    { label: "Users", to: "/settings", end: true },
    { label: "Roles", to: "/settings/roles" },
    { label: "User Log", to: "/settings/log" },
  ],
};
