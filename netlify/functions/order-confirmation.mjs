// EcoPack order confirmation: sends an email (Resend) and an optional SMS (BulkSMS)
// after checkout. Secrets live in Netlify environment variables, never in the page.
//
// Environment variables (Netlify > Site configuration > Environment variables):
//   RESEND_API_KEY        required for email   (resend.com > API Keys)
//   ORDER_FROM_EMAIL      optional, e.g. "EcoPack <orders@ecopack.co.za>" (needs a verified domain in Resend)
//   BULKSMS_TOKEN_ID      required for SMS     (bulksms.com > Settings > API Tokens)
//   BULKSMS_TOKEN_SECRET  required for SMS
//   ORDER_REPLY_TO        optional, inbox that receives customer replies, e.g. "hello@ecopack.co.za"
//   STORE_URL             optional, link shown in the email, e.g. "https://ecopack.netlify.app"

// Prices and bottle counts are kept here so a tampered page can't change what the
// confirmation says. Keep this in sync with the product list in index.html.
const PRODUCTS = {
  voyager: { name: "Voyager 28L", price: 1899, bottles: 24 },
  metro:   { name: "Metro 18L", price: 1299, bottles: 14 },
  cubes:   { name: "Packing Cube Set", price: 449, bottles: 9 },
  tech:    { name: "Tech Pouch", price: 349, bottles: 4 },
  wash:    { name: "Wash Kit", price: 299, bottles: 3 },
  kit:     { name: "The Travel Kit", price: 2399, bottles: 37 },
};
const COLORS = ["Spruce", "Slate", "Sand", "Ember"];
const FREE_SHIPPING_FROM = 1500;
const SHIPPING = { courier: { fee: 99, label: "Courier to your door (2–4 working days)" },
                   pickup:  { fee: 60, label: "Pickup point (3–5 working days)" } };

// Best-effort abuse limit: 5 confirmations per IP per 10 minutes (per function instance).
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > 5;
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "R" + n.toLocaleString("en-ZA").replace(/\s/g, ",");
const str = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";

// South African mobile numbers: 082 555 0142 or +27 82 555 0142 -> +27825550142
export function normalizeZaMobile(raw) {
  const d = String(raw || "").replace(/[\s()-]/g, "");
  if (/^0[6-8]\d{8}$/.test(d)) return "+27" + d.slice(1);
  if (/^\+27[6-8]\d{8}$/.test(d)) return d;
  if (/^27[6-8]\d{8}$/.test(d)) return "+" + d;
  return null;
}

export function buildOrder(o) {
  if (!o || typeof o !== "object") throw new Error("Order is missing.");
  const orderId = str(o.orderId, 20);
  if (!/^ECO-\d{5}$/.test(orderId)) throw new Error("Order number is invalid.");
  const email = str(o.email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email address is invalid.");
  const name = str(o.name, 80);
  if (name.length < 2) throw new Error("Name is missing.");
  const ship = SHIPPING[o.ship] ? o.ship : null;
  if (!ship) throw new Error("Delivery method is invalid.");
  if (!Array.isArray(o.items) || !o.items.length || o.items.length > 20) throw new Error("Order has no items.");
  const items = o.items.map(i => {
    const p = PRODUCTS[i && i.id];
    const q = Number(i && i.q);
    if (!p || !Number.isInteger(q) || q < 1 || q > 20 || !COLORS.includes(i.c)) throw new Error("An item in the order is invalid.");
    return { ...p, color: i.c, q, line: p.price * q };
  });
  const sub = items.reduce((a, i) => a + i.line, 0);
  const fee = sub >= FREE_SHIPPING_FROM ? 0 : SHIPPING[ship].fee;
  return {
    orderId, email, name, ship, items, sub, fee, total: sub + fee,
    bottles: items.reduce((a, i) => a + i.bottles * i.q, 0),
    address: [str(o.addr, 120), str(o.city, 60), str(o.code, 4)].filter(Boolean).join(", "),
    paidWith: str(o.paidWith, 60),
    phone: o.sms ? normalizeZaMobile(o.phone) : null,
    test: o.test !== false,
  };
}

export function emailHtml(o, storeUrl) {
  const rows = o.items.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #D3DBE6">${i.q} × ${esc(i.name)}<br><span style="color:#55627A;font-size:13px">${esc(i.color)}</span></td><td align="right" style="padding:8px 0;border-bottom:1px solid #D3DBE6;font-family:monospace">${money(i.line)}</td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#F2F5F9;font-family:Arial,Helvetica,sans-serif;color:#14213D">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F9;padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:6px;overflow:hidden">
<tr><td style="background:#14213D;color:#EAF0F8;padding:20px 24px;font-size:22px;font-weight:bold"><span style="color:#F4B400">●</span> EcoPack</td></tr>
<tr><td style="padding:24px">
${o.test ? `<p style="background:#FFF6D6;border-left:3px solid #F4B400;padding:10px 12px;font-size:13px;margin:0 0 18px">Test order placed with MockPay. No money was charged.</p>` : ""}
<h1 style="font-size:24px;margin:0 0 6px">Thanks, ${esc(o.name.split(" ")[0])}. Your order is confirmed.</h1>
<p style="margin:0 0 20px;color:#55627A">Order <b style="color:#14213D">${esc(o.orderId)}</b></p>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${rows}
<tr><td style="padding:8px 0">Subtotal</td><td align="right" style="font-family:monospace">${money(o.sub)}</td></tr>
<tr><td style="padding:4px 0">Shipping</td><td align="right" style="font-family:monospace">${o.fee ? money(o.fee) : "Free"}</td></tr>
<tr><td style="padding:10px 0;border-top:2px solid #14213D;font-weight:bold">Total</td><td align="right" style="padding:10px 0;border-top:2px solid #14213D;font-weight:bold;font-family:monospace">${money(o.total)}</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-top:16px;color:#14213D">
${o.paidWith ? `<tr><td style="color:#55627A;padding:3px 12px 3px 0;width:90px">Paid with</td><td>${esc(o.paidWith)}</td></tr>` : ""}
<tr><td style="color:#55627A;padding:3px 12px 3px 0;width:90px">Delivery</td><td>${esc(SHIPPING[o.ship].label)}</td></tr>
<tr><td style="color:#55627A;padding:3px 12px 3px 0;vertical-align:top">Ship to</td><td>${esc(o.name)}<br>${esc(o.address)}</td></tr></table>
<p style="margin:20px 0 0;padding:12px;background:#F2F5F9;border-radius:4px;font-size:14px">Your order kept <b>${o.bottles} plastic bottles</b> out of landfill.</p>
<p style="margin:20px 0 0;font-size:14px;color:#55627A">We'll email you a tracking link when your order ships. Questions? Just reply to this email.</p>
${storeUrl ? `<p style="margin:20px 0 0"><a href="${esc(storeUrl)}" style="background:#F4B400;color:#14213D;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:3px;display:inline-block">Visit EcoPack</a></p>` : ""}
</td></tr>
<tr><td style="padding:16px 24px;background:#F2F5F9;font-size:12px;color:#55627A">EcoPack · Travel gear made from recycled bottles · Lifetime warranty</td></tr>
</table></td></tr></table></body></html>`;
}

export function emailText(o) {
  return [
    o.test ? "TEST ORDER: placed with MockPay, no money was charged.\n" : "",
    `Thanks, ${o.name.split(" ")[0]}. Your EcoPack order ${o.orderId} is confirmed.`, "",
    ...o.items.map(i => `${i.q} x ${i.name} (${i.color})  ${money(i.line)}`), "",
    `Subtotal ${money(o.sub)}`, `Shipping ${o.fee ? money(o.fee) : "Free"}`, `Total ${money(o.total)}`, "",
    `Delivery: ${SHIPPING[o.ship].label}`, `Ship to: ${o.name}, ${o.address}`, "",
    `Your order kept ${o.bottles} plastic bottles out of landfill.`,
  ].join("\n");
}

export function smsText(o) {
  return `EcoPack: Order ${o.orderId} confirmed. Total ${money(o.total)}. We'll SMS tracking when it ships.${o.test ? " Test order, no payment taken." : ""}`;
}

async function sendEmail(o) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "not_configured";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ORDER_FROM_EMAIL || "EcoPack <onboarding@resend.dev>",
      to: [o.email],
      subject: `${o.test ? "[Test] " : ""}Your EcoPack order ${o.orderId} is confirmed`,
      html: emailHtml(o, process.env.STORE_URL),
      text: emailText(o),
      ...(process.env.ORDER_REPLY_TO ? { reply_to: process.env.ORDER_REPLY_TO } : {}),
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok ? "sent" : "failed";
}

async function sendSms(o) {
  if (!o.phone) return "skipped";
  const id = process.env.BULKSMS_TOKEN_ID, secret = process.env.BULKSMS_TOKEN_SECRET;
  if (!id || !secret) return "not_configured";
  const res = await fetch("https://api.bulksms.com/v1/messages", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/json" },
    body: JSON.stringify({ to: o.phone, body: smsText(o) }),
  });
  if (!res.ok) console.error("BulkSMS error", res.status, await res.text());
  return res.ok ? "sent" : "failed";
}

export default async (req, context) => {
  if (req.method !== "POST") return json(405, { error: "Send the order with POST." });
  if (limited((context && context.ip) || "unknown")) return json(429, { error: "Too many orders from this connection. Try again in 10 minutes." });
  let order;
  try { order = buildOrder(await req.json()); }
  catch (e) { return json(400, { error: e instanceof SyntaxError ? "The order data couldn't be read." : e.message }); }
  const [email, sms] = await Promise.all([
    sendEmail(order).catch(e => (console.error(e), "failed")),
    sendSms(order).catch(e => (console.error(e), "failed")),
  ]);
  return json(200, { email, sms, phone: order.phone });
};

export const config = { path: "/api/order-confirmation" };
