import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import nodemailer from "npm:nodemailer@6.9.1"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://bxgbckjeewukanokmvsn.supabase.co"
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const GMAIL_USER = Deno.env.get("GMAIL_USER") || "nihat.bycvision@gmail.com"
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") || ""

function page(html) {
  const body = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{margin:0;padding:40px;background:#f9fafb;font-family:Arial,sans-serif;text-align:center}</style></head><body>" + html + "</body></html>"
  return new Response(body, { headers: { "Content-Type": "text/html" } })
}

function sendNotification(d, action, comment) {
  const email = d.ownerEmail || d.requesterEmail || d.email || ""
  if (!email) return
  const color = action === "approve" ? "#16a34a" : "#dc2626"
  const label = action === "approve" ? "Onaylandi" : "Reddedildi"
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
  })
  let html = "<div style='font-family:Arial;max-width:600px;margin:0 auto;padding:20px'>"
  html += "<h2 style='color:" + color + "'>Talep " + label + "</h2>"
  html += "<table style='width:100%;border-collapse:collapse;margin:20px 0'>"
  html += "<tr><td style='padding:8px'><b>Talep No:</b></td><td style='padding:8px'>" + (d.reqId || "-") + "</td></tr>"
  html += "<tr><td style='padding:8px'><b>Durum:</b></td><td style='padding:8px'>" + label + "</td></tr>"
  if (action === "reject") {
    html += "<tr><td style='padding:8px'><b>Red Nedeni:</b></td><td style='padding:8px'>" + comment + "</td></tr>"
  }
  html += "<tr><td style='padding:8px'><b>Tarih:</b></td><td style='padding:8px'>" + new Date().toLocaleString("tr-TR") + "</td></tr>"
  html += "</table></div>"
  transporter.sendMail({
    from: '"Lapis ERP" <' + GMAIL_USER + '>',
    to: email,
    subject: label + " - Talep #" + (d.reqId || "-"),
    html: html
  }, function(err) {
    if (err) console.error("Mail error:", err)
    else console.log("Mail sent to", email)
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } })
  }

  const url = new URL(req.url)
  const uid = url.searchParams.get("uid")
  const action = url.searchParams.get("action")

  if (!uid || !action) return page("<h2>Gecersiz istek</h2><p>uid ve action gerekli</p>")

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
  const { data: row, error: err } = await supabase.from("requests").select("data, uid").eq("uid", uid).limit(1).single()
  if (err || !row) return page("<h2 style='color:red'>Talep bulunamadi</h2>")

  const d = row.data || {}
  const cs = d.status || ""

  if (action === "status") {
    const ma = d.mailApproval || {}
    return new Response(JSON.stringify({ ok: true, status: ma.status || "" }), { headers: { "Content-Type": "application/json" } })
  }

  if (action !== "approve" && action !== "reject") return page("<h2>Gecersiz aksiyon</h2>")

  if (cs === "approved" || cs === "rejected") {
    const label = cs === "approved" ? "ONAYLANDI" : "REDDEDILDI"
    const color = cs === "approved" ? "#16a34a" : "#dc2626"
    const ma = d.mailApproval || {}
    let h = "<div style='max-width:400px;margin:0 auto;padding:30px;border:2px solid " + color + ";border-radius:8px'>"
    h += "<h1 style='color:" + color + "'>Islem Tamamlanmis</h1>"
    h += "<p><b>Talep No:</b> " + (d.reqId || uid) + "</p>"
    h += "<p><b>Durum:</b> " + label + "</p>"
    if (ma.decidedAt) h += "<p><b>Tarih:</b> " + new Date(ma.decidedAt).toLocaleString("tr-TR") + "</p>"
    h += "</div>"
    return page(h)
  }

  if (req.method === "POST") {
    const form = await req.formData()
    const comment = (form.get("comment") || "").toString().trim()
    if (action === "reject" && !comment) {
      let h = "<div style='max-width:400px;margin:0 auto;padding:30px'>"
      h += "<h1 style='color:#dc2626'>Red Icin Aciklama Zorunlu</h1>"
      h += "<form method='POST' action='?uid=" + uid + "&action=reject' style='margin-top:20px'>"
      h += "<textarea name='comment' rows='4' style='width:100%;padding:10px;border:1px solid #ccc;border-radius:4px;font-size:14px' placeholder='Red aciklamasi...' required></textarea>"
      h += "<button type='submit' style='margin-top:12px;padding:10px 24px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:16px'>Reddet</button>"
      h += "</form></div>"
      return page(h)
    }

    const status = action === "approve" ? "approved" : "rejected"
    const label = action === "approve" ? "ONAYLANDI" : "REDDEDILDI"
    const now = new Date().toISOString()
    d.status = status
    d.mailApproval = { status: label, decidedAt: now, decidedBy: "Mail Onay", decisionComment: action === "reject" ? comment : "Mail ile onaylandi" }
    d.updatedAt = now

    const { error: updErr } = await supabase.from("requests").update({ status, data: d, updated_at: now }).eq("uid", uid)
    if (updErr) return page("<h2 style='color:red'>Hata: " + updErr.message + "</h2>")

    sendNotification(d, action, comment)

    const color = action === "approve" ? "#16a34a" : "#dc2626"
    let h = "<div style='max-width:400px;margin:0 auto;padding:30px;border:2px solid " + color + ";border-radius:8px'>"
    h += "<h1 style='color:" + color + "'>Talep " + label + "</h1>"
    h += "<p><b>Talep No:</b> " + (d.reqId || uid) + "</p>"
    h += "<p><b>Durum:</b> " + label + "</p>"
    if (action === "reject") h += "<p><b>Aciklama:</b> " + comment + "</p>"
    h += "<p><b>Zaman:</b> " + new Date(now).toLocaleString("tr-TR") + "</p>"
    h += "</div>"
    return page(h)
  }

  if (action === "reject") {
    let h = "<div style='max-width:400px;margin:0 auto;padding:30px'>"
    h += "<h1 style='color:#dc2626'>Talebi Reddet</h1>"
    h += "<p style='color:#666'>Talep No: " + (d.reqId || uid) + "</p>"
    h += "<p style='color:#666'>Red aciklamasi zorunludur:</p>"
    h += "<form method='POST' action='?uid=" + uid + "&action=reject' style='margin-top:20px'>"
    h += "<textarea name='comment' rows='4' style='width:100%;padding:10px;border:1px solid #ccc;border-radius:4px;font-size:14px' placeholder='Red aciklamasi...' required></textarea><br>"
    h += "<button type='submit' style='margin-top:12px;padding:10px 24px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:16px'>Reddet</button>"
    h += "</form></div>"
    return page(h)
  }

  let h = "<div style='max-width:400px;margin:0 auto;padding:30px'>"
  h += "<h1>Talebi Onayla</h1>"
  h += "<p style='color:#666'>Talep No: " + (d.reqId || uid) + "</p>"
  h += "<p>Bu talebi onaylamak istediğinize emin misiniz?</p>"
  h += "<form method='POST' action='?uid=" + uid + "&action=approve' style='margin-top:20px'>"
  h += "<input type='hidden' name='comment' value='Mail ile onaylandi'>"
  h += "<button type='submit' style='padding:12px 32px;background:#16a34a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:16px'>Onayla</button>"
  h += "</form></div>"
  return page(h)
})
