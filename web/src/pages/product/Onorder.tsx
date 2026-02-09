
export default function ProductIndex() {
  const orders: any[] = [];
  const transit: any[] = [];

  return (
    <div>
      <h3>On Order</h3>
      <table>
        <tbody>
          <tr>
            <th>Order Date</th>
            <th>Order no.</th>
            <th>Ordqty</th>
            <th>UM</th>
            <th>#/UM</th>
            <th>VendorID</th>
            <th>TPO NO.</th>
            <th>TPO Date</th>
            <th>WHS</th>
          </tr>

          {orders.length ? (
            orders.map((row, idx) => (
              <tr key={idx}>
                <td>{row.Opodate}</td>
                <td>{row.Opono}</td>
                <td>{row.Ordqty}</td>
                <td>{row.Trum}</td>
                <td>{row.Qtum}</td>
                <td>{row.Compno}</td>
                <td>{row.Tpono}</td>
                <td>{row.Tpodate}</td>
                <td>{row.Sstate}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={9} style={{ textAlign: "center" }}>
                无订单数据
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>On Transit</h3>
      <table>
        <tbody>
          <tr>
            <th>ETA Date</th>
            <th>Ship Date</th>
            <th>ord.Qty</th>
            <th>ShipQty</th>
            <th>UM</th>
            <th>cost</th>
            <th>VendorID</th>
            <th>PO No</th>
            <th>PO Date</th>
            <th>WHS</th>
          </tr>

          {transit.length ? (
            transit.map((row, idx) => (
              <tr key={idx}>
                <td>{row.eta_date}</td>
                <td>{row.ship_date}</td>
                <td>{row.order_qty}</td>
                <td>{row.ship_qty}</td>
                <td>{row.um}</td>
                <td>{row.cost}</td>
                <td>{row.vendor_id}</td>
                <td>{row.po_no}</td>
                <td>{row.po_date}</td>
                <td>{row.whs}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={10} style={{ textAlign: "center" }}>
                无运输数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
