import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { translateTreatment, setTranslationDict } from "./treatments";
import * as XLSX from "xlsx";

// ─── PDF.js ───────────────────────────────────────────────────────────────────
const loadPdfJs = () => new Promise((resolve) => {
  if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  s.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    resolve(window.pdfjsLib);
  };
  document.head.appendChild(s);
});

const parsePDF = async (file) => {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let txt = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    txt += (await pg.getTextContent()).items.map(x => x.str).join(" ") + "\n";
  }
  const get = (re) => { const m = txt.match(re); return m ? m[1].trim() : ""; };
  const hc       = get(/Expediente\s*:\s*(\d+)/i);
  const name     = get(/Nombre\s*:\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]+?)(?=\s*DNI|\s*Pob\.)/i);
  const dni      = get(/DNI\s*:\s*([\w\-]+)/i);
  const budgetNo = get(/Presupuesto\s*:\s*([\d\s\/]+)/i).replace(/\s+/g,"");
  const dateRaw  = get(/Fecha\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const date     = dateRaw ? dateRaw.split("/").reverse().join("-") : today();
  const treatments = [];
  const rx = /(\d{4})\s+\d+\s+(.+?)\s+([\d]+[.,]\d{2})\s*€\s+([\d]+[.,]\d{2})\s*€\s+(\d+)%\s+([\d]+[.,]\d{2})\s*€/g;
  let m;
  while ((m = rx.exec(txt)) !== null) {
    const base  = parseFloat(m[6].replace(",","."));
    const value = parseFloat((base * 1.1).toFixed(2));
    treatments.push({ id:genId(), name:m[2].trim(), value:String(value), discount:"0" });
  }
  const phone = get(/Móv\.?\s*[\/]\s*Tel[eé]f\.?\s*:?\s*([\d\s\+\(\)\-\.]{6,})/i).replace(/[\s\.]/g,"").replace(/\/$/, "");
  return { hc, name, dni, budgetNo, date, time:"", phone, treatments };
};

// ─── PIN AUTH ────────────────────────────────────────────────────────────────
const PIN_HASH = "5409cbc4848a7d07b30a475b98165ea5b25a13fc0982eccab3fa679365ffa0ca";
const hashPin  = async (pin) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
};

function PinLock({ onUnlock }) {
  const pinRef  = useRef(null);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const pin = pinRef.current?.value || "";
    const h = await hashPin(pin);
    if (h !== PIN_HASH) {
      setError(true); setShake(true);
      if (pinRef.current) pinRef.current.value = "";
      setTimeout(()=>setShake(false), 500);
      return;
    }
    setLoading(true);
    const email    = import.meta.env.VITE_AUTH_EMAIL    || "admin@implantdent.local";
    const password = import.meta.env.VITE_AUTH_PASSWORD || "AhYTXX-2u!@k2C%";
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) console.warn("Supabase Auth:", authErr.message);
    setLoading(false);
    onUnlock();
  };

  return (
    <div style={{minHeight:"100vh",background:"#f0f2f7",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#f5f7fa",border:"1px solid #e2e5ed",borderRadius:16,padding:"48px 40px",textAlign:"center",width:320}}>
        <div style={{fontWeight:900,fontSize:18,letterSpacing:4,color:"#c9a84c",marginBottom:6}}>IMPLANTDENT</div>
        <div style={{fontSize:11,color:"#444",letterSpacing:2,marginBottom:36}}>GESTIÓN DE PACIENTES</div>
        <form onSubmit={submit}>
          <input
            ref={pinRef}
            type="password" inputMode="numeric" maxLength={8} autoFocus
            defaultValue=""
            onChange={()=>setError(false)}
            placeholder="PIN"
            style={{
              background:"#ffffff", border:`1px solid ${error?"#e74c3c":"#dde4ef"}`,
              borderRadius:10, color:"#2c3250", padding:"14px 16px", fontSize:22,
              textAlign:"center", letterSpacing:10, width:"100%", outline:"none",
              boxSizing:"border-box", marginBottom:16,
              animation: shake ? "shake 0.4s" : "none",
            }}
          />
          {error && <div style={{color:"#e74c3c",fontSize:12,marginBottom:12}}>PIN incorrecto</div>}
          <button type="submit" disabled={loading} style={{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:8,color:"#fff",padding:"12px 0",cursor:"pointer",fontSize:14,fontWeight:700,width:"100%",opacity:loading?0.7:1}}>
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
const genId    = () => Math.random().toString(36).slice(2,10);
const today    = () => new Date().toISOString().split("T")[0];
const daysDiff = (d) => !d ? 999 : Math.floor((new Date()-new Date(d))/86400000);
const STATUSES = ["frío","pendiente","en curso","cerrado con deuda","cerrado sin deuda"];
const STATUS_COLOR = { "frío":"#7f8c8d", "pendiente":"#c9a84c", "en curso":"#3498db", "cerrado con deuda":"#e67e22", "cerrado sin deuda":"#2ecc71" };
const STATUS_LABEL = { "frío":"Frío", "pendiente":"Pendiente", "en curso":"En curso", "cerrado con deuda":"C/ deuda", "cerrado sin deuda":"Sin deuda" };
const isCerrado = (st) => st === "cerrado con deuda" || st === "cerrado sin deuda";
const getStatus = (p) => STATUSES.includes(p.status) ? p.status : (p.closed ? "cerrado con deuda" : "pendiente");
const fmtEur   = (v) => v && parseFloat(v) ? `€${parseFloat(v).toLocaleString("es-ES",{minimumFractionDigits:2})}` : "-";
const effectiveValue = (tr) => parseFloat(tr.value) || 0;

const getTxItems = (patient) => {
  const raw = patient.treatments;
  return Array.isArray(raw) ? raw : (raw?.items || []);
};
const getTxDiscountPct = (patient) => {
  const raw = patient.treatments;
  return Array.isArray(raw) ? 0 : (parseInt(raw?.discountPct) || 0);
};
const applyDiscount = (subtotal, pct) => {
  if (pct === 0 || subtotal === 0) return { discAmt: 0, grand: subtotal };
  const discAmt = parseFloat((subtotal - (subtotal / 1.1) * (1 - Math.max(0, pct - 10) / 100)).toFixed(2));
  return { discAmt, grand: parseFloat((subtotal - discAmt).toFixed(2)) };
};
const patientGrand = (patient) => {
  const items = getTxItems(patient);
  const pct   = getTxDiscountPct(patient);
  const sub   = items.reduce((a, t) => a + (parseFloat(t.value) || 0), 0);
  return applyDiscount(sub, pct).grand;
};
const fmtDate  = (s) => { if(!s) return ""; const [y,mo,d]=s.split("-"); return `${d}/${mo}/${y}`; };
const ordinal  = (n, lang) => {
  if (lang==="es") return `${n}ª Cita`;
  if (lang==="fr") return `${n}${n===1?"er":"ème"} Rendez-vous`;
  return `${n}${n===1?"st":n===2?"nd":n===3?"rd":"th"} Visit`;
};

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const fmtMonthLabel = (y, m) => `${MONTHS_ES[m]} ${y}`;

// ─── TRANSLATIONS ─────────────────────────────────────────────────────────────
const T = {
  es:{ budget:"PRESUPUESTO", patient:"Paciente", hc:"HC", budgetNo:"Nº Presupuesto", date:"Fecha",
       treatment:"Tratamiento", value:"Valor", discount:"Descuento", total:"Total",
       doctors:"Doctor(es)", appointment:"Fecha de Cita", payment:"Pago en Cita",
       subtotal:"Subtotal", totalDiscount:"Total Descuentos", grandTotal:"TOTAL",
       appointmentDetail:"CRONOGRAMA DE CITAS", notes:"Notas", toConfirm:"A confirmar" },
  en:{ budget:"QUOTE", patient:"Patient", hc:"HC", budgetNo:"Quote No.", date:"Date",
       treatment:"Treatment", value:"Value", discount:"Discount", total:"Total",
       doctors:"Doctor(s)", appointment:"Appointment Date", payment:"Payment at Visit",
       subtotal:"Subtotal", totalDiscount:"Total Discounts", grandTotal:"TOTAL",
       appointmentDetail:"APPOINTMENT SCHEDULE", notes:"Notes", toConfirm:"To be confirmed" },
  fr:{ budget:"DEVIS", patient:"Patient", hc:"HC", budgetNo:"Nº Devis", date:"Date",
       treatment:"Traitement", value:"Valeur", discount:"Remise", total:"Total",
       doctors:"Médecin(s)", appointment:"Date du RDV", payment:"Paiement à la Visite",
       subtotal:"Sous-total", totalDiscount:"Total Remises", grandTotal:"TOTAL",
       appointmentDetail:"CALENDRIER DES RDV", notes:"Notes", toConfirm:"À confirmer" },
};

const LEGAL = {
  es:`En virtud de la Ley 03/2018 sobre la protección de datos de carácter personal, le informamos que sus datos personales están incorporados en un fichero automatizado responsabilidad de CLINICA IMPLANTDENT, SL. La finalidad de este fichero es gestionar la relación profesional entre usted y esta consulta dental. Puede ejercer sus derechos de acceso, modificación, cancelación y oposición mediante escrito dirigido a C/NOU 63-65 - 17600 FIGUERES - GIRONA. Si en el plazo de 30 días no nos comunica lo contrario, entenderemos que los datos no han sido modificados, que se compromete a notificarnos cualquier variación y que tenemos su consentimiento para utilizarlos.`,
  en:`Pursuant to Law 03/2018 on personal data protection, we inform you that your personal data is stored in an automated file under the responsibility of CLINICA IMPLANTDENT, SL. The purpose is to manage the professional relationship between you and this dental practice. You may exercise your rights of access, modification, cancellation and opposition by writing to C/NOU 63-65 - 17600 FIGUERES - GIRONA. If within 30 days you do not notify us otherwise, we will understand the data has not changed and that we have your consent to use it.`,
  fr:`Conformément à la Loi 03/2018 sur la protection des données personnelles, vos données sont dans un fichier automatisé sous responsabilité de CLINICA IMPLANTDENT, SL. Vous pouvez exercer vos droits d'accès, modification, annulation et opposition à C/NOU 63-65 - 17600 FIGUERES - GIRONA. Sans réponse de votre part sous 30 jours, nous considérerons les données correctes et aurons votre consentement pour leur utilisation.`,
};
const CONSENT = {
  es:"He recibido una copia de este presupuesto y entendido lo que se detalla en él.",
  en:"I have received a copy of this quote and understood what is detailed in it.",
  fr:"J'ai reçu une copie de ce devis et compris ce qui y est détaillé.",
};
const SIG_LABEL = { es:"Firma Paciente", en:"Patient Signature", fr:"Signature du Patient" };

// ─── DATA SHAPES ──────────────────────────────────────────────────────────────
const emptyPatient = () => ({
  id:genId(), name:"", hc:"", dni:"", budgetNo:"", date:today(), time:"",
  treatments:[], appointments:[], notes:"",
  status:"pendiente", last_contact:today(), closed:false,
});
const emptyTx   = () => ({ id:genId(), name:"", value:"", discount:"0" });
const emptyAppt = () => ({ id:genId(), label:"", date:"", time:"", doctors:"", payment:"", treatmentIds:[] });

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = {
  card:    { background:"#f5f7fa", border:"1px solid #e2e5ed", borderRadius:12, padding:"16px 20px", marginBottom:10 },
  input:   { background:"#ffffff", border:"1px solid #dde4ef", borderRadius:8, color:"#2c3250", padding:"9px 12px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" },
  smInput: { background:"#ffffff", border:"1px solid #dde4ef", borderRadius:6, color:"#2c3250", padding:"7px 10px", fontSize:13, width:"100%", outline:"none", boxSizing:"border-box" },
  label:   { fontSize:11, color:"#c9a84c", letterSpacing:1, textTransform:"uppercase", display:"block", marginBottom:5 },
  btnGold: { background:"linear-gradient(135deg,#c9a84c,#a07830)", border:"none", borderRadius:8, color:"#fff", padding:"9px 22px", cursor:"pointer", fontSize:13, fontWeight:700 },
  btnDark: { background:"#dce8fa", border:"1px solid #c9a84c44", borderRadius:8, color:"#c9a84c", padding:"9px 16px", cursor:"pointer", fontSize:13, fontWeight:600 },
  btnGhost:{ background:"none", border:"1px solid #333", borderRadius:8, color:"#888", padding:"9px 20px", cursor:"pointer", fontSize:13 },
  btnSm:   { background:"#dce8fa", border:"1px solid #c9a84c33", borderRadius:6, color:"#c9a84c", padding:"4px 10px", cursor:"pointer", fontSize:12 },
};

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
const exportToPDF = async (patient, lang, setExporting, patPayments=[], templates=[]) => {
  if (setExporting) setExporting(lang);
  let treatments = [...getTxItems(patient)];
  const discPct = patient.discountPct !== undefined ? (parseInt(patient.discountPct)||0) : getTxDiscountPct(patient);
  const appointments = patient.appointments || [];
  treatments.sort((a,b) => a.name.localeCompare(b.name));
  if (lang !== "es" && treatments.length > 0) {
    treatments = treatments.map(tr => ({ ...tr, name: translateTreatment(tr.name, lang) }));
  }
  const t     = T[lang];
  const subtotal   = treatments.reduce((a,tr)=>a+(parseFloat(tr.value)||0),0);
  const { discAmt, grand } = applyDiscount(subtotal, discPct);
  const pdfFactor  = subtotal > 0 && discPct > 0 ? grand / subtotal : 1;
  const totalPaid  = (patPayments||[]).reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
  const remaining  = grand - totalPaid;
  const txRows = treatments.map(tr=>`
    <tr>
      <td>${tr.name}</td><td style="text-align:right">${fmtEur(parseFloat(tr.value||0) * pdfFactor)}</td>
    </tr>`).join("");
  const txMap = Object.fromEntries(treatments.map(tr=>[tr.id, tr]));
  const apptRows = appointments.map((appt, idx) => {
    const apptTxs = (appt.treatmentIds||[]).map(id => txMap[id]).filter(Boolean);
    const dateStr = appt.date ? `${fmtDate(appt.date)}${appt.time?" "+appt.time:""}` : t.toConfirm;
    const txGrid = apptTxs.length === 0 ? "-" :
      `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">` +
      apptTxs.slice(0,20).map(tr=>`<div style="font-size:10px;line-height:1.3;word-break:break-word">☐ ${tr.name}</div>`).join("") + `</div>`;
    return `<tr>
      <td style="font-weight:700;color:#1e2230;white-space:nowrap">${ordinal(idx+1, lang)}</td>
      <td style="white-space:nowrap">${dateStr}</td>
      <td style="white-space:nowrap">${appt.doctors || "-"}</td>
      <td style="padding:6px 12px">${txGrid}</td>
      <td style="white-space:nowrap">${fmtEur(appt.payment)}</td>
    </tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  *{box-sizing:border-box}body{font-family:'Georgia',serif;margin:36px 40px 60px;color:#1e2230;font-size:13px;line-height:1.8}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #c9a84c;padding-bottom:18px;margin-bottom:26px}
  .header-center{text-align:center;flex:1}.header-center h1{font-size:24px;letter-spacing:5px;margin:0 0 3px}
  .header-center p{color:#888;margin:0;font-size:12px}.logo{width:80px;height:auto}.spacer{width:80px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:26px}
  .info-item{display:flex;gap:6px}.lbl{font-weight:bold;color:#c9a84c;white-space:nowrap}
  table{width:100%;border-collapse:collapse;margin-bottom:26px}
  th{background:#1e2230;color:#ffffff;padding:10px 12px;text-align:left;font-size:14px;letter-spacing:1px;white-space:nowrap}
  td{padding:9px 12px;border-bottom:1px solid #eee;vertical-align:middle}tr:nth-child(even) td{background:#f9f8f5}
  .totals{margin-left:auto;width:290px;margin-bottom:26px}.tr{display:flex;justify-content:space-between;padding:6px 12px}
  .tr-grand{background:#1e2230;color:#c9a84c;font-weight:700;font-size:15px;border-radius:4px}
  .sec{font-size:11px;letter-spacing:3px;text-transform:uppercase;border-left:4px solid #c9a84c;padding-left:10px;margin:26px 0 12px;color:#1e2230}
  .notes-box{background:#f9f8f5;border-left:3px solid #c9a84c;padding:12px 14px;border-radius:4px;font-style:italic}
  .footer{margin-top:36px;border-top:1px solid #ddd;padding-top:18px}.consent{font-style:italic;margin-bottom:24px;color:#333}
  .sig-block{display:flex;align-items:flex-end;gap:10px;margin-bottom:28px}.sig-line{border-bottom:1px solid #1e2230;width:240px;height:44px}
  .sig-lbl{font-size:11px;color:#888;letter-spacing:1px}.legal{font-size:10px;color:#999;line-height:1.7;border-top:1px solid #eee;padding-top:12px}
  </style></head><body>
  <div class="header"><img src="http://localhost:5173/logo.png" class="logo" alt="Logo"/>
  <div class="header-center"><h1>${t.budget}</h1><p>${fmtDate(patient.date)}${patient.time?" · "+patient.time:""}</p></div>
  <div class="spacer"></div></div>
  <div class="info-grid">
    <div class="info-item"><span class="lbl">${t.patient}:</span> ${patient.name}</div>
    <div class="info-item"><span class="lbl">${t.budgetNo}:</span> ${patient.budget_no||patient.budgetNo||""}</div>
    <div class="info-item"><span class="lbl">${t.hc}:</span> ${patient.hc||""}</div>
    <div class="info-item"><span class="lbl">${t.date}:</span> ${fmtDate(patient.date)}</div>
    ${(patient.dni||patient.dni) ? `<div class="info-item"><span class="lbl">DNI:</span> ${patient.dni||""}</div>` : ""}
  </div>
  <table><thead><tr><th>${t.treatment}</th><th style="text-align:right">${t.total}</th></tr></thead>
  <tbody>${txRows}</tbody></table>
  <div class="totals">
    <div class="tr tr-grand"><span>${t.grandTotal}</span><span>${fmtEur(grand)}</span></div>
  </div>
  ${appointments.length > 0 ? `<div class="sec">${t.appointmentDetail}</div>
  <table><thead><tr><th>Cita</th><th>${t.appointment}</th><th>${t.doctors}</th><th>${t.treatment}</th><th>${t.payment}</th></tr></thead>
  <tbody>${apptRows}</tbody></table>` : ""}
  ${patPayments.length > 0 ? `
  <div class="sec">REGISTRO DE PAGOS</div>
  <table><thead><tr><th>Fecha</th><th>Nota</th><th style="text-align:right">Importe</th></tr></thead>
  <tbody>
    ${patPayments.map(pay=>`<tr><td>${fmtDate(pay.date)}</td><td>${pay.note||"-"}</td><td style="text-align:right;font-weight:600">${fmtEur(pay.amount)}</td></tr>`).join("")}
  </tbody></table>
  <div class="totals">
    <div class="tr"><span>Total pagado</span><span>${fmtEur(totalPaid)}</span></div>
    <div class="tr tr-grand"><span>SALDO PENDIENTE</span><span>${fmtEur(remaining < 0 ? 0 : remaining)}</span></div>
  </div>` : ""}
  ${patient.notes ? `<div class="sec">${t.notes}</div><div class="notes-box">${patient.notes}</div>` : ""}
  <div class="footer"><p class="consent">${CONSENT[lang]}</p>
  <div class="sig-block"><div class="sig-line"></div><span class="sig-lbl">${SIG_LABEL[lang]}</span></div>
  <div class="legal">${LEGAL[lang]}</div></div></body></html>`;
  if (setExporting) setExporting(null);
  const win = window.open("","_blank");
  win.document.write(html); win.document.close();
  win.document.title = (patient.hc||"") + "-" + (patient.name||"");
  setTimeout(()=>win.print(), 800);
};

// ─── TreatmentRow ─────────────────────────────────────────────────────────────
function TreatmentRow({ tr, onChange, onRemove, discFactor=1 }) {
  const discVal = discFactor !== 1 ? parseFloat(tr.value||0) * discFactor : null;
  return (
    <div style={{...s.card, padding:"12px 14px", position:"relative", marginBottom:8}}>
      <div style={{display:"grid", gridTemplateColumns:"2.5fr 1fr", gap:8}}>
        <input placeholder="Tratamiento" value={tr.name} onChange={e=>onChange("name",e.target.value)} style={s.smInput}/>
        <div>
          <input type="number" placeholder="Importe €" value={tr.value} onChange={e=>onChange("value",e.target.value)} style={s.smInput}/>
          {discVal !== null && (
            <div style={{fontSize:11,color:"#2ecc71",marginTop:3,textAlign:"right",fontWeight:600}}>con desc.: {fmtEur(discVal)}</div>
          )}
        </div>
      </div>
      <button onClick={onRemove} style={{position:"absolute",top:8,right:8,background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:15,lineHeight:1}}>✕</button>
    </div>
  );
}

// ─── AppointmentRow ───────────────────────────────────────────────────────────
function AppointmentRow({ appt, idx, treatments, allAppointments, onChange, onRemove }) {
  const si = (f, ph, type="text") => (
    <div style={{display:"flex",flexDirection:"column",gap:3}}>
      <label style={{...s.label, fontSize:10}}>{ph}</label>
      <input type={type} placeholder={ph} value={appt[f]} onChange={e=>onChange(f,e.target.value)} style={s.smInput}/>
    </div>
  );
  const toggleTx = (id) => {
    const ids = appt.treatmentIds||[];
    onChange("treatmentIds", ids.includes(id) ? ids.filter(x=>x!==id) : [...ids, id]);
  };
  return (
    <div style={{background:"#ffffff",border:"1px solid #c9a84c33",borderRadius:10,padding:"14px 16px",marginBottom:10,position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{background:"#c9a84c",color:"#f0f2f7",borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:800}}>{idx+1}ª CITA</span>
        <div style={{flex:1,height:1,background:"#e2e5ed"}}/>
        <button onClick={onRemove} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:15}}>✕</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {si("date","Fecha","date")}{si("time","Hora","time")}{si("doctors","Doctor(es)")}{si("payment","Pago €","number")}
      </div>
      <div>
        <label style={{...s.label, fontSize:10, marginBottom:6}}>Tratamientos en esta cita</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {treatments.length===0 && <span style={{color:"#444",fontSize:12}}>Primero agregá tratamientos arriba</span>}
          {treatments.map(tr=>{
            const sel = (appt.treatmentIds||[]).includes(tr.id);
            const usedCount = (allAppointments||[]).filter(a => a.id !== appt.id && (a.treatmentIds||[]).includes(tr.id)).length;
            return (
              <button key={tr.id} onClick={()=>toggleTx(tr.id)}
                style={{background:sel?"#c9a84c":"#f5f7fa",border:`1px solid ${sel?"#c9a84c":"#dde4ef"}`,borderRadius:20,color:sel?"#f0f2f7":"#888",padding:"4px 12px",cursor:"pointer",fontSize:12,transition:"all 0.15s",display:"inline-flex",alignItems:"center",gap:6}}>
                {tr.name||"Sin nombre"}
                {usedCount > 0 && (
                  <span style={{background:sel?"#f0f2f7":"#c9a84c",color:sel?"#c9a84c":"#f0f2f7",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,flexShrink:0}}>{usedCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── PatientForm ──────────────────────────────────────────────────────────────
function PatientForm({ patient, onSave, onCancel, templates, payments=[], onPaymentsChange=null, isNew=false }) {
  const [p, setP] = useState(() => {
    const raw = patient.treatments;
    const items = Array.isArray(raw) ? raw : (raw?.items || []);
    const discountPct = Array.isArray(raw) ? "0" : (raw?.discountPct || "0");
    return { ...patient, treatments: items, discountPct };
  });
  const [msg, setMsg]       = useState("");
  const [loading, setL]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExp] = useState(null);
  const [tab, setTab]       = useState("treatments");
  const [payDate, setPayDate]     = useState(today());
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote]     = useState("");
  const [payLoading, setPayL]     = useState(false);
  const fileRef             = useRef();

  const treatmentsKey = p.treatments.map(t => t.name).join("|");
  useEffect(() => {
    if (!templates || templates.length === 0 || p.treatments.length === 0) return;
    const matchingBlocks = templates
      .filter(tmpl => p.treatments.some(tx => tx.name.toLowerCase().includes(tmpl.keyword.toLowerCase())))
      .map(tmpl => tmpl.text_block);
    if (matchingBlocks.length === 0) return;
    setP(prev => {
      const current = prev.notes || "";
      const toAdd = matchingBlocks.filter(b => !current.includes(b));
      if (toAdd.length === 0) return prev;
      return { ...prev, notes: (current.trim() ? current.trim() + "\n\n" : "") + toAdd.join("\n\n") };
    });
  }, [treatmentsKey]);

  const setF    = (f,v) => setP(prev=>({...prev,[f]:v}));
  const addTx   = () => setP(prev=>({...prev, treatments:[...prev.treatments, emptyTx()]}));
  const updTx   = (id,f,v) => setP(prev=>({...prev, treatments:prev.treatments.map(t=>t.id===id?{...t,[f]:v}:t)}));
  const remTx   = (id) => setP(prev=>({...prev, treatments:prev.treatments.filter(t=>t.id!==id)}));
  const addAppt = () => setP(prev=>({...prev, appointments:[...prev.appointments, emptyAppt()]}));
  const updAppt = (id,f,v) => setP(prev=>({...prev, appointments:prev.appointments.map(a=>a.id===id?{...a,[f]:v}:a)}));
  const remAppt = (id) => setP(prev=>({...prev, appointments:prev.appointments.filter(a=>a.id!==id)}));

  const subtotal   = p.treatments.reduce((a,t)=>a+(parseFloat(t.value)||0),0);
  const discPct    = parseInt(p.discountPct)||0;
  const { discAmt, grand } = applyDiscount(subtotal, discPct);
  const discFactor = subtotal > 0 && discPct > 0 ? grand / subtotal : 1;

  const patPayments = payments.filter(pay => pay.patient_id === p.id);
  const totalPaid   = patPayments.reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
  const pendingBal  = grand - totalPaid;

  const addPayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) return;
    setPayL(true);
    await supabase.from("payments").insert([{
      id: genId(), patient_id: p.id,
      amount: parseFloat(payAmount), date: payDate || today(), note: payNote.trim() || ""
    }]);
    setPayAmount(""); setPayNote("");
    if (onPaymentsChange) await onPaymentsChange();
    setPayL(false);
  };

  const deletePayment = async (payId) => {
    if (!confirm("¿Eliminar este pago?")) return;
    await supabase.from("payments").delete().eq("id", payId);
    if (onPaymentsChange) await onPaymentsChange();
  };

  const handlePDF = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    setL(true); setMsg("Leyendo PDF...");
    try {
      const parsed = await parsePDF(file);
      setP(prev=>({...prev, name:parsed.name||prev.name, hc:parsed.hc||prev.hc,
        dni:parsed.dni||prev.dni, budgetNo:parsed.budgetNo||prev.budgetNo, date:parsed.date||prev.date,
        phone:parsed.phone||prev.phone,
        treatments:parsed.treatments.length?parsed.treatments:prev.treatments }));
      setMsg(`✓ ${parsed.treatments.length} tratamiento(s) importados`);
    } catch(e) { setMsg("Error al leer el PDF — completá manualmente"); }
    setL(false); e.target.value="";
  };

  const Field = ({label, field, type="text"}) => (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={s.label}>{label}</label>
      <input type={type} value={p[field]||""} onChange={e=>setF(field,e.target.value)} style={s.input}
        onFocus={e=>e.target.style.borderColor="#c9a84c"}
        onBlur={e=>e.target.style.borderColor="#dde4ef"}/>
    </div>
  );

  return (
    <div style={{maxWidth:920,margin:"0 auto"}}>
      <div style={{...s.card, border:"2px dashed #c9a84c33", display:"flex", alignItems:"center", gap:16, marginBottom:20}}>
        <button onClick={()=>fileRef.current.click()} disabled={loading} style={{...s.btnGold, opacity:loading?0.6:1, whiteSpace:"nowrap"}}>
          {loading?"⏳ Leyendo...":"📄 Importar PDF"}
        </button>
        <input ref={fileRef} type="file" accept=".pdf" onChange={handlePDF} style={{display:"none"}}/>
        <span style={{fontSize:13, color:msg.startsWith("✓")?"#2ecc71":msg.startsWith("Error")?"#e74c3c":"#555"}}>
          {msg||"Importá un presupuesto PDF o completá manualmente"}
        </span>
      </div>
      <div style={{...s.card, marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:14,marginBottom:14}}>
          <Field label="Nombre del paciente" field="name"/>
          <Field label="Expediente / HC" field="hc"/>
          <Field label="DNI" field="dni"/>
          <Field label="Nº Presupuesto" field="budgetNo"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
          <Field label="Fecha" field="date" type="date"/>
          <Field label="Hora" field="time" type="time"/>
          <Field label="Teléfono" field="phone" type="tel"/>
        </div>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:0,background:"#ffffff",borderRadius:10,padding:4}}>
          {[["treatments","Tratamientos"],["appointments","Citas"],["payments","Pagos"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{background:tab===id?"#dce8fa":"none",border:"none",borderRadius:8,color:tab===id?"#c9a84c":"#555",padding:"8px 20px",cursor:"pointer",fontSize:13,fontWeight:tab===id?700:400,transition:"all 0.15s"}}>
              {label}
              {id==="appointments" && p.appointments.length>0 &&
                <span style={{background:"#c9a84c",color:"#f0f2f7",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,marginLeft:6}}>{p.appointments.length}</span>}
              {id==="payments" && patPayments.length>0 &&
                <span style={{background:"#e74c3c",color:"#fff",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,marginLeft:6}}>{patPayments.length}</span>}
            </button>
          ))}
        </div>
        <select value={p.discountPct||"0"} onChange={e=>setF("discountPct",e.target.value)}
          style={{...s.smInput, width:"auto", minWidth:180, cursor:"pointer"}}>
          <option value="0">Sin descuento</option>
          <option value="10">Descuento 10%</option>
          <option value="15">Descuento 15%</option>
          <option value="20">Descuento 20%</option>
          <option value="25">Descuento 25%</option>
        </select>
      </div>
      {tab==="treatments" && (
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={s.label}>Tratamientos (se ordenan por nombre en el PDF)</span>
            <button onClick={addTx} style={s.btnDark}>+ Agregar</button>
          </div>
          {p.treatments.length===0 && (
            <div style={{textAlign:"center",color:"#333",padding:24,background:"#ffffff",borderRadius:10,fontSize:13}}>Sin tratamientos — importá un PDF o agregá manualmente</div>
          )}
          {p.treatments.map(tr=>(<TreatmentRow key={tr.id} tr={tr} onChange={(f,v)=>updTx(tr.id,f,v)} onRemove={()=>remTx(tr.id)} discFactor={discFactor}/>))}
          {p.treatments.length>0 && (
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
              <div style={{background:"#dce8fa",borderRadius:8,minWidth:220,overflow:"hidden"}}>
                {discPct>0 && (<>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",color:"#888",fontSize:13}}>
                    <span>Subtotal</span><span>{fmtEur(subtotal)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",color:"#e74c3c",fontSize:13}}>
                    <span>Descuento {discPct}%</span><span>-{fmtEur(discAmt)}</span>
                  </div>
                </>)}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",color:"#c9a84c",fontWeight:700,fontSize:15}}>
                  <span>TOTAL</span><span>{fmtEur(grand)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {tab==="appointments" && (
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={s.label}>Cronograma de citas</span>
            <button onClick={addAppt} style={s.btnDark}>+ Agregar cita</button>
          </div>
          {p.appointments.length===0 && (
            <div style={{textAlign:"center",color:"#333",padding:24,background:"#ffffff",borderRadius:10,fontSize:13}}>Sin citas — agregá la primera cita y asignale tratamientos</div>
          )}
          {p.appointments.map((appt,idx)=>(
            <AppointmentRow key={appt.id} appt={appt} idx={idx} treatments={p.treatments}
              allAppointments={p.appointments} onChange={(f,v)=>updAppt(appt.id,f,v)} onRemove={()=>remAppt(appt.id)}/>
          ))}
        </div>
      )}
      {tab==="payments" && (
        <div style={{marginBottom:16}}>
          {isNew ? (
            <div style={{textAlign:"center",color:"#555",padding:40,background:"#ffffff",borderRadius:10,fontSize:13}}>
              Guardá el presupuesto primero para poder registrar pagos
            </div>
          ) : (
            <>
              <div style={{...s.card, marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,textAlign:"center"}}>
                  {[["Total presupuesto",fmtEur(grand),"#c9a84c"],["Total pagado",fmtEur(totalPaid),"#2ecc71"],["Saldo pendiente",fmtEur(pendingBal<0?0:pendingBal),pendingBal>0?"#e74c3c":"#2ecc71"]].map(([label,value,color])=>(
                    <div key={label}>
                      <div style={{fontSize:10,color:"#555",letterSpacing:1,marginBottom:4}}>{label.toUpperCase()}</div>
                      <div style={{fontSize:20,fontWeight:800,color}}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{...s.card, border:"1px solid #c9a84c33", marginBottom:12}}>
                <div style={{fontSize:10,color:"#c9a84c",letterSpacing:1,fontWeight:700,marginBottom:10}}>REGISTRAR NUEVO PAGO</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr auto",gap:10,alignItems:"flex-end"}}>
                  <div>
                    <label style={s.label}>Fecha</label>
                    <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} style={s.smInput}/>
                  </div>
                  <div>
                    <label style={s.label}>Importe €</label>
                    <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="0.00" style={s.smInput}/>
                  </div>
                  <div>
                    <label style={s.label}>Nota (opcional)</label>
                    <input type="text" value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="Descripción del pago..." style={s.smInput}/>
                  </div>
                  <button onClick={addPayment} disabled={payLoading||!payAmount||parseFloat(payAmount)<=0}
                    style={{...s.btnGold,opacity:(payLoading||!payAmount||parseFloat(payAmount)<=0)?0.5:1}}>
                    {payLoading?"...":"+ Agregar"}
                  </button>
                </div>
              </div>
              {patPayments.length === 0
                ? <div style={{textAlign:"center",color:"#333",padding:28,background:"#ffffff",borderRadius:10,fontSize:13}}>Sin pagos registrados</div>
                : patPayments.map(pay=>(
                  <div key={pay.id} style={{...s.card,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div>
                      <span style={{color:"#c9a84c",fontWeight:700,marginRight:12}}>{fmtEur(pay.amount)}</span>
                      <span style={{color:"#888",fontSize:12}}>{fmtDate(pay.date)}</span>
                      {pay.note && <span style={{color:"#555",fontSize:12,marginLeft:8}}>— {pay.note}</span>}
                    </div>
                    <button onClick={()=>deletePayment(pay.id)}
                      style={{...s.btnSm,background:"#fff0f0",border:"1px solid #e74c3c88",color:"#e74c3c"}}>
                      Eliminar
                    </button>
                  </div>
                ))
              }
            </>
          )}
        </div>
      )}
      <div style={{marginBottom:20}}>
        <div style={{marginBottom:5}}>
          <label style={{...s.label,marginBottom:0}}>Notas / Observaciones</label>
        </div>
        <textarea value={p.notes||""} onChange={e=>setF("notes",e.target.value)} rows={3}
          placeholder="Observaciones, indicaciones..." style={{...s.input, resize:"vertical"}}/>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        {["es","en","fr"].map(lang=>(
          <button key={lang} onClick={()=>exportToPDF(p,lang,setExp,patPayments,templates)} disabled={!!exporting}
            style={{...s.btnDark, opacity:exporting?0.6:1, cursor:exporting?"not-allowed":"pointer"}}>
            {exporting===lang?"⏳ Traduciendo...":`🖨 PDF ${lang.toUpperCase()}`}
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={onCancel} style={s.btnGhost}>Cancelar</button>
        <button onClick={async()=>{setSaving(true);await onSave(p);setSaving(false);}} disabled={saving}
          style={{...s.btnGold, opacity:saving?0.7:1}}>
          {saving?"Guardando...":"Guardar paciente"}
        </button>
      </div>
    </div>
  );
}

// ─── AlertCard ────────────────────────────────────────────────────────────────
function AlertCard({ patient, onOpen }) {
  const days = daysDiff(patient.last_contact);
  let level="", msg="";
  if      (days>=15){level="critical";msg=`${days}d sin contacto — Último aviso`;}
  else if (days>=7) {level="error";   msg=`${days}d sin contacto — 2º aviso`;}
  else if (days>=4) {level="warn";    msg=`${days}d sin contacto — 1º aviso`;}
  if(!level) return null;
  const c={warn:"#f39c12",error:"#e74c3c",critical:"#8e44ad"}[level];
  return (
    <div onClick={()=>onOpen(patient)}
      style={{background:"#f5f7fa",border:`1px solid ${c}44`,borderLeft:`4px solid ${c}`,borderRadius:10,padding:"12px 16px",cursor:"pointer",marginBottom:8}}
      onMouseEnter={e=>e.currentTarget.style.background="#e2e5ed"}
      onMouseLeave={e=>e.currentTarget.style.background="#f5f7fa"}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:"#2c3250",fontWeight:600}}>{patient.name}</span>
        <span style={{fontSize:11,color:c,fontWeight:700,letterSpacing:1}}>{msg.toUpperCase()}</span>
      </div>
      <div style={{fontSize:12,color:"#555",marginTop:3}}>Presupuesto #{patient.budget_no} — Tocá para abrir</div>
    </div>
  );
}

// ─── PatientCard ──────────────────────────────────────────────────────────────
function PatientCard({ patient, onEdit, onSetStatus, onDelete, patientPayments=[], onOpen=null, templates=[] }) {
  const [exporting, setExp] = useState(null);
  const [recalled, setRecalled] = useState(() => localStorage.getItem(`recalled_${patient.id}`) === "1");
  const grand = patientGrand(patient);
  const totalPaid = patientPayments.reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
  const hasPending = patientPayments.length > 0 && totalPaid < grand;
  const days = daysDiff(patient.last_contact);
  const status = getStatus(patient);
  let bc;
  if (isCerrado(status)) bc = STATUS_COLOR[status];
  else if (status === "frío") bc = "#7f8c8d";
  else if (status === "en curso") bc = "#3498db";
  else { if(days>=30) bc="#8e44ad"; else if(days>=15) bc="#e74c3c"; else if(days>=7) bc="#f39c12"; else bc="#c9a84c44"; }
  return (
    <div style={{...s.card, borderLeft:`4px solid ${bc}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div onClick={onOpen?()=>onOpen(patient):undefined}
          style={{flex:1, cursor:onOpen?"pointer":"default"}}>
          <div style={{fontWeight:700,color:"#2c3250",fontSize:15}}>{patient.name||"Sin nombre"}</div>
          <div style={{fontSize:12,color:"#555",marginTop:2}}>HC: {patient.hc||"—"} · #{patient.budget_no||"—"} · {fmtDate(patient.date)}</div>
          <div style={{fontSize:12,color:"#777",marginTop:4}}>
            {getTxItems(patient).length} tratamiento(s) · {(patient.appointments||[]).length} cita(s) · <span style={{color:"#c9a84c",fontWeight:600}}>{fmtEur(grand)}</span>
            {hasPending && <span style={{color:"#e74c3c",marginLeft:8,fontWeight:600}}>· Deuda: {fmtEur(grand-totalPaid)}</span>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
          <div style={{display:"flex",gap:5}}>
            {["es","en","fr"].map(lang=>(
              <button key={lang} onClick={()=>exportToPDF(patient,lang,setExp,patientPayments,templates)} disabled={!!exporting} title={`PDF ${lang.toUpperCase()}`}
                style={{...s.btnSm, opacity:exporting?0.6:1, cursor:exporting?"not-allowed":"pointer"}}>
                {exporting===lang?"⏳":lang.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:4}}>
            {STATUSES.map(st=>(
              <button key={st} onClick={()=>onSetStatus(patient,st)}
                style={{background:status===st?STATUS_COLOR[st]+"22":"#ffffff",border:`1px solid ${status===st?STATUS_COLOR[st]:"#333"}`,borderRadius:6,color:status===st?STATUS_COLOR[st]:"#555",padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:status===st?700:400}}>
                {STATUS_LABEL[st]}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setRecalled(r=>{ const next=!r; next ? localStorage.setItem(`recalled_${patient.id}`,"1") : localStorage.removeItem(`recalled_${patient.id}`); return next; })} title="Recordatorio de rellamada"
              style={{background:recalled?"#c9a84c22":"#ffffff",border:`1px solid ${recalled?"#c9a84c":"#bbb"}`,borderRadius:6,color:recalled?"#c9a84c":"#bbb",padding:"5px 9px",cursor:"pointer",fontSize:12,fontWeight:700,transition:"all 0.15s"}}>
              R
            </button>
            {patient.phone && (
              <a href={`https://wa.me/${(n=>/^[6789]\d{8}$/.test(n)?"34"+n:n)(patient.phone.replace(/\D/g,""))}`} target="_blank" rel="noreferrer"
                title={`WhatsApp ${patient.phone}`}
                style={{background:"#25d36622",border:"1px solid #25d36688",borderRadius:6,color:"#25d366",padding:"5px 9px",cursor:"pointer",fontSize:14,fontWeight:700,textDecoration:"none",display:"inline-flex",alignItems:"center",lineHeight:1}}>
                &#x1F4AC;
              </a>
            )}
            <button onClick={()=>onEdit(patient)} style={{...s.btnDark,padding:"5px 12px",fontSize:12}}>Editar</button>
            <button onClick={()=>onDelete(patient)}
              style={{...s.btnSm,background:"#fff0f0",border:"1px solid #e74c3c88",color:"#e74c3c",padding:"5px 12px",fontSize:12}}>
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MonthNav ─────────────────────────────────────────────────────────────────
function MonthNav({ year, month, onChange }) {
  const prev = () => { if (month === 0) onChange(year-1, 11); else onChange(year, month-1); };
  const next = () => {
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth()) return;
    if (month === 11) onChange(year+1, 0); else onChange(year, month+1);
  };
  const now = new Date();
  const isNow = year === now.getFullYear() && month === now.getMonth();
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,background:"#f5f7fa",borderRadius:10,padding:"8px 14px",border:"1px solid #e2e5ed"}}>
      <button onClick={prev} style={{background:"none",border:"none",color:"#c9a84c",cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px"}}>‹</button>
      <span style={{color:"#2c3250",fontWeight:700,fontSize:14,minWidth:160,textAlign:"center"}}>{fmtMonthLabel(year, month)}</span>
      <button onClick={next} style={{background:"none",border:"none",color:isNow?"#333":"#c9a84c",cursor:isNow?"default":"pointer",fontSize:18,lineHeight:1,padding:"0 4px"}} disabled={isNow}>›</button>
    </div>
  );
}

// ─── EstadisticasPanel ───────────────────────────────────────────────────────
function EstadisticasPanel({ payments, items, patients, onOpenPatient, onRefreshItems, onSync }) {
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth();
  const [from,         setFrom]   = useState(`${y}-${String(mo+1).padStart(2,"0")}-01`);
  const [to,           setTo]     = useState(now.toISOString().split("T")[0]);
  const [activeDetail, setDetail] = useState(null);
  const [busy,         setBusy]   = useState(null);
  const [syncing,      setSyncing] = useState(false);

  useEffect(() => {
    setSyncing(true);
    onSync().finally(() => setSyncing(false));
  }, []);

  const inRange = (d) => {
    if (!d) return false;
    const ds = d.slice(0, 10);
    return ds >= from && ds <= to;
  };

  // Pagos: filtrados por rango de fechas
  const rangePayments = payments.filter(pay => inRange(pay.date));
  const totalPaid     = rangePayments.reduce((a,p) => a + (parseFloat(p.amount)||0), 0);

  // Implantes y ortodoncia: TODOS los items, sin filtro de fecha
  const implantRx    = /implant/i;
  const implantItems = items.filter(i => implantRx.test(i.treatment_name || ""));
  let implantTotal   = 0;
  implantItems.forEach(item => {
    if (!item.realized_date) return;
    const m = (item.treatment_name||"").match(/(\d+)\s*implante/i);
    implantTotal += m ? parseInt(m[1]) : 1;
  });

  const orthoRx    = /ortodoncia|orthodontic|invisalign|invisaling|invisible\s|ortod/i;
  const orthoItems = items.filter(i => orthoRx.test(i.treatment_name || ""));
  const orthoTotal = orthoItems.filter(i => i.realized_date).length;

  const findPatient = (id) => patients.find(p => p.id === id);

  const deleteItem = async (e, itemId) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar este item de estadísticas? No afecta el presupuesto del paciente.")) return;
    setBusy(itemId);
    await supabase.from("treatment_items").delete().eq("id", itemId);
    await onRefreshItems();
    setBusy(null);
  };

  const toggleRealized = async (e, item) => {
    e.stopPropagation();
    setBusy(item.id);
    const newDate = item.realized_date ? null : today();
    await supabase.from("treatment_items").update({ realized_date: newDate }).eq("id", item.id);
    await onRefreshItems();
    setBusy(null);
  };

  const toggle = (id) => setDetail(prev => prev === id ? null : id);

  const printStats = () => {
    const periodo = `${fmtDate(from)} — ${fmtDate(to)}`;

    const payRows = rangePayments.map(pay => {
      const pat  = findPatient(pay.patient_id);
      const hc   = pat?.hc || "—";
      const name = pat?.name || "Eliminado";
      const note = pay.note ? ` (${pay.note})` : "";
      return `<tr><td>${hc}</td><td>${name}</td><td>${fmtDate(pay.date)}</td><td style="text-align:right">${fmtEur(pay.amount)}${note}</td></tr>`;
    }).join("");

    const implantRows = implantItems.map(item => {
      const pat  = findPatient(item.patient_id);
      const hc   = item.hc || pat?.hc || "—";
      const name = item.patient_name || pat?.name || "—";
      const estado = item.realized_date ? "Realizado" : "Pendiente";
      return `<tr><td>${hc}</td><td>${name}</td><td>${item.treatment_name}</td><td>${estado}</td></tr>`;
    }).join("");

    const orthoRows = orthoItems.map(item => {
      const pat  = findPatient(item.patient_id);
      const hc   = item.hc || pat?.hc || "—";
      const name = item.patient_name || pat?.name || "—";
      const estado = item.realized_date ? "Realizado" : "Pendiente";
      return `<tr><td>${hc}</td><td>${name}</td><td>${item.treatment_name}</td><td>${estado}</td></tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Estadísticas ${periodo}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; color: #111; padding: 32px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .periodo { color: #666; margin-bottom: 28px; font-size: 13px; }
  .resumen { display: flex; gap: 24px; margin-bottom: 32px; }
  .stat { border-top: 3px solid; padding: 12px 18px; min-width: 140px; }
  .stat .val { font-size: 26px; font-weight: 800; }
  .stat .lbl { font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
  h2 { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin: 28px 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; padding: 6px 8px; border-bottom: 2px solid #ddd; }
  td { padding: 7px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .none { color: #aaa; font-style: italic; padding: 12px 0; }
  @media print { body { padding: 16px; } }
</style></head><body>
<h1>IMPLANTDENT — Estadísticas</h1>
<div class="periodo">Período: ${periodo}</div>

<div class="resumen">
  <div class="stat" style="border-color:#2ecc71">
    <div class="val" style="color:#2ecc71">${fmtEur(totalPaid)}</div>
    <div class="lbl">Pagos recibidos (${rangePayments.length})</div>
  </div>
  <div class="stat" style="border-color:#3498db">
    <div class="val" style="color:#3498db">${implantTotal}</div>
    <div class="lbl">Implantes realizados (${implantItems.length} en lista)</div>
  </div>
  <div class="stat" style="border-color:#9b59b6">
    <div class="val" style="color:#9b59b6">${orthoTotal}</div>
    <div class="lbl">Ortodoncia realizada (${orthoItems.length} en lista)</div>
  </div>
</div>

<h2>Pagos</h2>
${rangePayments.length === 0
  ? '<div class="none">Sin pagos en este período</div>'
  : `<table><thead><tr><th>HC</th><th>Paciente</th><th>Fecha</th><th>Importe</th></tr></thead><tbody>${payRows}</tbody></table>`}

<h2>Implantes</h2>
${implantItems.length === 0
  ? '<div class="none">Sin implantes en este período</div>'
  : `<table><thead><tr><th>HC</th><th>Paciente</th><th>Tratamiento</th><th>Estado</th></tr></thead><tbody>${implantRows}</tbody></table>`}

<h2>Ortodoncia</h2>
${orthoItems.length === 0
  ? '<div class="none">Sin ortodoncia en este período</div>'
  : `<table><thead><tr><th>HC</th><th>Paciente</th><th>Tratamiento</th><th>Estado</th></tr></thead><tbody>${orthoRows}</tbody></table>`}

</body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const StatCard = ({ id, label, value, sub, color }) => {
    const active = activeDetail === id;
    return (
      <div onClick={() => toggle(id)}
        style={{background: active ? color+"18" : "#f5f7fa", borderRadius:10, padding:"20px 22px",
          borderTop:`3px solid ${color}`, border: active ? `1px solid ${color}55` : "1px solid #e2e5ed",
          cursor:"pointer", transition:"background 0.15s"}}
        onMouseEnter={e => { if(!active) e.currentTarget.style.background="#e2e5ed"; }}
        onMouseLeave={e => { if(!active) e.currentTarget.style.background="#f5f7fa"; }}>
        <div style={{fontSize:34,fontWeight:800,color,lineHeight:1}}>{value}</div>
        <div style={{fontSize:12,color:"#777",marginTop:5}}>{sub}</div>
        <div style={{fontSize:11,color:"#444",marginTop:6,letterSpacing:1,textTransform:"uppercase"}}>{label}</div>
        <div style={{fontSize:11,color:active?color:"#555",marginTop:10}}>{active?"▲ Ocultar":"▼ Ver detalle"}</div>
      </div>
    );
  };

  const ItemRow = ({ item, qty }) => {
    const pat       = findPatient(item.patient_id);
    const name      = item.patient_name || pat?.name || "—";
    const realizado = !!item.realized_date;
    const loading   = busy === item.id;
    return (
      <div style={{...s.card, marginBottom:6, opacity: loading ? 0.5 : 1}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <div onClick={() => pat && onOpenPatient(pat)}
            style={{flex:1, cursor: pat ? "pointer" : "default"}}>
            <div style={{fontWeight:700, color:"#2c3250", fontSize:14}}>{name}</div>
            <div style={{fontSize:12, color:"#777", marginTop:2}}>
              {item.treatment_name}{qty > 1 ? ` · ${qty} uds` : ""} · {fmtEur(item.amount)}
            </div>
          </div>
          <div style={{display:"flex", gap:6, alignItems:"center", flexShrink:0, marginLeft:12}}>
            <button onClick={e => toggleRealized(e, item)} disabled={loading}
              style={{background: realizado ? "#2ecc7122" : "#ffffff",
                border: `1px solid ${realizado ? "#2ecc71" : "#555"}`,
                borderRadius:6, color: realizado ? "#2ecc71" : "#888",
                padding:"4px 10px", cursor:"pointer", fontSize:11, fontWeight:700}}>
              {realizado ? "Realizado" : "Pendiente"}
            </button>
            {pat && <span onClick={() => onOpenPatient(pat)} style={{color:"#c9a84c",fontSize:20,lineHeight:1,cursor:"pointer"}}>›</span>}
            <button onClick={e => deleteItem(e, item.id)} disabled={loading}
              style={{background:"#fff0f0", border:"1px solid #e74c3c88", borderRadius:6,
                color:"#e74c3c", padding:"4px 8px", cursor:"pointer", fontSize:12, fontWeight:700}}>
              ×
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700}}>📊 ESTADÍSTICAS</div>
        {syncing && <div style={{fontSize:11,color:"#555"}}>Sincronizando...</div>}
        <div style={{flex:1}}/>
        <button onClick={printStats} style={{...s.btnDark, fontSize:12, padding:"6px 16px"}}>🖨 Imprimir</button>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:28,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div>
          <label style={s.label}>Desde</label>
          <input type="date" value={from} onChange={e=>{setFrom(e.target.value);setDetail(null);}} style={{...s.input,width:160}}/>
        </div>
        <div>
          <label style={s.label}>Hasta</label>
          <input type="date" value={to} onChange={e=>{setTo(e.target.value);setDetail(null);}} style={{...s.input,width:160}}/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
        <StatCard id="pagos"      label="Pagos recibidos" value={fmtEur(totalPaid)} sub={`${rangePayments.length} pago(s)`} color="#2ecc71"/>
        <StatCard id="implantes"  label="Implantes"        value={implantTotal}      sub={`${implantItems.filter(i=>!i.realized_date).length} pendiente(s)`} color="#3498db"/>
        <StatCard id="ortodoncia" label="Ortodoncia"       value={orthoTotal}        sub={`${orthoItems.filter(i=>!i.realized_date).length} pendiente(s)`}  color="#9b59b6"/>
      </div>

      {activeDetail === "pagos" && (
        <div>
          <div style={{fontSize:11,color:"#2ecc71",letterSpacing:2,marginBottom:12,fontWeight:700}}>PAGOS — {fmtDate(from)} al {fmtDate(to)}</div>
          {rangePayments.length === 0
            ? <div style={{color:"#555",padding:20,textAlign:"center"}}>Sin pagos en este período</div>
            : rangePayments.map(pay => {
                const pat     = findPatient(pay.patient_id);
                const name    = pat?.name || "Paciente eliminado";
                const noteStr = pay.note ? ` · ${pay.note}` : "";
                return (
                  <div key={pay.id} onClick={() => pat && onOpenPatient(pat)}
                    style={{...s.card, cursor: pat?"pointer":"default", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}
                    onMouseEnter={e => { if(pat) e.currentTarget.style.background="#e2e5ed"; }}
                    onMouseLeave={e => { if(pat) e.currentTarget.style.background="#f5f7fa"; }}>
                    <div>
                      <div style={{fontWeight:700,color:"#2c3250",fontSize:14}}>{name}</div>
                      <div style={{fontSize:12,color:"#777",marginTop:2}}>{fmtDate(pay.date)} · {fmtEur(pay.amount)}{noteStr}</div>
                    </div>
                    {pat && <span style={{color:"#c9a84c",fontSize:20,lineHeight:1}}>›</span>}
                  </div>
                );
              })
          }
        </div>
      )}

      {activeDetail === "implantes" && (
        <div>
          <div style={{fontSize:11,color:"#3498db",letterSpacing:2,marginBottom:8,fontWeight:700}}>IMPLANTES — TODOS LOS TRATAMIENTOS</div>
          <div style={{fontSize:12,color:"#555",marginBottom:12}}>Marcá "Realizado" para sumar al contador. Eliminá falsos positivos con ×.</div>
          {implantItems.length === 0
            ? <div style={{color:"#555",padding:20,textAlign:"center"}}>Sin implantes en este período</div>
            : implantItems.map(item => {
                const m = (item.treatment_name||"").match(/(\d+)\s*implante/i);
                return <ItemRow key={item.id} item={item} qty={m ? parseInt(m[1]) : 1}/>;
              })
          }
        </div>
      )}

      {activeDetail === "ortodoncia" && (
        <div>
          <div style={{fontSize:11,color:"#9b59b6",letterSpacing:2,marginBottom:8,fontWeight:700}}>ORTODONCIA — TODOS LOS TRATAMIENTOS</div>
          <div style={{fontSize:12,color:"#555",marginBottom:12}}>Marcá "Realizado" para sumar al contador. Eliminá falsos positivos con ×.</div>
          {orthoItems.length === 0
            ? <div style={{color:"#555",padding:20,textAlign:"center"}}>Sin ortodoncia en este período</div>
            : orthoItems.map(item => <ItemRow key={item.id} item={item} qty={1}/>)
          }
        </div>
      )}
    </div>
  );
}

// ─── DoctorsPanel ─────────────────────────────────────────────────────────────
function DoctorsPanel({ doctors, onRefresh }) {
  const [name, setName]     = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from("doctors").insert([{ name: name.trim() }]);
    setName(""); await onRefresh(); setSaving(false);
  };
  const remove = async (id) => {
    if (!confirm("¿Eliminar este doctor? Los tratamientos asignados quedarán sin doctor.")) return;
    await supabase.from("doctors").delete().eq("id", id);
    await onRefresh();
  };

  return (
    <div>
      <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,marginBottom:16,fontWeight:700}}>👨‍⚕️ GESTIÓN DE DOCTORES</div>
      <div style={{display:"flex",gap:10,marginBottom:20}}>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
          placeholder="Nombre del doctor..." style={{...s.input, maxWidth:300}}/>
        <button onClick={add} disabled={saving||!name.trim()} style={{...s.btnGold,opacity:(!name.trim()||saving)?0.5:1}}>+ Agregar</button>
      </div>
      {doctors.length === 0
        ? <div style={{textAlign:"center",color:"#333",padding:40,fontSize:13}}>No hay doctores — agregá el primero</div>
        : doctors.map(d => (
          <div key={d.id} style={{...s.card, display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px"}}>
            <span style={{color:"#2c3250",fontWeight:600}}>{d.name}</span>
            <button onClick={()=>remove(d.id)}
              style={{background:"#fff0f0",border:"1px solid #e74c3c88",borderRadius:6,color:"#e74c3c",padding:"4px 12px",cursor:"pointer",fontSize:12}}>
              Eliminar
            </button>
          </div>
        ))
      }
    </div>
  );
}



// ─── PlantillasPanel ──────────────────────────────────────────────────────────
function PlantillasPanel({ templates, onRefresh }) {
  const [keyword,   setKeyword]   = useState("");
  const [textBlock, setTextBlock] = useState("");
  const [editing,   setEditing]   = useState(null);
  const [saving,    setSaving]    = useState(false);

  const reset = () => { setKeyword(""); setTextBlock(""); setEditing(null); };

  const save = async () => {
    if (!keyword.trim() || !textBlock.trim()) return;
    setSaving(true);
    if (editing) {
      await supabase.from("treatment_templates").update({ keyword: keyword.trim(), text_block: textBlock.trim() }).eq("id", editing);
    } else {
      await supabase.from("treatment_templates").insert([{ keyword: keyword.trim(), text_block: textBlock.trim() }]);
    }
    reset(); await onRefresh(); setSaving(false);
  };

  const startEdit = (t) => { setKeyword(t.keyword); setTextBlock(t.text_block||""); setEditing(t.id); };

  const remove = async (id) => {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await supabase.from("treatment_templates").delete().eq("id", id);
    await onRefresh();
  };

  return (
    <div>
      <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,marginBottom:6,fontWeight:700}}>📝 PLANTILLAS DE OBSERVACIONES</div>
      <div style={{fontSize:12,color:"#555",marginBottom:20}}>
        Cuando el sistema detecte la <span style={{color:"#c9a84c"}}>palabra clave</span> en el nombre de un tratamiento, insertará automáticamente el texto correspondiente en las observaciones del paciente.
      </div>

      {/* Form */}
      <div style={{...s.card, border:"1px solid #c9a84c33", marginBottom:20}}>
        <div style={{fontSize:11,color:"#c9a84c",letterSpacing:1,fontWeight:700,marginBottom:12}}>
          {editing ? "✏️ EDITANDO PLANTILLA" : "➕ NUEVA PLANTILLA"}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12,marginBottom:12,alignItems:"start"}}>
          <div>
            <label style={s.label}>Palabra clave</label>
            <input value={keyword} onChange={e=>setKeyword(e.target.value)}
              placeholder="ej: implante, corona, curetaje..."
              style={s.input}/>
            <div style={{fontSize:11,color:"#444",marginTop:4}}>Se busca dentro del nombre del tratamiento (no distingue mayúsculas)</div>
          </div>
          <div>
            <label style={s.label}>Texto a insertar</label>
            <textarea value={textBlock} onChange={e=>setTextBlock(e.target.value)}
              rows={4} placeholder="Texto explicativo que se agregará a las observaciones..."
              style={{...s.input, resize:"vertical"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          {editing && <button onClick={reset} style={s.btnGhost}>Cancelar</button>}
          <button onClick={save} disabled={saving||!keyword.trim()||!textBlock.trim()}
            style={{...s.btnGold, opacity:(saving||!keyword.trim()||!textBlock.trim())?0.5:1}}>
            {saving?"Guardando...":(editing?"Guardar cambios":"Agregar plantilla")}
          </button>
        </div>
      </div>

      {/* List */}
      {templates.length === 0
        ? <div style={{textAlign:"center",color:"#333",padding:40,fontSize:13}}>No hay plantillas — agregá la primera</div>
        : templates.map(t => (
          <div key={t.id} style={{...s.card, borderLeft:"3px solid #c9a84c44", marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{background:"#c9a84c22",border:"1px solid #c9a84c44",borderRadius:6,padding:"2px 10px",color:"#c9a84c",fontSize:12,fontWeight:700}}>
                    🔑 {t.keyword}
                  </span>
                </div>
                <div style={{fontSize:12,color:"#666",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{t.text_block}</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>startEdit(t)} style={{...s.btnSm}}>Editar</button>
                <button onClick={()=>remove(t.id)}
                  style={{...s.btnSm,background:"#fff0f0",border:"1px solid #e74c3c88",color:"#e74c3c"}}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))
      }
    </div>
  );
}

// ─── TraduccionesPanel ────────────────────────────────────────────────────────
function TraduccionesPanel({ translations, onRefresh }) {
  const [search,    setSearch]    = useState("");
  const [form,      setForm]      = useState({ name_es:"", name_en:"", name_fr:"" });
  const [editingId, setEditingId] = useState(null);
  const [saving,    setSaving]    = useState(false);

  const filtered = translations.filter(t =>
    !search.trim() ||
    t.name_es.toLowerCase().includes(search.toLowerCase()) ||
    (t.name_en||"").toLowerCase().includes(search.toLowerCase()) ||
    (t.name_fr||"").toLowerCase().includes(search.toLowerCase())
  );

  const reset = () => { setForm({ name_es:"", name_en:"", name_fr:"" }); setEditingId(null); };

  const save = async () => {
    if (!form.name_es.trim()) return;
    setSaving(true);
    const payload = { name_es: form.name_es.trim(), name_en: form.name_en.trim(), name_fr: form.name_fr.trim() };
    if (editingId) {
      await supabase.from("treatment_translations").update(payload).eq("id", editingId);
    } else {
      await supabase.from("treatment_translations").insert([payload]);
    }
    reset(); await onRefresh(); setSaving(false);
  };

  const startEdit = (t) => { setForm({ name_es: t.name_es, name_en: t.name_en||"", name_fr: t.name_fr||"" }); setEditingId(t.id); };

  const remove = async (id) => {
    if (!confirm("¿Eliminar esta traducción?")) return;
    await supabase.from("treatment_translations").delete().eq("id", id);
    await onRefresh();
  };

  return (
    <div>
      <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,marginBottom:6,fontWeight:700}}>🌐 TRADUCCIONES DE TRATAMIENTOS</div>
      <div style={{fontSize:12,color:"#555",marginBottom:20}}>
        Diccionario ES → EN / FR usado al generar PDFs. Los tratamientos no listados aquí se exportan en español.
      </div>

      <div style={{...s.card, border:"1px solid #c9a84c33", marginBottom:20}}>
        <div style={{fontSize:11,color:"#c9a84c",letterSpacing:1,fontWeight:700,marginBottom:12}}>
          {editingId ? "✏️ EDITANDO" : "➕ NUEVA TRADUCCIÓN"}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <label style={s.label}>🇪🇸 Nombre en español</label>
            <input value={form.name_es} onChange={e=>setForm(f=>({...f,name_es:e.target.value}))} placeholder="Nombre exacto del tratamiento" style={s.input}/>
          </div>
          <div>
            <label style={s.label}>🇬🇧 English</label>
            <input value={form.name_en} onChange={e=>setForm(f=>({...f,name_en:e.target.value}))} placeholder="English name" style={s.input}/>
          </div>
          <div>
            <label style={s.label}>🇫🇷 Français</label>
            <input value={form.name_fr} onChange={e=>setForm(f=>({...f,name_fr:e.target.value}))} placeholder="Nom en français" style={s.input}/>
          </div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          {editingId && <button onClick={reset} style={s.btnGhost}>Cancelar</button>}
          <button onClick={save} disabled={saving||!form.name_es.trim()} style={{...s.btnGold,opacity:(saving||!form.name_es.trim())?0.5:1}}>
            {saving?"Guardando...":(editingId?"Guardar cambios":"Agregar")}
          </button>
        </div>
      </div>

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar tratamiento..." style={{...s.input,marginBottom:10}}/>
      <div style={{fontSize:11,color:"#555",marginBottom:8}}>{filtered.length} de {translations.length} entradas</div>

      <div style={{maxHeight:480,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
        {filtered.length === 0
          ? <div style={{textAlign:"center",color:"#333",padding:40,fontSize:13}}>
              {translations.length === 0 ? "Sin entradas — ejecutá el SQL de migración o agregá manualmente" : "Sin resultados"}
            </div>
          : filtered.map(t => (
            <div key={t.id} style={{...s.card,padding:"9px 14px",display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr auto",gap:12,alignItems:"center"}}>
              <div style={{fontSize:12,color:"#2c3250",fontWeight:500}}>{t.name_es}</div>
              <div style={{fontSize:12,color:"#888"}}>{t.name_en||<span style={{color:"#333"}}>—</span>}</div>
              <div style={{fontSize:12,color:"#888"}}>{t.name_fr||<span style={{color:"#333"}}>—</span>}</div>
              <div style={{display:"flex",gap:5,flexShrink:0}}>
                <button onClick={()=>startEdit(t)} style={s.btnSm}>Editar</button>
                <button onClick={()=>remove(t.id)} style={{...s.btnSm,background:"#fff0f0",border:"1px solid #e74c3c88",color:"#e74c3c"}}>✕</button>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ─── ClinicaPanel ─────────────────────────────────────────────────────────────
function ClinicaPanel({ doctors, templates, translations, onRefreshDoctors, onRefreshTemplates, onRefreshTranslations }) {
  const [tab, setTab] = useState("doctors");

  return (
    <div>
      <div style={{display:"flex",gap:0,marginBottom:20,background:"#ffffff",borderRadius:10,padding:4,width:"fit-content"}}>
        {[["doctors","Doctores"],["plantillas","Plantillas"],["traducciones","Traducciones"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{background:tab===id?"#dce8fa":"none",border:"none",borderRadius:8,color:tab===id?"#c9a84c":"#555",padding:"8px 20px",cursor:"pointer",fontSize:13,fontWeight:tab===id?700:400,transition:"all 0.15s"}}>
            {label}
          </button>
        ))}
      </div>
      {tab==="doctors"    && <DoctorsPanel doctors={doctors} onRefresh={onRefreshDoctors}/>}
      {tab==="plantillas"   && <PlantillasPanel templates={templates} onRefresh={onRefreshTemplates}/>}
      {tab==="traducciones" && <TraduccionesPanel translations={translations} onRefresh={onRefreshTranslations}/>}
    </div>
  );
}

// ─── PagosExcelPanel ─────────────────────────────────────────────────────────
function PagosExcelPanel({ patients }) {
  const [rows,    setRows]    = useState(null);
  const [matches, setMatches] = useState(null);
  const fileRef = useRef();

  const normalize = (s) =>
    (s || "").toString().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, "").trim();

  const namesMatch = (a, b) => {
    const na = normalize(a), nb = normalize(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const wordsA = na.split(/\s+/).filter(w => w.length > 2);
    const wordsB = nb.split(/\s+/).filter(w => w.length > 2);
    const shared = wordsA.filter(w => wordsB.includes(w));
    return shared.length >= 2 || (wordsA.length === 1 && shared.length === 1) || (wordsB.length === 1 && shared.length === 1);
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const parsed = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const name    = (row[5] || "").toString().trim();   // col F (index 5)
        const concept = (row[8] || "").toString().trim();   // col I (index 8)
        const amount  = (row[10] || "").toString().trim();  // col K (index 10)
        if (name) parsed.push({ name, concept, amount });
      }
      setRows(parsed);

      const found = [];
      for (const exRow of parsed) {
        const match = patients.find(p => namesMatch(exRow.name, p.name));
        if (match) found.push({ excelName: exRow.name, patientName: match.name, concept: exRow.concept, amount: exRow.amount });
      }
      setMatches(found);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const print = () => {
    const date = new Date().toLocaleDateString("es-ES");
    const rows = matches.map(m => `
      <tr>
        <td>${m.patientName}</td>
        <td>${m.excelName !== m.patientName ? `<span class="alias">${m.excelName}</span>` : "—"}</td>
        <td>${m.concept || "—"}</td>
        <td class="amt">${m.amount ? `€${parseFloat(m.amount.replace(",",".")).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}</td>
      </tr>`).join("");
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Cobros — ${date}</title>
<style>
  body{font-family:'Segoe UI',sans-serif;color:#111;padding:32px;font-size:13px;}
  h1{font-size:18px;margin:0 0 4px;}
  .sub{color:#666;font-size:12px;margin-bottom:24px;}
  table{width:100%;border-collapse:collapse;}
  th{text-align:left;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;padding:6px 8px;border-bottom:2px solid #ddd;}
  td{padding:7px 8px;border-bottom:1px solid #eee;vertical-align:top;}
  .amt{text-align:right;font-weight:700;}
  .alias{color:#888;font-size:11px;}
  @media print{body{padding:16px;}}
</style></head><body>
<h1>IMPLANTDENT — Cobros importados</h1>
<div class="sub">Fecha: ${date} · ${matches.length} coincidencia(s) de ${rows.length || 0} filas</div>
<table><thead><tr><th>Paciente</th><th>Nombre en Excel</th><th>Concepto</th><th style="text-align:right">Importe</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700}}>📂 IMPORTAR PAGOS EXCEL</div>
        <div style={{flex:1}}/>
        {matches && matches.length > 0 && (
          <button onClick={print} style={{background:"#2c3250",border:"none",borderRadius:8,color:"#fff",padding:"6px 16px",cursor:"pointer",fontSize:12,fontWeight:600}}>
            🖨 Imprimir
          </button>
        )}
      </div>

      <div style={{background:"#ffffff",border:"2px dashed #c9a84c44",borderRadius:12,padding:"28px 24px",marginBottom:20,textAlign:"center"}}>
        <div style={{fontSize:13,color:"#555",marginBottom:14}}>
          Seleccioná el archivo Excel con la lista de cobros.<br/>
          <span style={{fontSize:11,color:"#888"}}>Se leen: columna F (nombre), columna I (concepto), columna K (importe)</span>
        </div>
        <button onClick={()=>fileRef.current.click()}
          style={{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:8,color:"#fff",padding:"10px 24px",cursor:"pointer",fontSize:13,fontWeight:700}}>
          📊 Seleccionar Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFile} style={{display:"none"}}/>
      </div>

      {matches !== null && (
        <div>
          <div style={{fontSize:12,color:"#555",marginBottom:12}}>
            {rows?.length} fila(s) leídas del Excel · <span style={{color:"#c9a84c",fontWeight:700}}>{matches.length} coincidencia(s)</span> con pacientes del sistema
          </div>

          {matches.length === 0 && (
            <div style={{textAlign:"center",color:"#888",padding:40,fontSize:13}}>No se encontraron coincidencias</div>
          )}

          {matches.length > 0 && (
            <div style={{background:"#ffffff",borderRadius:12,border:"1px solid #e2e5ed",overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 3fr 1fr",gap:0,background:"#f5f7fa",padding:"8px 16px",borderBottom:"1px solid #e2e5ed"}}>
                {["Paciente","Nombre en Excel","Concepto","Importe"].map(h=>(
                  <div key={h} style={{fontSize:11,color:"#888",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{h}</div>
                ))}
              </div>
              {matches.map((m,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 3fr 1fr",gap:0,padding:"10px 16px",borderBottom:"1px solid #f0f2f7",alignItems:"center",background:i%2===0?"#ffffff":"#fafbfd"}}>
                  <div style={{fontWeight:700,color:"#2c3250",fontSize:13}}>{m.patientName}</div>
                  <div style={{fontSize:12,color:m.excelName!==m.patientName?"#888":"#bbb"}}>{m.excelName!==m.patientName?m.excelName:"—"}</div>
                  <div style={{fontSize:12,color:"#555"}}>{m.concept||"—"}</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#2ecc71",textAlign:"right"}}>
                    {m.amount ? `€${parseFloat(m.amount.replace(",",".")).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [patients,  setPatients]  = useState([]);
  const [doctors,   setDoctors]   = useState([]);
  const [items,     setItems]     = useState([]);
  const [templates,     setTemplates]     = useState([]);
  const [translations,  setTranslations]  = useState([]);
  const [payments,      setPayments]      = useState([]);
  const [view,      setView]      = useState("dashboard");
  const [statusTab, setStatusTab] = useState("pendiente");
  const [editing,    setEditing]   = useState(null);
  const [filter,     setFilter]    = useState("");
  const [dbLoading,  setDbLoad]    = useState(true);
  const [showAlerts, setShowAlerts] = useState(false);

  const fetchPatients  = async () => { const {data}=await supabase.from("patients").select("*").order("created_at",{ascending:false}); setPatients(data||[]); };
  const fetchDoctors   = async () => { const {data}=await supabase.from("doctors").select("*").order("name"); setDoctors(data||[]); };
  const fetchItems     = async () => { const {data}=await supabase.from("treatment_items").select("*").order("created_at",{ascending:false}); setItems(data||[]); };
  const fetchTemplates    = async () => { const {data}=await supabase.from("treatment_templates").select("*").order("keyword"); setTemplates(data||[]); };
  const fetchTranslations = async () => { const {data,error}=await supabase.from("treatment_translations").select("*").order("name_es"); if(!error){setTranslations(data||[]);setTranslationDict(data||[]);} };
  const fetchPayments     = async () => { const {data}=await supabase.from("payments").select("*").order("date",{ascending:false}); setPayments(data||[]); };

  // Cerrar sesión de Supabase solo al expirar el token o hacer sign out explícito
  useEffect(()=>{
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setUnlocked(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(()=>{ Promise.all([fetchPatients(),fetchDoctors(),fetchItems(),fetchTemplates(),fetchTranslations(),fetchPayments()]).finally(()=>setDbLoad(false)); },[]);

  useEffect(()=>{
    if (!unlocked) return;
    setDbLoad(true);
    Promise.all([fetchPatients(),fetchDoctors(),fetchItems(),fetchTemplates(),fetchTranslations(),fetchPayments()])
      .finally(()=>setDbLoad(false));
  },[unlocked]);

  const insertTreatmentItems = async (patient) => {
    const {data:existing} = await supabase.from("treatment_items").select("id").eq("patient_id", patient.id);
    if ((existing||[]).length > 0) return;
    const rows = getTxItems(patient).map(tr => ({
      patient_id: patient.id, patient_name: patient.name, hc: patient.hc,
      treatment_name: tr.name,
      amount: parseFloat(tr.value)||0,
      doctor_id: null, closed_date: today(), realized_date: null,
    }));
    if (rows.length > 0) await supabase.from("treatment_items").insert(rows);
  };

  const savePatient = async (p) => {
    const payload = {
      name:p.name, hc:p.hc, dni:p.dni||"", budget_no:p.budgetNo||p.budget_no, date:p.date, time:p.time,
      phone:p.phone||"",
      treatments:{ items: p.treatments, discountPct: p.discountPct||"0" },
      appointments:p.appointments||[], notes:p.notes,
      status:p.status||"pendiente", last_contact:p.last_contact||today(), closed:isCerrado(p.status),
    };
    const isNew = !patients.some(x=>x.id===p.id);
    if (isNew) await supabase.from("patients").insert([payload]);
    else       await supabase.from("patients").update(payload).eq("id",p.id);
    await fetchPatients(); setView("dashboard"); setEditing(null);
  };

  const setPatientStatus = async (patient, newStatus) => {
    await supabase.from("patients").update({
      status: newStatus, closed: isCerrado(newStatus), last_contact: today()
    }).eq("id", patient.id);
    if (isCerrado(newStatus) || newStatus === "en curso") {
      await insertTreatmentItems({...patient, status:newStatus, closed:isCerrado(newStatus)});
      await fetchItems();
    }
    await fetchPatients();
  };

  const syncAllItems = async () => {
    const toSync = patients.filter(p => isCerrado(getStatus(p)) || getStatus(p) === "en curso");
    const existingIds = new Set(items.map(i => i.patient_id));
    const missing = toSync.filter(p => !existingIds.has(p.id));
    await Promise.all(missing.map(p => insertTreatmentItems(p)));
    if (missing.length > 0) await fetchItems();
  };

  const deletePatient = async (patient) => {
    if (!confirm(`¿Seguro que querés eliminar a ${patient.name}? Esta acción no se puede deshacer`)) return;
    await Promise.all([
      supabase.from("payments").delete().eq("patient_id", patient.id),
      supabase.from("treatment_items").delete().eq("patient_id", patient.id),
    ]);
    await supabase.from("patients").delete().eq("id", patient.id);
    await Promise.all([fetchPatients(), fetchItems(), fetchPayments()]);
  };

  const openEdit = (p) => { setEditing(p); setView("form"); };
  const newPt    = ()  => { setEditing(emptyPatient()); setView("form"); };

  const recent = patients;

  const todayStr = today();
  const todayAppts = [];
  patients.forEach(p => {
    (p.appointments || []).forEach(appt => {
      if (appt.date === todayStr) todayAppts.push({ patient: p, appt });
    });
  });
  todayAppts.sort((a,b) => (a.appt.time||"").localeCompare(b.appt.time||""));

  const pendingDebtPatients = patients.filter(p=>{
    const hasPayments = payments.some(pay=>pay.patient_id===p.id);
    if (!hasPayments) return false;
    const grand = patientGrand(p);
    const paid = payments.filter(pay=>pay.patient_id===p.id).reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
    return paid < grand;
  });

  const printDebts = () => {
    const fmt = (v) => v ? `€${parseFloat(v).toLocaleString("es-ES",{minimumFractionDigits:2})}` : "-";
    const today = new Date().toISOString().slice(0,10);
    const nextAppt = (p) => {
      const appts = (p.appointments||[]).filter(a=>a.date).sort((a,b)=>a.date.localeCompare(b.date));
      const future = appts.filter(a=>a.date>=today);
      const chosen = future.length ? future[0] : appts[appts.length-1];
      if (!chosen) return "—";
      const [y,m,d] = chosen.date.split("-");
      return `${d}/${m}/${y}${chosen.time?" "+chosen.time:""}`;
    };
    const rows = pendingDebtPatients.map(p=>{
      const grand = patientGrand(p);
      const paid = payments.filter(pay=>pay.patient_id===p.id).reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
      return { name:p.name||"Sin nombre", hc:p.hc||"—", budget_no:p.budget_no||"—", grand, paid, pending:grand-paid, appt:nextAppt(p) };
    }).sort((a,b)=>b.pending-a.pending);
    const totalGrand   = rows.reduce((a,r)=>a+r.grand,0);
    const totalPaid    = rows.reduce((a,r)=>a+r.paid,0);
    const totalPending = rows.reduce((a,r)=>a+r.pending,0);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Saldos pendientes</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:21px;padding:14px}
h2{font-size:21px;font-weight:700;margin-bottom:10px;letter-spacing:1px}
table{width:100%;border-collapse:collapse}
th{background:#ececec;font-weight:700;text-align:left;padding:4px 6px;border-bottom:2px solid #bbb;font-size:19px;text-transform:uppercase;white-space:nowrap}
td{padding:3px 6px;border-bottom:1px solid #e8e8e8;white-space:nowrap}
tr:nth-child(even) td{background:#f8f8f8}
.r{text-align:right}
.p{text-align:right;font-weight:700;color:#c0392b}
tfoot td{font-weight:700;border-top:2px solid #bbb;padding:4px 6px}
.notes-th{width:18%}
.notes-cell{width:18%;border-bottom:1px solid #aaa}
@page{margin:1.2cm;size:A4 portrait}
@media print{body{padding:0}}
</style></head><body>
<h2>PACIENTES CON SALDO PENDIENTE — ${new Date().toLocaleDateString("es-ES")}</h2>
<table>
<thead><tr><th>#</th><th>Nombre</th><th>HC</th><th>Presup. Nº</th><th class="r">Total presup.</th><th class="r">Pagado</th><th class="p">Pendiente</th><th>Próx. cita</th><th class="notes-th">Anotaciones</th></tr></thead>
<tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.name}</td><td>${r.hc}</td><td>${r.budget_no}</td><td class="r">${fmt(r.grand)}</td><td class="r">${fmt(r.paid)}</td><td class="p">${fmt(r.pending)}</td><td>${r.appt}</td><td class="notes-cell"></td></tr>`).join("")}</tbody>
<tfoot><tr><td colspan="4">Total — ${rows.length} paciente${rows.length!==1?"s":""}</td><td class="r">${fmt(totalGrand)}</td><td class="r">${fmt(totalPaid)}</td><td class="p">${fmt(totalPending)}</td><td></td><td></td></tr></tfoot>
</table>
</body></html>`;
    const w = window.open("","_blank");
    w.document.write(html);
    w.document.close();
    w.onload = ()=>w.print();
  };

  const isSearching = filter.trim() !== "";

  const filtered = isSearching
    ? patients.filter(p =>
        (p.name||"").toLowerCase().includes(filter.toLowerCase()) ||
        (p.budget_no||"").includes(filter) ||
        (p.hc||"").includes(filter)
      )
    : recent;

  const NavBtn = ({id,label,badge}) => (
    <button onClick={()=>setView(id)}
      style={{background:"none",border:"none",color:view===id?"#c9a84c":"#666",cursor:"pointer",fontSize:13,fontWeight:view===id?700:400,borderBottom:view===id?"2px solid #c9a84c":"2px solid transparent",padding:"0 4px",height:60,display:"flex",alignItems:"center"}}>
      {label}
      {badge>0 && <span style={{background:"#e74c3c",color:"#fff",borderRadius:"50%",width:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,marginLeft:5}}>{badge}</span>}
    </button>
  );

  if (!unlocked) return <PinLock onUnlock={()=>setUnlocked(true)} />;

  return (
    <div style={{minHeight:"100vh",background:"#f0f2f7",color:"#2c3250",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#ffffff",borderBottom:"1px solid #e2e5ed",padding:"0 28px",display:"flex",alignItems:"center",gap:28,height:60}}>
        <span style={{fontWeight:900,fontSize:15,letterSpacing:3,color:"#c9a84c"}}>IMPLANTDENT</span>
        <span style={{fontSize:10,color:"#3a3a4a",letterSpacing:2}}>GESTIÓN DE PACIENTES</span>
        <div style={{flex:1}}/>
        <NavBtn id="dashboard" label="Pacientes"     badge={0}/>
        <NavBtn id="debts"     label="Deudas"       badge={pendingDebtPatients.length}/>
        <NavBtn id="pagos"     label="Cobros Excel"/>
        <NavBtn id="clinica"   label="Clínica"/>
        <NavBtn id="stats"     label="Estadísticas" badge={0}/>

        {/* ── Campanita ─────────────────────────────────────────────── */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowAlerts(v=>!v)}
            style={{background:"none",border:"none",cursor:"pointer",fontSize:22,lineHeight:1,padding:"4px 6px",
              color: todayAppts.length>0 ? "#c9a84c" : "#444", position:"relative"}}>
            🔔
            {todayAppts.length > 0 && (
              <span style={{position:"absolute",top:-4,right:-4,background:"#e74c3c",color:"#fff",
                borderRadius:"50%",minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:10,fontWeight:800,lineHeight:1,padding:"0 3px",boxSizing:"border-box"}}>
                {todayAppts.length}
              </span>
            )}
          </button>

          {showAlerts && (
            <>
              <div onClick={()=>setShowAlerts(false)}
                style={{position:"fixed",inset:0,zIndex:999}}/>
              <div style={{position:"fixed",top:64,right:24,width:320,background:"#ffffff",
                border:"1px solid #dde4ef",borderRadius:14,zIndex:1000,
                boxShadow:"0 12px 40px #000c",overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:"1px solid #e2e5ed",
                  fontSize:11,color:"#c9a84c",fontWeight:700,letterSpacing:2}}>
                  🔔 CITAS DE HOY — {fmtDate(todayStr)}
                </div>
                {todayAppts.length === 0
                  ? <div style={{padding:24,color:"#555",textAlign:"center",fontSize:13}}>Sin citas para hoy</div>
                  : todayAppts.map(({patient:pat, appt}) => (
                      <div key={appt.id}
                        onClick={()=>{ openEdit(pat); setShowAlerts(false); }}
                        style={{padding:"12px 18px",borderBottom:"1px solid #e2e5ed",cursor:"pointer",
                          display:"flex",justifyContent:"space-between",alignItems:"center"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#e2e5ed"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div>
                          <div style={{fontWeight:700,color:"#2c3250",fontSize:14}}>{pat.name||"Sin nombre"}</div>
                          <div style={{fontSize:12,color:"#777",marginTop:2}}>
                            {appt.time ? `${appt.time} · ` : ""}{appt.label||"Cita"}
                            {appt.doctors ? ` · ${appt.doctors}` : ""}
                          </div>
                        </div>
                        <span style={{color:"#c9a84c",fontSize:20}}>›</span>
                      </div>
                    ))
                }
              </div>
            </>
          )}
        </div>

        <button onClick={newPt} style={s.btnGold}>+ Nuevo paciente</button>
      </div>

      <div style={{padding:"26px 28px",maxWidth:980,margin:"0 auto"}}>
        {dbLoading && <div style={{textAlign:"center",color:"#444",padding:60,fontSize:14}}>Cargando...</div>}

        {!dbLoading && view==="form" && editing && (
          <>
            <div style={{marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>{setView("dashboard");setEditing(null);}} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:22}}>←</button>
              <h2 style={{margin:0,color:"#2c3250",fontSize:18,fontWeight:700}}>
                {editing.name?`Editando: ${editing.name}`:"Nuevo paciente"}
              </h2>
            </div>
            <PatientForm patient={editing} onSave={savePatient} onCancel={()=>{setView("dashboard");setEditing(null);}} templates={templates}
              payments={payments} onPaymentsChange={fetchPayments} isNew={!patients.some(x=>x.id===editing.id)}/>
          </>
        )}

        {!dbLoading && view==="dashboard" && (
          <>
            {(() => {
              const tabs = [
                { id:"frío",               label:"Fríos",            color:"#7f8c8d", list: recent.filter(p=>getStatus(p)==="frío")               },
                { id:"pendiente",          label:"Pendientes",      color:"#c9a84c", list: recent.filter(p=>getStatus(p)==="pendiente")          },
                { id:"en curso",           label:"En curso",         color:"#3498db", list: recent.filter(p=>getStatus(p)==="en curso")           },
                { id:"cerrado con deuda",  label:"Cerrados c/ deuda",color:"#e67e22", list: recent.filter(p=>getStatus(p)==="cerrado con deuda")  },
                { id:"cerrado sin deuda",  label:"Cerrados sin deuda",color:"#2ecc71",list: recent.filter(p=>getStatus(p)==="cerrado sin deuda")  },
              ];
              const activeTab = tabs.find(t=>t.id===statusTab) || tabs[0];
              const tabList   = isSearching ? filtered : activeTab.list;

              return (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
                    {tabs.map(tab => {
                      const active = !isSearching && statusTab === tab.id;
                      return (
                        <div key={tab.id} onClick={()=>{setStatusTab(tab.id);setFilter("");}}
                          style={{background: active ? tab.color+"1a":"#f5f7fa", borderRadius:10, padding:"14px 18px",
                            borderTop:`3px solid ${tab.color}`,
                            border: active ? `1px solid ${tab.color}55`:"1px solid #e2e5ed",
                            cursor:"pointer", transition:"all 0.15s"}}
                          onMouseEnter={e=>{ if(!active) e.currentTarget.style.background="#e2e5ed"; }}
                          onMouseLeave={e=>{ if(!active) e.currentTarget.style.background="#f5f7fa"; }}>
                          <div style={{fontSize:28,fontWeight:800,color:tab.color,lineHeight:1}}>{tab.list.length}</div>
                          <div style={{fontSize:12,color: active?tab.color:"#555",marginTop:4,fontWeight:active?700:400}}>{tab.label}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{display:"flex",gap:12,marginBottom:14,alignItems:"center"}}>
                    <input type="text" placeholder="Buscar en todos los pacientes (nombre, HC, Nº presupuesto)..."
                      value={filter} onChange={e=>setFilter(e.target.value)}
                      style={{...s.input, flex:1, fontSize:13}}/>
                    {isSearching && <button onClick={()=>setFilter("")} style={{...s.btnGhost,whiteSpace:"nowrap",padding:"9px 14px"}}>✕ Limpiar</button>}
                  </div>

                  {isSearching && (
                    <div style={{fontSize:12,color:"#555",marginBottom:10}}>Resultados para "{filter}" — todos los estados</div>
                  )}
                  {!isSearching && (
                    <div style={{fontSize:11,color: activeTab.color,letterSpacing:1,marginBottom:10,fontWeight:700}}>
                      {activeTab.label.toUpperCase()} — {activeTab.list.length} presupuesto(s)
                    </div>
                  )}
                  {tabList.length===0 && (
                    <div style={{textAlign:"center",color:"#333",padding:56,fontSize:14}}>
                      {isSearching ? "Sin resultados para esa búsqueda" : `Sin presupuestos ${activeTab.label.toLowerCase()}`}
                    </div>
                  )}
                  {tabList.map(p=><PatientCard key={p.id} patient={p} onEdit={openEdit} onSetStatus={setPatientStatus} onDelete={deletePatient}
                    patientPayments={payments.filter(pay=>pay.patient_id===p.id)}
                    onOpen={isSearching ? openEdit : null}
                    templates={templates}
                  />)}
                </>
              );
            })()}
          </>
        )}



        {!dbLoading && view==="debts" && (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontSize:12,color:"#e74c3c",letterSpacing:2,fontWeight:700}}>💳 PACIENTES CON SALDO PENDIENTE</div>
              {pendingDebtPatients.length>0 && <button onClick={printDebts} style={{fontSize:12,padding:"4px 12px",borderRadius:6,border:"1px solid #bbb",background:"#f5f5f5",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>🖨️ Imprimir lista</button>}
            </div>
            {pendingDebtPatients.length===0
              ? <div style={{textAlign:"center",color:"#333",padding:56,fontSize:14}}>No hay pacientes con saldo pendiente</div>
              : pendingDebtPatients.map(p=>{
                  const grand = patientGrand(p);
                  const paid = payments.filter(pay=>pay.patient_id===p.id).reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
                  const pending = grand - paid;
                  return (
                    <div key={p.id} onClick={()=>openEdit(p)}
                      style={{...s.card,cursor:"pointer",borderLeft:"4px solid #e74c3c88",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#e2e5ed"}
                      onMouseLeave={e=>e.currentTarget.style.background="#f5f7fa"}>
                      <div>
                        <div style={{fontWeight:700,color:"#2c3250",fontSize:15}}>{p.name||"Sin nombre"}</div>
                        <div style={{fontSize:12,color:"#555",marginTop:2}}>HC: {p.hc||"—"} · #{p.budget_no||"—"}</div>
                        <div style={{fontSize:12,color:"#777",marginTop:2}}>Total: {fmtEur(grand)} · Pagado: {fmtEur(paid)}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:22,fontWeight:800,color:"#e74c3c"}}>{fmtEur(pending)}</div>
                        <div style={{fontSize:11,color:"#555"}}>saldo pendiente</div>
                      </div>
                    </div>
                  );
                })
            }
          </>
        )}

        {!dbLoading && view==="pagos" && (
          <PagosExcelPanel patients={patients}/>
        )}

        {!dbLoading && view==="clinica" && (
          <ClinicaPanel doctors={doctors} templates={templates} translations={translations}
            onRefreshDoctors={fetchDoctors} onRefreshTemplates={fetchTemplates} onRefreshTranslations={fetchTranslations}/>
        )}

        {!dbLoading && view==="stats" && (
          <EstadisticasPanel payments={payments} items={items} patients={patients} onOpenPatient={openEdit} onRefreshItems={fetchItems} onSync={syncAllItems}/>
        )}
      </div>
    </div>
  );
} 
