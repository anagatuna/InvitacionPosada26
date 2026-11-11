// Edge Function: rsvp → Brevo (correo transaccional)
// Secretos requeridos (Supabase → Edge Functions → Secrets):
//   BREVO_API_KEY        llave de API de Brevo
//   ADMIN_EMAIL          correo que recibe las confirmaciones (y remitente verificado en Brevo)
// Opcionales:
//   BREVO_SENDER_EMAIL   remitente si es distinto de ADMIN_EMAIL
//   SPOTIFY_PLAYLIST_ID  para incluir el botón de la playlist en el pase

import { clientIp, esc, guard, json, rateLimit, readJson, str } from "../_shared/http.ts";

const EVENTO = {
  nombre: "Posada Navideña 2026",
  fecha: "Sábado 19 de diciembre de 2026",
  hora: "6:00 PM – 1:00 AM",
  lugar: "Paseo Murazano 3577",
  lugar2: "Lomas del Paseo Residencial, Sector II",
  mapa: "https://maps.app.goo.gl/GyfLFKH36MazwqAb8",
  invitacion: "https://anagatuna.github.io/InvitacionPosada26/",
  dress: "Fancy / Elegante",
};

const GCAL =
  "https://calendar.google.com/calendar/render?" +
  new URLSearchParams({
    action: "TEMPLATE",
    text: EVENTO.nombre,
    details: `Dress code: ${EVENTO.dress}\nMapa: ${EVENTO.mapa}`,
    location: `${EVENTO.lugar}, ${EVENTO.lugar2}`,
    ctz: "America/Monterrey",
  }).toString() +
  "&dates=20261220T000000Z/20261220T070000Z";

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

// Colores sólidos (compatibles con Outlook/Hotmail)
const C = {
  bg: "#041a14",
  card: "#0a3a2c",
  card2: "#0f4c3a",
  gold: "#c9a24a",
  goldLight: "#ecd79a",
  bronze: "#5a3e2b",
  cream: "#f6efe2",
  text: "#efe6d2",
  muted: "#b9ad94",
};
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

Deno.serve(async (req) => {
  const blocked = guard(req);
  if (blocked) return blocked;

  const ip = clientIp(req);
  if (!rateLimit(`rsvp:${ip}`, 5, 10 * 60_000)) {
    return json(req, 429, { error: "Demasiados envíos. Intenta más tarde." });
  }

  const body = await readJson(req);
  if (!body) return json(req, 400, { error: "Solicitud inválida." });

  // Honeypot / envío demasiado rápido: respondemos OK sin hacer nada.
  const t = typeof body.t === "number" ? body.t : 0;
  if (str(body.website, 200) !== "" || t < 2500) {
    return json(req, 200, { ok: true });
  }

  const asiste = body.asistencia === "si";
  const nombre = str(body.nombre, 80);
  const correo = str(body.correo, 120).toLowerCase();
  const mensaje = str(body.mensaje, 500);
  const nombresInvitados = asiste && Array.isArray(body.nombresInvitados)
    ? body.nombresInvitados.slice(0, 4).map((n) => str(n, 80)).filter(Boolean)
    : [];
  const invitados = nombresInvitados.length;

  if (nombre.length < 3) return json(req, 400, { error: "Escribe tu nombre completo." });
  if (!EMAIL_RE.test(correo)) return json(req, 400, { error: "El correo no parece válido." });
  if (!rateLimit(`rsvp-mail:${correo}`, 3, 60 * 60_000)) {
    return json(req, 429, { error: "Ya recibimos varias confirmaciones con este correo." });
  }

  const apiKey = Deno.env.get("BREVO_API_KEY");
  const admin = Deno.env.get("ADMIN_EMAIL");
  if (!apiKey || !admin) {
    console.error("Faltan secretos BREVO_API_KEY o ADMIN_EMAIL");
    return json(req, 500, { error: "Servicio no configurado." });
  }
  const sender = { name: EVENTO.nombre, email: Deno.env.get("BREVO_SENDER_EMAIL") || admin };
  const playlistId = Deno.env.get("SPOTIFY_PLAYLIST_ID");
  const playlistUrl = playlistId ? `https://open.spotify.com/playlist/${encodeURIComponent(playlistId)}` : "";
  const pase = "POS-" + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  const data = { asiste, nombre, correo, mensaje, invitados, nombresInvitados, pase, playlistUrl };

  const toAdmin = {
    sender,
    to: [{ email: admin }],
    replyTo: { email: correo, name: nombre },
    subject: `${asiste ? "✅ Confirmó" : "❌ No asistirá"}: ${nombre}${asiste && invitados ? ` (+${invitados})` : ""}`,
    htmlContent: adminHtml(data),
    textContent: adminText(data),
  };
  const toGuest = {
    sender,
    to: [{ email: correo, name: nombre }],
    replyTo: { email: admin },
    subject: asiste ? `Tu Pase Digital · ${EVENTO.nombre}` : `Gracias por avisarnos · ${EVENTO.nombre}`,
    htmlContent: asiste ? guestHtml(data) : declineHtml(data),
    textContent: guestText(data),
  };

  try {
    const [a, g] = await Promise.all([sendBrevo(apiKey, toAdmin), sendBrevo(apiKey, toGuest)]);
    if (!a.ok || !g.ok) {
      console.error("Brevo error", a.status, a.detail, g.status, g.detail);
      return json(req, 502, { error: "No pudimos enviar el correo." });
    }
  } catch (e) {
    console.error("Brevo fetch error", e);
    return json(req, 502, { error: "No pudimos enviar el correo." });
  }

  return json(req, 200, { ok: true, pase: asiste ? pase : null });
});

async function sendBrevo(apiKey: string, payload: unknown) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  return { ok: r.ok, status: r.status, detail: r.ok ? "" : await r.text() };
}

type Data = {
  asiste: boolean;
  nombre: string;
  correo: string;
  mensaje: string;
  invitados: number;
  nombresInvitados: string[];
  pase: string;
  playlistUrl: string;
};

/* ======================= Plantillas ======================= */

function shell(preheader: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(EVENTO.nombre)}</title>
<!--[if mso]><style>table,td{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${C.bg};" bgcolor="${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.bg};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
${inner}
<tr><td align="center" style="padding:24px 12px 8px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted};">
${esc(EVENTO.nombre)} · <a href="${EVENTO.invitacion}" style="color:${C.gold};text-decoration:underline;">Ver invitación</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string, solid = true): string {
  const bg = solid ? C.gold : C.card;
  const color = solid ? C.bg : C.goldLight;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
<tr><td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid ${C.gold};border-radius:24px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:13px;line-height:16px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${color};text-decoration:none;border-radius:24px;">${esc(label)}</a>
</td></tr></table>`;
}

function row(label: string, value: string): string {
  return `<tr>
<td valign="top" width="38%" style="padding:10px 12px;border-bottom:1px solid ${C.card2};font-family:${SANS};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.gold};">${esc(label)}</td>
<td valign="top" style="padding:10px 12px;border-bottom:1px solid ${C.card2};font-family:${SANS};font-size:15px;line-height:21px;color:${C.cream};">${value}</td>
</tr>`;
}

function header(kicker: string, title: string): string {
  return `<tr><td align="center" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.gold};border-bottom:0;padding:36px 24px 18px;">
<p style="margin:0 0 8px;font-family:${SANS};font-size:11px;letter-spacing:4px;text-transform:uppercase;color:${C.gold};">${esc(kicker)}</p>
<h1 style="margin:0;font-family:${SERIF};font-size:34px;line-height:40px;font-weight:normal;color:${C.goldLight};">${title}</h1>
<p style="margin:14px 0 0;font-family:${SERIF};font-size:16px;color:${C.gold};">&#10022;</p>
</td></tr>`;
}

function guestHtml(d: Data): string {
  const invitadosTxt = d.invitados
    ? `${d.invitados} invitado${d.invitados > 1 ? "s" : ""}: ${d.nombresInvitados.map(esc).join(", ")}`
    : "Solo tú";
  return shell(`Tu asistencia está confirmada. Pase ${d.pase}.`, `
${header("Pase Digital", `${esc(EVENTO.nombre.replace(" 2026", ""))}<br><i>2026</i>`)}
<tr><td bgcolor="${C.card}" style="background-color:${C.card};border-left:1px solid ${C.gold};border-right:1px solid ${C.gold};padding:8px 24px 24px;">
  <p style="margin:0 0 18px;text-align:center;font-family:${SANS};font-size:15px;line-height:23px;color:${C.text};">
    Querido(a) <b style="color:${C.cream};">${esc(d.nombre)}</b>, tu asistencia quedó confirmada. Presenta este pase al llegar.
  </p>
  <!-- Boleto -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background-color:${C.bg};border:2px solid ${C.gold};">
    <tr><td align="center" bgcolor="${C.bronze}" style="background-color:${C.bronze};padding:12px;font-family:${SANS};font-size:11px;letter-spacing:4px;text-transform:uppercase;color:${C.goldLight};">Admisión · ${esc(d.pase)}</td></tr>
    <tr><td style="padding:6px 8px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${row("Invitado", `<b>${esc(d.nombre)}</b>`)}
        ${row("Acompañantes", invitadosTxt)}
        ${row("Fecha", `${EVENTO.fecha}<br>${EVENTO.hora}`)}
        ${row("Lugar", `${EVENTO.lugar}<br>${EVENTO.lugar2}`)}
        ${row("Dress code", `<i style="font-family:${SERIF};color:${C.goldLight};font-size:17px;">${EVENTO.dress}</i>`)}
      </table>
    </td></tr>
    <tr><td align="center" style="padding:14px 12px 18px;font-family:${SERIF};font-size:14px;color:${C.gold};">&#10022; &nbsp; Tabla de quesos · Champagne · Vinos · Minijuegos &nbsp; &#10022;</td></tr>
  </table>
</td></tr>
<tr><td bgcolor="${C.card}" align="center" style="background-color:${C.card};border:1px solid ${C.gold};border-top:0;padding:4px 24px 32px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
    <tr><td style="padding:6px;">${button(EVENTO.mapa, "Ver mapa")}</td></tr>
    <tr><td style="padding:6px;">${button(GCAL, "Agregar al calendario", false)}</td></tr>
    ${d.playlistUrl ? `<tr><td style="padding:6px;">${button(d.playlistUrl, "Playlist del evento", false)}</td></tr>` : ""}
  </table>
  <p style="margin:18px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">
    ¿Quieres poner tu canción? Agrégala desde la <a href="${EVENTO.invitacion}#musica" style="color:${C.goldLight};">invitación</a>.
  </p>
</td></tr>`);
}

function declineHtml(d: Data): string {
  return shell("Gracias por avisarnos.", `
${header(EVENTO.nombre, "Te extrañaremos")}
<tr><td bgcolor="${C.card}" align="center" style="background-color:${C.card};border:1px solid ${C.gold};border-top:0;padding:8px 28px 34px;">
  <p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:23px;color:${C.text};">
    Gracias, <b style="color:${C.cream};">${esc(d.nombre)}</b>, por avisarnos que no podrás acompañarnos. Si cambian tus planes, vuelve a confirmar desde la invitación.
  </p>
  ${button(EVENTO.invitacion, "Ver invitación", false)}
  <p style="margin:22px 0 0;font-family:${SERIF};font-size:16px;color:${C.goldLight};">¡Felices fiestas!</p>
</td></tr>`);
}

function adminHtml(d: Data): string {
  return shell(`${d.nombre} ${d.asiste ? "confirmó" : "no asistirá"}`, `
${header("Nueva respuesta RSVP", d.asiste ? "Confirmó asistencia" : "No asistirá")}
<tr><td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.gold};border-top:0;padding:8px 20px 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background-color:${C.bg};border:1px solid ${C.card2};">
    ${row("¿Viene?", d.asiste ? "<b>Sí</b>" : "<b>No</b>")}
    ${row("Nombre", esc(d.nombre))}
    ${row("Correo", `<a href="mailto:${esc(d.correo)}" style="color:${C.goldLight};">${esc(d.correo)}</a>`)}
    ${row("Invitados", d.asiste ? String(d.invitados) : "—")}
    ${row("Nombres", d.nombresInvitados.length ? d.nombresInvitados.map(esc).join("<br>") : "—")}
    ${row("Mensaje", d.mensaje ? esc(d.mensaje).replace(/\n/g, "<br>") : "—")}
    ${row("Total personas", d.asiste ? String(1 + d.invitados) : "0")}
    ${d.asiste ? row("Pase", esc(d.pase)) : ""}
  </table>
</td></tr>`);
}

function adminText(d: Data): string {
  return [
    `RSVP — ${EVENTO.nombre}`,
    `¿Viene?: ${d.asiste ? "Sí" : "No"}`,
    `Nombre: ${d.nombre}`,
    `Correo: ${d.correo}`,
    `Invitados: ${d.asiste ? d.invitados : 0}${d.nombresInvitados.length ? " (" + d.nombresInvitados.join(", ") + ")" : ""}`,
    `Mensaje: ${d.mensaje || "—"}`,
    d.asiste ? `Pase: ${d.pase}` : "",
  ].filter(Boolean).join("\n");
}

function guestText(d: Data): string {
  if (!d.asiste) {
    return `Gracias, ${d.nombre}, por avisarnos que no podrás acompañarnos en la ${EVENTO.nombre}.\n${EVENTO.invitacion}`;
  }
  return [
    `PASE DIGITAL — ${EVENTO.nombre}`,
    `Pase: ${d.pase}`,
    `Invitado: ${d.nombre}`,
    `Acompañantes: ${d.invitados ? d.nombresInvitados.join(", ") : "Solo tú"}`,
    `Fecha: ${EVENTO.fecha}, ${EVENTO.hora}`,
    `Lugar: ${EVENTO.lugar}, ${EVENTO.lugar2}`,
    `Mapa: ${EVENTO.mapa}`,
    `Dress code: ${EVENTO.dress}`,
    `Calendario: ${GCAL}`,
    d.playlistUrl ? `Playlist: ${d.playlistUrl}` : "",
  ].filter(Boolean).join("\n");
}
