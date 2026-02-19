export type FpoRow = {
  fpoNo: string;
  fpoDate: string;
  itemId: string;
  whse: string;
  status: string;
  estQty: number;
  remainQty: number;
  estPrice: number;
  vend1: string;
  vend2: string;
  remarks?: string;
};

export type OpoRow = {
  opoNo: string;
  opoDate: string;
  itemId: string;
  whse: string;
  containerNo: string;
  etd: string;
  eta: string;
  shipQty: number;
  shipPrice: number;
  vend1: string;
  vend2?: string;
};

export type RpoRow = {
  rpoNo: string;
  rpoDate: string;
  itemId: string;
  whse: string;
  containerNo: string;
  etd: string;
  eta: string;
  recvQty: number;
  recvPrice: number;
  vend1: string;
  vend2?: string;
};

export type FpoDetailLine = {
  ln: number;
  itemId: string;
  desc: string;
  estQty: number;
  shipQty: number;
  recvQty: number;
  remainQty: number;
  estPrice: number;
  estAmt: number;
  curPrice: number;
  curAmt: number;
  finalPrice: number;
  finalAmt: number;
  remarks?: string;
  status: string;
};

export type OpoDetailLine = {
  ln: number;
  opoNo: string;
  itemId: string;
  desc: string;
  shipQty: number;
  shipAmt: number;
  estPrice: number;
  estAmt: number;
  curPrice: number;
  curAmt: number;
  vend1: string;
  vend2?: string;
  notes?: string;
};

export const fpoRows: FpoRow[] = [
  {
    fpoNo: "10001",
    fpoDate: "2024-04-01",
    itemId: "AST-KK521V-A",
    whse: "GA",
    status: "Completed",
    estQty: 30,
    remainQty: 0,
    estPrice: 10,
    vend1: "BMC-JZY",
    vend2: "BMC-JZY",
  },
  {
    fpoNo: "10002",
    fpoDate: "2024-05-01",
    itemId: "AST-KK521V-CFL",
    whse: "GA",
    status: "Completed",
    estQty: 30,
    remainQty: 0,
    estPrice: 15,
    vend1: "BMC-JZY",
    vend2: "BMC-JZY",
  },
  {
    fpoNo: "10003",
    fpoDate: "2024-06-01",
    itemId: "AST-KK521V-GBK",
    whse: "GA",
    status: "Completed",
    estQty: 30,
    remainQty: 0,
    estPrice: 10,
    vend1: "BMC-JZY",
    vend2: "BMC-JZY",
  },
  {
    fpoNo: "10004",
    fpoDate: "2024-07-01",
    itemId: "BKP-CC146GZL12",
    whse: "CA",
    status: "Pending",
    estQty: 5,
    remainQty: 5,
    estPrice: 30,
    vend1: "BMC-YL",
    vend2: "FMI",
  },
  {
    fpoNo: "10005",
    fpoDate: "2024-08-01",
    itemId: "BLF-FME21KP-A",
    whse: "CA",
    status: "Processing",
    estQty: 20,
    remainQty: 10,
    estPrice: 10,
    vend1: "BMC-RUIG",
    vend2: "BMC-JZY",
    remarks: "FBA ITEMS",
  },
];

export const opoRows: OpoRow[] = [
  {
    opoNo: "10001",
    opoDate: "2024-04-01",
    itemId: "AST-KK521V-A",
    whse: "GA",
    containerNo: "YMM01234567",
    etd: "2025-01-02",
    eta: "2025-02-02",
    shipQty: 20,
    shipPrice: 30,
    vend1: "BMC-JZY",
  },
  {
    opoNo: "10002",
    opoDate: "2024-04-01",
    itemId: "AST-KK521V-CFL",
    whse: "GA",
    containerNo: "YMM08841342",
    etd: "2025-05-01",
    eta: "2025-07-02",
    shipQty: 180,
    shipPrice: 54,
    vend1: "BMC-JZY",
  },
  {
    opoNo: "10003",
    opoDate: "2024-04-01",
    itemId: "BKP-CC146GZL12",
    whse: "CA",
    containerNo: "YMM01001007",
    etd: "2025-01-20",
    eta: "2025-04-10",
    shipQty: 40,
    shipPrice: 35,
    vend1: "BMC-JZY",
  },
  {
    opoNo: "10004",
    opoDate: "2024-04-01",
    itemId: "BLF-FME21KP-A",
    whse: "GA",
    containerNo: "YMM05154567",
    etd: "2026-04-10",
    eta: "2026-05-10",
    shipQty: 80,
    shipPrice: 15,
    vend1: "BMC-JZY",
  },
  {
    opoNo: "10005",
    opoDate: "2024-04-01",
    itemId: "AST-KK521V-A",
    whse: "CA",
    containerNo: "YMM01288567",
    etd: "2025-03-02",
    eta: "2025-04-02",
    shipQty: 60,
    shipPrice: 18,
    vend1: "BMC-JZY",
  },
];

export const rpoRows: RpoRow[] = [
  {
    rpoNo: "10001",
    rpoDate: "2024-04-01",
    itemId: "AST-KK521V-A",
    whse: "GA",
    containerNo: "YMM01234567",
    etd: "2025-01-02",
    eta: "2025-02-02",
    recvQty: 20,
    recvPrice: 30,
    vend1: "BMC-JZY",
  },
  {
    rpoNo: "10002",
    rpoDate: "2024-04-01",
    itemId: "AST-KK521V-CFL",
    whse: "GA",
    containerNo: "YMM08841342",
    etd: "2025-05-01",
    eta: "2025-07-02",
    recvQty: 180,
    recvPrice: 54,
    vend1: "BMC-JZY",
  },
  {
    rpoNo: "10003",
    rpoDate: "2024-04-01",
    itemId: "BKP-CC146GZL12",
    whse: "CA",
    containerNo: "YMM01001007",
    etd: "2025-01-20",
    eta: "2025-04-10",
    recvQty: 40,
    recvPrice: 35,
    vend1: "BMC-JZY",
  },
  {
    rpoNo: "10004",
    rpoDate: "2024-04-01",
    itemId: "BLF-FME21KP-A",
    whse: "GA",
    containerNo: "YMM05154567",
    etd: "2026-04-10",
    eta: "2026-05-10",
    recvQty: 80,
    recvPrice: 15,
    vend1: "BMC-JZY",
  },
  {
    rpoNo: "10005",
    rpoDate: "2024-04-01",
    itemId: "AST-KK521V-A",
    whse: "CA",
    containerNo: "YMM01288567",
    etd: "2025-03-02",
    eta: "2025-04-02",
    recvQty: 60,
    recvPrice: 18,
    vend1: "BMC-JZY",
  },
];

export const fpoDetailLines: FpoDetailLine[] = [
  {
    ln: 1,
    itemId: "CP004RD",
    desc: "08-10 BMW E60 5…",
    estQty: 30,
    shipQty: 0,
    recvQty: 0,
    remainQty: 30,
    estPrice: 5,
    estAmt: 150,
    curPrice: 10,
    curAmt: 300,
    finalPrice: 10,
    finalAmt: 300,
    status: "Processing",
  },
  {
    ln: 2,
    itemId: "CP015BK",
    desc: "05-10 BMW E60 5…",
    estQty: 40,
    shipQty: 20,
    recvQty: 0,
    remainQty: 20,
    estPrice: 5,
    estAmt: 200,
    curPrice: 10,
    curAmt: 400,
    finalPrice: 10,
    finalAmt: 400,
    status: "Processing",
  },
  {
    ln: 3,
    itemId: "CP015BR",
    desc: "05-10 BMW E60 5…",
    estQty: 30,
    shipQty: 20,
    recvQty: 0,
    remainQty: 10,
    estPrice: 5,
    estAmt: 150,
    curPrice: 10,
    curAmt: 300,
    finalPrice: 10,
    finalAmt: 300,
    remarks: "DV",
    status: "Processing",
  },
];

export const opoDetailLines: OpoDetailLine[] = [
  {
    ln: 1,
    opoNo: "10001",
    itemId: "AST-KK521V-A",
    desc: "08-10 BMW E60 5…",
    shipQty: 20,
    shipAmt: 600,
    estPrice: 28,
    estAmt: 560,
    curPrice: 30,
    curAmt: 600,
    vend1: "BMC-JZY",
  },
  {
    ln: 2,
    opoNo: "10001",
    itemId: "AST-KK521V-CFL",
    desc: "05-10 BMW E60 5…",
    shipQty: 40,
    shipAmt: 1200,
    estPrice: 25,
    estAmt: 1000,
    curPrice: 30,
    curAmt: 1200,
    vend1: "BMC-JZY",
  },
];
