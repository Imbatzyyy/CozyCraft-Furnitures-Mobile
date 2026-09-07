export type InvoiceOrder = {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  subtotal: number;
  delivery_fee: number | null;
  reward_discount?: number;
  total: number;
  payment_method: string;
  payment_status: string;
  shipping_address: Record<string, unknown>;
  order_items: {
    id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
  }[];
};
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const cents = (value: unknown) => {
  const amount = Number(value);
  if (value == null || !Number.isFinite(amount) || amount < 0) {
    throw new Error(
      "The order amounts need review. Please contact CozyCraft Care.",
    );
  }
  return Math.round(amount * 100);
};
const money = (value: number) =>
  `₱${
    (value / 100).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }`;

export function invoiceEmail(order: InvoiceOrder) {
  if (order.status !== "delivered") {
    throw new Error("Invoices are available for delivered orders only.");
  }
  const subtotal = cents(order.subtotal),
    discount = cents(order.reward_discount ?? 0),
    total = cents(order.total);
  const delivery = order.delivery_fee == null
    ? total - subtotal + discount
    : cents(order.delivery_fee);
  const items = [...order.order_items].sort((a, b) => a.id - b.id);
  if (
    !items.length ||
    items.some((item) =>
      !Number.isInteger(item.quantity) || item.quantity < 1
    ) || delivery < 0 || subtotal + delivery - discount !== total ||
    items.reduce(
        (sum, item) => sum + cents(item.unit_price) * item.quantity,
        0,
      ) !== subtotal
  ) {
    throw new Error(
      "The order amounts need review. Please contact CozyCraft Care.",
    );
  }
  const date = new Date(order.created_at);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("The order date needs review.");
  }
  const number = String(order.order_number || order.id);
  const address = order.shipping_address || {};
  const placed = date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
  const rows = items.map((item) =>
    `<tr><td style="padding:18px 0;border-bottom:1px solid #e5dfd4;word-break:break-word"><b>${
      escape(item.product_name)
    }</b><br><span style="color:#736c62;font-size:13px">${item.quantity} × ${
      money(cents(item.unit_price))
    }</span></td><td align="right" style="padding:18px 0 18px 12px;border-bottom:1px solid #e5dfd4;white-space:nowrap">${
      money(cents(item.unit_price) * item.quantity)
    }</td></tr>`
  ).join("");
  const payment = ({
    cod: "Cash on delivery",
    gcash: "GCash",
    card: "Credit or debit card",
  } as Record<string, string>)[order.payment_method] || order.payment_method;
  const summary = (label: string, amount: number) =>
    `<tr><td style="padding:7px 0;color:#736c62">${label}</td><td align="right">${
      money(amount)
    }</td></tr>`;
  return {
    subject: `Your CozyCraft invoice · ${number}`,
    text:
      `CozyCraft Furnitures\nORDER INVOICE · ${number}\nOrdered ${placed}\n${
        items.map((item) =>
          `${item.product_name}: ${item.quantity} × ${
            money(cents(item.unit_price))
          }`
        ).join("\n")
      }\nSubtotal: ${money(subtotal)}\nDelivery: ${
        money(delivery)
      }\nDiscount: ${money(discount)}\nOrder total: ${
        money(total)
      }\nPayment: ${payment} · ${order.payment_status}\nThis customer copy records your order. Contact CozyCraft Care for an official tax invoice.`,
    html:
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;background:#f2efe8;color:#292a24;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:auto;background:#fffdf9;border:1px solid #dfd8cc;border-radius:20px;overflow:hidden"><tr><td style="padding:30px 24px;background:#30392d;color:#faf6ec"><div style="margin:0 0 24px;padding:14px 18px;background:#fffdf9;border-radius:12px;width:184px;max-width:100%;box-sizing:border-box"><img src="cid:cozycraft-invoice-logo" width="148" alt="CozyCraft Furniture" style="display:block;width:148px;max-width:100%;height:auto;border:0"></div><div style="font-size:12px;letter-spacing:2px;color:#d6c7a6">COZYCRAFT FURNITURES</div><h1 style="font:normal 36px Georgia,serif;margin:20px 0 8px">Made for your home.</h1><p style="margin:0;color:#e0ddcf;line-height:1.6">Your delivered order, thoughtfully documented.</p></td></tr><tr><td style="padding:28px 24px"><p style="font-size:11px;letter-spacing:2px;color:#7a715f">ORDER INVOICE · CUSTOMER COPY</p><h2 style="font:normal 27px Georgia,serif;margin:10px 0;overflow-wrap:anywhere">${
        escape(number)
      }</h2><p style="color:#736c62;line-height:1.6">Ordered ${placed}<br>Delivered · ${
        escape(payment)
      }<br>Payment status: ${
        escape(
          String(order.payment_status || "Not recorded").replaceAll("_", " "),
        )
      }</p><div style="padding:18px;background:#f3f0e9;border-radius:12px;line-height:1.65;word-break:break-word"><b>${
        escape(
          address.name || address.recipient_name ||
            "Recipient recorded with order",
        )
      }</b><br>${
        escape(
          [
            address.line,
            address.barangay,
            address.city,
            address.province,
            address.postal,
          ].filter(Boolean).join(", "),
        )
      }</div><table width="100%" cellspacing="0" cellpadding="0" style="font-size:15px;line-height:1.5;margin:16px 0 22px"><thead><tr><th align="left" style="padding:12px 0;font-size:11px;letter-spacing:1px;color:#736c62">YOUR PIECES</th><th align="right" style="font-size:11px;color:#736c62">AMOUNT</th></tr></thead><tbody>${rows}</tbody></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px">${
        summary("Furniture subtotal", subtotal)
      }${summary("Delivery fee", delivery)}${
        summary("Discount applied", discount)
      }<tr><td style="padding:20px 0;font-weight:bold;border-top:1px solid #d6cebf">Order total</td><td align="right" style="padding:20px 0;font:normal 25px Georgia,serif;border-top:1px solid #d6cebf;white-space:nowrap">${
        money(total)
      }</td></tr></table></td></tr><tr><td style="padding:24px;background:#ede8dc;color:#645f54;font-size:12px;line-height:1.8">Thank you for making CozyCraft part of your home.<br>This customer copy records your order; it does not certify payment or replace an official tax invoice. For an official tax invoice or assistance, contact <a href="mailto:cozycraftfurnitures2026@gmail.com" style="color:#30392d;word-break:break-all">CozyCraft Care</a>.</td></tr></table></td></tr></table></body></html>`,
  };
}
