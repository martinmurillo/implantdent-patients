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
            type="password" inputMode="numeric" maxLength={8} autoFocus autoComplete="new-password"
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
          <button type="submit" style={{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:8,color:"#fff",padding:"12px 0",cursor:"pointer",fontSize:14,fontWeight:700,width:"100%"}}>
            Entrar
          </button>
        </form>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

// ─── LOGIN FORM ───────────────────────────────────────────────────────────────
function LoginForm({ onLogin }) {
  const emailRef = useRef(null);
  const passRef  = useRef(null);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email:    emailRef.current.value.trim(),
      password: passRef.current.value,
    });
    setLoading(false);
    if (err) { setError("Email o contraseña incorrectos"); return; }
    onLogin();
  };

  return (
    <div style={{minHeight:"100vh",background:"#f0f2f7",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#f5f7fa",border:"1px solid #e2e5ed",borderRadius:16,padding:"48px 40px",textAlign:"center",width:320}}>
        <div style={{fontWeight:900,fontSize:18,letterSpacing:4,color:"#c9a84c",marginBottom:6}}>IMPLANTDENT</div>
        <div style={{fontSize:11,color:"#444",letterSpacing:2,marginBottom:36}}>GESTIÓN DE PACIENTES</div>
        <form onSubmit={submit}>
          <input
            ref={emailRef} type="email" autoFocus autoComplete="email"
            placeholder="Email"
            style={{background:"#fff",border:"1px solid #dde4ef",borderRadius:10,color:"#2c3250",
              padding:"12px 16px",fontSize:15,width:"100%",outline:"none",
              boxSizing:"border-box",marginBottom:10}}
          />
          <input
            ref={passRef} type="password" autoComplete="current-password"
            placeholder="Contraseña"
            style={{background:"#fff",border:"1px solid #dde4ef",borderRadius:10,color:"#2c3250",
              padding:"12px 16px",fontSize:15,width:"100%",outline:"none",
              boxSizing:"border-box",marginBottom:16}}
          />
          {error && <div style={{color:"#e74c3c",fontSize:12,marginBottom:12}}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:8,
              color:"#fff",padding:"12px 0",cursor:"pointer",fontSize:14,fontWeight:700,
              width:"100%",opacity:loading?0.7:1}}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
const genId    = () => Math.random().toString(36).slice(2,10);
const today    = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const daysDiff = (d) => !d ? 999 : Math.floor((new Date()-new Date(d))/86400000);
const STATUSES = ["frío","pendiente","en curso","cerrado con deuda","cerrado sin deuda"];
const STATUS_COLOR = { "frío":"#7f8c8d", "pendiente":"#c9a84c", "en curso":"#3498db", "cerrado con deuda":"#e67e22", "cerrado sin deuda":"#2ecc71" };
const STATUS_LABEL = { "frío":"Frío", "pendiente":"Pendiente", "en curso":"Con citas", "cerrado con deuda":"C/ deuda", "cerrado sin deuda":"Sin deuda" };
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

const MONTHS_ES    = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
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
const emptyPatient  = () => ({
  id:genId(), name:"", hc:"", dni:"", budgetNo:"", date:today(), time:"",
  treatments:[], appointments:[], reminders:[], notes:"",
  status:"pendiente", last_contact:today(), closed:false,
});
const emptyTx       = () => ({ id:genId(), name:"", value:"", discount:"0" });
const emptyAppt     = () => ({ id:genId(), label:"", date:"", time:"", doctors:"", payment:"", treatmentIds:[] });
const emptyReminder = () => ({ id:genId(), date:today(), text:"" });

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
    const discountPct = Array.isArray(raw) ? "10" : (raw?.discountPct || "10");
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
  const [newHistDate, setNewHistDate] = useState(today());
  const [newHistText, setNewHistText] = useState("");
  const [showNewHist, setShowNewHist] = useState(false);

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
  const remAppt      = (id) => setP(prev=>({...prev, appointments:prev.appointments.filter(a=>a.id!==id)}));
  const addReminder  = () => setP(prev=>({...prev, reminders:[...(prev.reminders||[]), emptyReminder()]}));
  const updReminder  = (id,f,v) => setP(prev=>({...prev, reminders:(prev.reminders||[]).map(r=>r.id===id?{...r,[f]:v}:r)}));
  const remReminder  = (id) => setP(prev=>({...prev, reminders:(prev.reminders||[]).filter(r=>r.id!==id)}));

  const sortedHistory = [...(p.history || [])].sort((a,b) => b.date.localeCompare(a.date));
  const addHistEntry = () => {
    if (!newHistText.trim()) return;
    setP(prev => ({ ...prev, history: [...(prev.history || []), { id: genId(), date: newHistDate || today(), text: newHistText.trim() }] }));
    setNewHistText(""); setNewHistDate(today()); setShowNewHist(false);
  };
  const removeHistEntry = (id) => setP(prev => ({ ...prev, history: (prev.history || []).filter(e => e.id !== id) }));

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
    <div>
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
      <div style={{...s.card, marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom: sortedHistory.length > 0 || showNewHist ? 10 : 0}}>
          <span style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700}}>HISTORIAL CLÍNICO</span>
          {!showNewHist && (
            <button onClick={()=>setShowNewHist(true)} style={{...s.btnDark,padding:"4px 12px",fontSize:12}}>+ Nueva nota</button>
          )}
        </div>
        {showNewHist && (
          <div style={{background:"#f0f2f7",borderRadius:8,padding:12,marginBottom:10}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
              <div>
                <label style={s.label}>Fecha</label>
                <input type="date" value={newHistDate} onChange={e=>setNewHistDate(e.target.value)} style={{...s.smInput,width:140}}/>
              </div>
              <div style={{flex:1}}>
                <label style={s.label}>Nota</label>
                <textarea value={newHistText} onChange={e=>setNewHistText(e.target.value)}
                  placeholder="Descripción, observación clínica..."
                  rows={2} autoFocus style={{...s.input,resize:"vertical"}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowNewHist(false);setNewHistText("");}} style={s.btnGhost}>Cancelar</button>
              <button onClick={addHistEntry} disabled={!newHistText.trim()} style={{...s.btnGold,opacity:!newHistText.trim()?0.5:1}}>Guardar nota</button>
            </div>
          </div>
        )}
        {sortedHistory.length === 0 && !showNewHist && (
          <div style={{color:"#bbb",fontSize:12,padding:"2px 0"}}>Sin entradas — usá "+ Nueva nota" para agregar</div>
        )}
        {sortedHistory.map(entry => (
          <div key={entry.id} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid #e2e5ed"}}>
            <div style={{minWidth:88,color:"#c9a84c",fontWeight:700,fontSize:12,paddingTop:2,flexShrink:0}}>{fmtDate(entry.date)}</div>
            <div style={{flex:1,fontSize:13,color:"#333",whiteSpace:"pre-wrap"}}>{entry.text}</div>
            <button onClick={()=>removeHistEntry(entry.id)}
              style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1,flexShrink:0}}
              title="Eliminar">×</button>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:12,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:0,background:"#ffffff",borderRadius:10,padding:4}}>
          {[["treatments","Tratamientos"],["appointments","Citas"],["payments","Pagos"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{background:tab===id?"#dce8fa":"none",border:"none",borderRadius:8,color:tab===id?"#c9a84c":"#555",padding:"8px 20px",cursor:"pointer",fontSize:13,fontWeight:tab===id?700:400,transition:"all 0.15s"}}>
              {label}
              {id==="appointments" && p.appointments.filter(a=>a.date&&a.date>=today()).length>0 &&
                <span style={{background:"#c9a84c",color:"#f0f2f7",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,marginLeft:6}}>{p.appointments.filter(a=>a.date&&a.date>=today()).length}</span>}
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

          {/* ── Recordatorios ── */}
          <div style={{marginTop:18,paddingTop:14,borderTop:"1px dashed #e2e5ed"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{...s.label,color:"#c9a84c"}}>📌 Recordatorios</span>
              <button onClick={addReminder} style={{...s.btnDark,background:"#c9a84c22",border:"1px solid #c9a84c88",color:"#c9a84c"}}>+ Agregar recordatorio</button>
            </div>
            {(p.reminders||[]).length===0 && (
              <div style={{textAlign:"center",color:"#bbb",padding:"12px 0",fontSize:13}}>Sin recordatorios</div>
            )}
            {[...(p.reminders||[])].sort((a,b)=>a.date.localeCompare(b.date)).map(rem=>(
              <div key={rem.id} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,background:"#fffdf5",border:"1px solid #c9a84c44",borderLeft:"3px solid #c9a84c",borderRadius:8,padding:"8px 10px"}}>
                <input type="date" value={rem.date} onChange={e=>updReminder(rem.id,"date",e.target.value)} style={{...s.smInput,width:140,flexShrink:0}}/>
                <input type="text" value={rem.text} onChange={e=>updReminder(rem.id,"text",e.target.value)} placeholder="Descripción del recordatorio..." style={{...s.smInput,flex:1}}/>
                <button onClick={()=>remReminder(rem.id)} style={{...s.btnSm,background:"#fff0f0",border:"1px solid #e74c3c88",color:"#e74c3c",flexShrink:0}}>×</button>
              </div>
            ))}
          </div>
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
function PatientCard({ patient, onEdit, onSetStatus, onDelete, patientPayments=[], onOpen=null, templates=[], waClicks=[], onWaClick=()=>{} }) {
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
  const txNames = getTxItems(patient).map(t=>(t.name||"").toLowerCase());
  const hasOrtho   = txNames.some(n=>n.includes("ortodoncia"));
  const hasImplant = txNames.some(n=>n.includes("implante"));
  const historyEntries = [...(patient.history||[])].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  const todayStr = new Date().toISOString().slice(0,10);
  const nextAppt = (patient.appointments||[])
    .filter(a=>a.date&&a.date>=todayStr)
    .sort((a,b)=>a.date.localeCompare(b.date))[0];
  const upcomingCount = (patient.appointments||[]).filter(a=>a.date&&a.date>=todayStr).length;
  const iniciadoSinCita = (status === "en curso" || status === "cerrado con deuda") && totalPaid > 0 && !nextAppt;
  const nextReminder = [...(patient.reminders||[])]
    .filter(r=>r.date&&r.date>=todayStr)
    .sort((a,b)=>a.date.localeCompare(b.date))[0];

  const firstName  = ((patient.name||"").trim().split(/\s+/)[0] || "paciente").replace(/^./, c => c.toUpperCase()).replace(/(?<=^.).*/, s => s.toLowerCase());
  const waPhone    = patient.phone ? (n => /^[6789]\d{8}$/.test(n) ? "34"+n : n)(patient.phone.replace(/\D/g,"")) : null;
  const getWaCount = (key) => {
    const fromDb = (waClicks.find(c=>c.button_key===key)?.count)||0;
    if (fromDb > 0) return fromDb;
    return parseInt(localStorage.getItem(`wa_${patient.id}_${key}`)||"0");
  };
  const grandOffer = fmtEur(Math.round(grand * 0.85 * 100) / 100);

  const waLink = (msg) => waPhone ? `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(msg)}` : null;

  const msgSaludo = `Hola ${firstName}. Soy Martín Murillo de la clínica implandent. Donde acabas de hacer la valoración odontológica.\n\nGracias por elegirnos para el cuidado de su salud ${firstName}. Cualquier duda o comentarios que quiera hacernos, estaré encantado de responderle por aquí mismo.\n\nSaludos y que tenga un buen día!\n\nMurillo Martín.\nClínica implandent Girona.`;

  const msgOferta = `Buenas ${firstName}. Como estás?\n\nSoy Martín Murillo de la clínica implandent Girona (por si no haz guardado mi número).\n\nTe escribo en relación a la visita de valoración que realizaste el día ${fmtDate(patient.date)}.\n\nVeo que aún no te haz decidido a comenzar o no haz podido ${firstName}. Si no haz tomado la decisión por motivos financieros, quiero ofrecerte un descuento importante y la posibilidad de financiar el tratamiento.\n\nEl costo total de tu tratamiento es de ${fmtEur(grand)}, pero puedo pedir autorización para dejarlo en ${grandOffer} y también hacerlo en cuotas.\n\nSi te interesa comenzar con estas opciones, me dices algo y coordinamos las citas.\n\nSaludos y que tengas un buen día ${firstName}`;

  const msgCita = nextAppt
    ? `Hola ${firstName}! Como estás?.\n\nTe envío este mensaje para recordarte que el día ${fmtDate(nextAppt.date)} tienes cita en la clínica.\n\nCualquier cambio que quieras hacer, me lo dices y vemos si nos podemos ajustar o bien cambiamos la cita.\n\nSaludos ${firstName}, nos vemos el ${fmtDate(nextAppt.date)}`
    : null;

  const msgFinOferta = `Buenas tardes ${firstName}. Soy Martin de la clinica dental IMPLANTDENT.Te escribo para recordarte que la oferta y las condiciones especiales que te hemos presentado finalizan mañana.\n\nA partir de pasado mañana dejarán de estar disponibles y el presupuesto volverá a las condiciones habituales de la clínica.\n\nSi deseas beneficiarte de esta oferta, es necesario que nos lo confirmes antes de que finalice mañana.\n\nQuedo atento a tu respuesta. Muchas gracias.`;

  const msgRetomar = `Hola, ${firstName} 😊\nTe escribo para saber cómo te encuentras y recordarte que has iniciado tu tratamiento con nosotros.\n\nVeo que todavía no tienes programada la siguiente cita, y es importante ir avanzando en las fases para que el tratamiento evolucione correctamente.\n\nCuando te venga bien, dime y te busco el mejor hueco disponible para continuar.\n\nQuedo atento a tu respuesta`;

  const ortoTxList = getTxItems(patient).map(t=>`* ${t.name||""}`).join("\n");
  const msgOrto = `Hola ${firstName}. Soy Martín de Clínica Dental IMPLANTDENT. \n\nEspero que te encuentres bien.\n\n${firstName}, te escribo para avisarte que todos los descuentos y/u ofertas que hicimos en estos días, se reinician a partir del lunes y no se que condiciones tendremos desde ese día. \n\nSi deseas avanzar con el tratamiento y ofertas, me lo dices hoy durante el día hasta las 19:00, y las congelamos con tu compromiso de hacerlos. Te dejo un resumen de las posibilidades del tratamiento ofrecidas:\n\nIMPORTE TOTAL (SIN DESCUENTOS): XXXXXX € \n\nTRATAMIENTOS: \n\n${ortoTxList}\n------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------\n\nFINANCIADO: (Oferta sujeta a condiciones del momento de contratación.)\n\n* XXXXX € (Pago reducido) en XX cuotas de XXXX € \n\n-------------------\n\nPAGO EN CLÍNICA MES A MES: (Oferta especial sin aportación inicial del 30%.)\n\n* XXXXX € (Pago completo) en XX cuotas de XXXX € \n\nAguardo comentaros ${firstName}. Que tengas un buen día!`;

  return (
    <div style={{...s.card, borderLeft:`4px solid ${bc}`, display:"flex", gap:0, alignItems:"stretch"}}>
      {/* ── Main content ── */}
      <div style={{flex:"0 0 auto", minWidth:320, maxWidth:420}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div onClick={onOpen?()=>onOpen(patient):undefined}
            style={{flex:1, cursor:onOpen?"pointer":"default", fontWeight:700, color:"#2c3250", fontSize:15, display:"flex", alignItems:"center", gap:6}}>
            {patient.name||"Sin nombre"}
            {hasOrtho   && <span title="Ortodoncia" style={{fontSize:13}}>⭐</span>}
            {hasImplant && <span title="Implante"   style={{fontSize:13}}>🦷</span>}
            {iniciadoSinCita && <span className="blink-red" style={{background:"#e74c3c",color:"#fff",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700,letterSpacing:"0.3px"}}>iniciado sin cita</span>}
            {patient.phone && (
              <a href={`whatsapp://send?phone=${(n=>/^[6789]\d{8}$/.test(n)?"34"+n:n)(patient.phone.replace(/\D/g,""))}`}
                title={`WhatsApp ${patient.phone}`}
                style={{background:"#25d36622",border:"1px solid #25d36688",borderRadius:6,color:"#25d366",padding:"3px 7px",fontSize:13,fontWeight:700,textDecoration:"none",display:"inline-flex",alignItems:"center",lineHeight:1}}>
                &#x1F4AC;
              </a>
            )}
          </div>
          <div style={{display:"flex",gap:5,flexShrink:0,marginLeft:10}}>
            <button onClick={()=>onEdit(patient)} style={{...s.btnDark,padding:"5px 12px",fontSize:12}}>Editar</button>
            <button onClick={()=>onDelete(patient)}
              style={{...s.btnSm,background:"#fff0f0",border:"1px solid #e74c3c88",color:"#e74c3c",padding:"5px 12px",fontSize:12}}>
              Eliminar
            </button>
          </div>
        </div>
        <div style={{fontSize:12,color:"#555",marginTop:4}}>HC: {patient.hc||"—"} · #{patient.budget_no||"—"} · {fmtDate(patient.date)}</div>
        <div style={{fontSize:12,color:"#777",marginTop:3,display:"flex",flexWrap:"wrap",gap:"0 6px"}}>
          <span>{upcomingCount} cita(s)</span>
          {nextAppt && <span style={{color:"#3498db",fontWeight:600}}>· 🗓 Próx: {fmtDate(nextAppt.date)}{nextAppt.label?` — ${nextAppt.label}`:""}</span>}
          <span>· <span style={{color:"#c9a84c",fontWeight:600}}>{fmtEur(grand)}</span></span>
          {hasPending && <span style={{color:"#e74c3c",fontWeight:600}}>· Deuda: {fmtEur(grand-totalPaid)}</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-start",marginTop:8}}>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {STATUSES.map(st=>(
              <button key={st} onClick={()=>onSetStatus(patient,st)}
                style={{background:status===st?STATUS_COLOR[st]+"22":"#ffffff",border:`1px solid ${status===st?STATUS_COLOR[st]:"#333"}`,borderRadius:6,color:status===st?STATUS_COLOR[st]:"#555",padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:status===st?700:400}}>
                {STATUS_LABEL[st]}
              </button>
            ))}
          </div>
          {waPhone && (
          <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
            {[
              {label:"saludo",    msg:msgSaludo,    color:"#25a244", key:"saludo"},
              {label:"oferta",    msg:msgOferta,    color:"#c9a84c", key:"oferta"},
              {label:"cita",      msg:msgCita,      color:"#3498db", key:"cita",      disabled:!msgCita},
              {label:"fin oferta",msg:msgFinOferta, color:"#e74c3c", key:"finoferta"},
              {label:"retomar",   msg:msgRetomar,   color:"#8e44ad", key:"retomar"},
              {label:"orto",      msg:msgOrto,      color:"#16a085", key:"orto",      show:hasOrtho},
            ].filter(b=>b.show!==false).map(({label,msg,color,key,disabled})=>(
              disabled
                ? <span key={key} style={{fontSize:11,padding:"4px 10px",borderRadius:6,background:"#f0f0f0",color:"#bbb",fontStyle:"italic"}}>{label}</span>
                : (
                  <div key={key} style={{position:"relative",display:"inline-flex"}}>
                    <a href={waLink(msg)} onClick={()=>onWaClick(key)}
                      style={{fontSize:11,padding:"4px 10px",borderRadius:6,background:color+"18",border:`1px solid ${color}55`,color,fontWeight:600,textDecoration:"none",whiteSpace:"nowrap"}}>
                      {label}
                    </a>
                    {getWaCount(key) > 0 && (
                      <span style={{position:"absolute",top:-7,right:-7,background:color,color:"#fff",borderRadius:"50%",minWidth:16,height:16,fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",lineHeight:1,pointerEvents:"none"}}>
                        {getWaCount(key)}
                      </span>
                    )}
                  </div>
                )
            ))}
          </div>
          )}
        </div>
      </div>
      {/* ── History sidebar ── */}
      <div style={{flex:1,minWidth:0,borderLeft:"1px solid #e2e5ed",marginLeft:18,paddingLeft:16,display:"flex",flexDirection:"column",justifyContent:"flex-start",gap:6}}>
        {historyEntries.length === 0
          ? <span style={{fontSize:12,color:"#ccc",fontStyle:"italic",marginTop:4}}>Sin historial</span>
          : historyEntries.map(e => (
            <div key={e.id} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{fontSize:11,color:"#c9a84c",fontWeight:700,whiteSpace:"nowrap",paddingTop:1,flexShrink:0}}>{fmtDate(e.date)}</span>
              <span style={{fontSize:12,color:"#333",lineHeight:1.4}}>{e.text}</span>
            </div>
          ))
        }
        {(patient.history||[]).length > 3 && (
          <span style={{fontSize:11,color:"#aaa"}}>+{(patient.history||[]).length - 3} entrada(s) más</span>
        )}
        {(()=>{
          const upcoming = [...(patient.reminders||[])].filter(r=>r.date&&r.date>=todayStr).sort((a,b)=>a.date.localeCompare(b.date));
          if (!upcoming.length) return null;
          return (
            <div style={{marginTop:"auto",paddingTop:10,borderTop:"1px solid #e2e5ed"}}>
              {upcoming.map(r=>(
                <div key={r.id} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:4}}>
                  <span style={{fontSize:11,color:"#c9a84c",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>📌 {fmtDate(r.date)}</span>
                  <span style={{fontSize:12,color:"#c9a84c",fontWeight:700,lineHeight:1.4}}>{r.text}</span>
                </div>
              ))}
            </div>
          );
        })()}
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

// ─── ProgresoPanel ───────────────────────────────────────────────────────────
function ProgresoPanel({ payments, items, patients, clinicStats=[], onSaveClinicStat, onClose, onOpenPatient }) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const implantRx  = /implant/i;
  const implantExcRx = /corona|aditamento/i;
  const isImplant  = (name) => implantRx.test(name) && !implantExcRx.test(name);
  const orthoRx    = /ortodoncia|orthodontic|invisalign|invisaling|invisible\s|ortod|placa expansiva|hass/i;

  const computeYearFull = (year) => {
    const a12 = () => Array(12).fill(0);
    const l12 = () => Array.from({length:12}, ()=>[]);

    const paid = a12(), paidPts = l12();
    const budgeted = a12(), budgetedPts = l12();         // solo pacientes con pagos
    const totalBudgeted = a12(), totalBudgetedPts = l12(); // todos los pacientes
    const orthoRealized = a12(), orthoRealizedPts = l12();
    const orthoPending  = a12(), orthoPendingPts  = l12();
    const implantRealized = a12(), implantRealizedPts = l12();
    const implantPending  = a12(), implantPendingPts  = l12();

    // HCs únicas por mes (deduplicadas para no contar presupuestos duplicados)
    const hcByMonth    = Array.from({length:12}, () => new Set());
    const hcPayByMonth = Array.from({length:12}, () => new Set());
    const hcYearAll    = new Set();
    const hcYearPay    = new Set();

    // Pacientes que tienen al menos un pago registrado
    const patientsWithPayments = new Set(payments.map(p => p.patient_id));

    payments.forEach(pay => {
      const d = pay.date; if (!d) return;
      const y = parseInt(d.slice(0,4)), m = parseInt(d.slice(5,7));
      if (y !== year || m < 1 || m > 12) return;
      paid[m-1] += parseFloat(pay.amount)||0;
      const pat = patients.find(p => p.id === pay.patient_id);
      paidPts[m-1].push({
        patientId: pay.patient_id,
        name: pat?.name || "Paciente eliminado",
        hc: pat?.hc || "—",
        detail: fmtEur(pay.amount) + (pay.note ? ` · ${pay.note}` : ""),
      });
    });

    const realizedSet = new Set();
    items.forEach(item => {
      if (item.realized_date)
        realizedSet.add(`${item.patient_id}|${(item.treatment_name||"").toLowerCase().trim()}`);
    });

    patients.forEach(pat => {
      const d = pat.date; if (!d) return;
      const py = parseInt(d.slice(0,4)), pm = parseInt(d.slice(5,7));
      if (pm < 1 || pm > 12) return;

      if (py === year) {
        const g = patientGrand(pat);
        const entry = { patientId:pat.id, name:pat.name||"—", hc:pat.hc||"—", detail:fmtEur(g) };
        // Total presupuestado: TODOS los pacientes
        totalBudgeted[pm-1] += g;
        totalBudgetedPts[pm-1].push(entry);
        // Presupuestado c/pagos: solo los que tienen al menos un pago
        if (patientsWithPayments.has(pat.id)) {
          budgeted[pm-1] += g;
          budgetedPts[pm-1].push(entry);
        }
        // Pacientes únicos por HC (descarta presupuestos duplicados del mismo paciente)
        const hc = (pat.hc || '').trim();
        if (hc) {
          hcByMonth[pm-1].add(hc);
          hcYearAll.add(hc);
          if (patientsWithPayments.has(pat.id)) {
            hcPayByMonth[pm-1].add(hc);
            hcYearPay.add(hc);
          }
        }
      }

      getTxItems(pat).forEach(tx => {
        const txName = tx.name || "";
        const key    = `${pat.id}|${txName.toLowerCase().trim()}`;
        if (excluded.has(key)) return;
        const entry  = { patientId:pat.id, name:pat.name||"—", hc:pat.hc||"—", detail:txName+(tx.value?` · ${fmtEur(tx.value)}`:""), txName };

        if (orthoRx.test(txName) && !realizedSet.has(key) && pm >= 1 && pm <= 12) {
          orthoPending[pm-1]++;
          orthoPendingPts[pm-1].push(entry);
        }
        if (isImplant(txName) && !realizedSet.has(key) && pm >= 1 && pm <= 12 && pat.status !== "frío") {
          const mm = txName.match(/(\d+)\s*implante/i);
          implantPending[pm-1] += mm ? parseInt(mm[1]) : 1;
          implantPendingPts[pm-1].push(entry);
        }
      });
    });

    items.forEach(item => {
      const name = item.treatment_name || "";
      if (!item.realized_date) return;
      const ry = parseInt(item.realized_date.slice(0,4));
      const rm = parseInt(item.realized_date.slice(5,7));
      if (ry !== year || rm < 1 || rm > 12) return;
      const exKey = `${item.patient_id}|${name.toLowerCase().trim()}`;
      if (excluded.has(exKey)) return;
      const pat   = patients.find(p => p.id === item.patient_id);
      const entry = { patientId:item.patient_id, name:item.patient_name||pat?.name||"—", hc:item.hc||pat?.hc||"—", detail:name+" · "+fmtDate(item.realized_date), txName:name };

      if (orthoRx.test(name)) { orthoRealized[rm-1]++; orthoRealizedPts[rm-1].push(entry); }
      if (isImplant(name)) {
        const mm = name.match(/(\d+)\s*implante/i);
        implantRealized[rm-1] += mm ? parseInt(mm[1]) : 1;
        implantRealizedPts[rm-1].push(entry);
      }
    });

    const patientsTotal   = hcByMonth.map(s => s.size);
    const patientsWithPay = hcPayByMonth.map(s => s.size);

    return {
      nums: { paid, budgeted, totalBudgeted, orthoRealized, orthoPending, implantRealized, implantPending,
              patientsTotal, patientsWithPay, totalPtsYear: hcYearAll.size, ptsWithPayYear: hcYearPay.size },
      pts:  { paid:paidPts, budgeted:budgetedPts, totalBudgeted:totalBudgetedPts, orthoRealized:orthoRealizedPts, orthoPending:orthoPendingPts, implantRealized:implantRealizedPts, implantPending:implantPendingPts },
    };
  };

  // Alias sin pts para comparación multi-año
  const computeYearData = (year) => computeYearFull(year).nums;

  const allYears = [...new Set([
    currentYear,
    ...payments.map(p => p.date ? parseInt(p.date.slice(0,4)) : 0).filter(y => y > 2000),
    ...patients.map(p => p.date ? parseInt(p.date.slice(0,4)) : 0).filter(y => y > 2000),
    ...items.map(i => {
      const d = i.realized_date || i.closed_date || "";
      return d ? parseInt(d.slice(0,4)) : 0;
    }).filter(y => y > 2000),
  ])].sort((a, b) => b - a);

  const [selectedYears, setSelectedYears] = useState([currentYear]);
  const [compareMode,   setCompareMode]   = useState(false);
  const [pointModal,    setPointModal]    = useState(null);

  // ── Clínica: estado local para inputs mensuales ───────────────────────────
  const [clinicLocal, setClinicLocal] = useState(() => {
    const map = {};
    clinicStats.forEach(s => {
      map[`${s.year}-${s.month}`] = {
        presupuestado: s.presupuestado != null ? String(s.presupuestado) : "",
        cobrado:       s.cobrado       != null ? String(s.cobrado)       : "",
        implantes:     s.implantes     != null ? String(s.implantes)     : "",
        ortodoncia:    s.ortodoncia    != null ? String(s.ortodoncia)    : "",
      };
    });
    return map;
  });
  const [savingClinic, setSavingClinic] = useState(new Set());

  const getCL = (year, month, field) => clinicLocal[`${year}-${month}`]?.[field] ?? "";
  const setCL = (year, month, field, val) => {
    const key = `${year}-${month}`;
    setClinicLocal(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val } }));
  };
  const saveClinicRow = async (year, month) => {
    const key = `${year}-${month}`;
    const v   = clinicLocal[key] || {};
    setSavingClinic(prev => new Set([...prev, key]));
    if (onSaveClinicStat) await onSaveClinicStat(year, month, {
      presupuestado: parseFloat(v.presupuestado) || 0,
      cobrado:       parseFloat(v.cobrado)       || 0,
      implantes:     parseInt(v.implantes)       || 0,
      ortodoncia:    parseInt(v.ortodoncia)      || 0,
    });
    setSavingClinic(prev => { const s = new Set(prev); s.delete(key); return s; });
  };
  const buildClinicData = (year) => {
    const a = (f) => Array.from({length:12}, (_,i) => {
      const s = clinicStats.find(s => s.year===year && s.month===i+1);
      return parseFloat(s?.[f]) || 0;
    });
    return { presupuestado:a("presupuestado"), cobrado:a("cobrado"), implantes:a("implantes"), ortodoncia:a("ortodoncia") };
  };
  const [excluded, setExcluded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("progreso_excluded") || "[]")); }
    catch { return new Set(); }
  });

  const excludeItem = (patientId, txName) => {
    const key = `${patientId}|${(txName||"").toLowerCase().trim()}`;
    setExcluded(prev => {
      const next = new Set(prev);
      next.add(key);
      try { localStorage.setItem("progreso_excluded", JSON.stringify([...next])); } catch {}
      return next;
    });
    setPointModal(prev => prev
      ? {...prev, list: prev.list.filter(i => `${i.patientId}|${(i.txName||"").toLowerCase().trim()}` !== key)}
      : null
    );
  };

  const YEAR_COLORS = ["#c9a84c","#3498db","#e74c3c","#2ecc71","#9b59b6"];

  const toggleYear = (y) => {
    if (compareMode) {
      setSelectedYears(prev =>
        prev.includes(y)
          ? prev.length > 1 ? prev.filter(x => x !== y) : prev
          : [...prev, y].slice(0, 4)
      );
    } else {
      setSelectedYears([y]);
    }
  };

  const buildAllSeries = () => {
    const years = compareMode ? [...selectedYears].sort() : [selectedYears[0] || currentYear];
    if (!compareMode) {
      const { nums: d, pts: p } = computeYearFull(years[0]);
      return {
        billing:  [
          { label:"Pagos cobrados",        data: d.paid,         color:"#2ecc71", pts: p.paid },
          { label:"Presupuestado c/pagos", data: d.budgeted,     color:"#c9a84c", pts: p.budgeted },
          { label:"Total presupuestado",   data: d.totalBudgeted, color:"#3498db", pts: p.totalBudgeted },
        ],
        ortho:    [
          { label:"Realizadas",       data: d.orthoRealized,   color:"#9b59b6", pts: p.orthoRealized },
          { label:"Pendientes",       data: d.orthoPending,    color:"#e74c3c", pts: p.orthoPending },
        ],
        implants: [
          { label:"Realizados",       data: d.implantRealized, color:"#3498db", pts: p.implantRealized },
          { label:"Pendientes",       data: d.implantPending,  color:"#e67e22", pts: p.implantPending },
        ],
      };
    }
    const yds = years.map((y, i) => ({ y, c: YEAR_COLORS[i % YEAR_COLORS.length], d: computeYearData(y) }));
    return {
      billing:  yds.map(({y,c,d}) => ({ label:`Facturación ${y}`, data: d.paid,            color: c })),
      ortho:    yds.map(({y,c,d}) => ({ label:`Realizadas ${y}`,  data: d.orthoRealized,   color: c })),
      implants: yds.map(({y,c,d}) => ({ label:`Realizados ${y}`,  data: d.implantRealized, color: c })),
    };
  };

  const allSeries = buildAllSeries();

  // ── Efectividad ───────────────────────────────────────────────────────────
  const yearFull = !compareMode ? computeYearFull(selectedYears[0] || currentYear) : null;
  const sum12    = arr => arr.reduce((a, b) => a + b, 0);
  const safePct  = (n, d) => d > 0 ? Math.round(n / d * 100) : null;

  let globalEfect = null, billStatsRows = [], orthoStatsRows = [], implStatsRows = [];
  if (yearFull && !compareMode) {
    const d = yearFull.nums;
    const tp = sum12(d.paid), tb = sum12(d.totalBudgeted), bwp = sum12(d.budgeted);
    const oR = sum12(d.orthoRealized),   oP = sum12(d.orthoPending);
    const iR = sum12(d.implantRealized), iP = sum12(d.implantPending);
    globalEfect = {
      billAll: safePct(tp, tb), billPay: safePct(tp, bwp),
      ortho: safePct(oR, oR + oP), impl: safePct(iR, iR + iP),
      tp, tb, bwp, oR, oP, iR, iP,
      totalPts: d.totalPtsYear, ptsWithPay: d.ptsWithPayYear,
      ptsPct: safePct(d.ptsWithPayYear, d.totalPtsYear),
    };
    billStatsRows = [
      { label: "Efect. s/Total", data: d.paid.map((v, i) => safePct(v, d.totalBudgeted[i])), color: "#3498db" },
      { label: "Efect. c/Pagos", data: d.paid.map((v, i) => safePct(v, d.budgeted[i])),      color: "#2ecc71" },
      { label: "Pacientes",      data: d.patientsTotal.map((v, i) => v > 0 ? `${d.patientsWithPay[i]}/${v}` : null), color: "#e67e22", isRaw: true },
    ];
    orthoStatsRows = [{ label: "Efectividad", data: d.orthoRealized.map((v, i)  => safePct(v, v + d.orthoPending[i])),   color: "#9b59b6" }];
    implStatsRows  = [{ label: "Efectividad", data: d.implantRealized.map((v, i) => safePct(v, v + d.implantPending[i])), color: "#3498db" }];
  }

  const fmtEurK = (v) => {
    if (v === 0) return "0€";
    if (v >= 10000) return `${Math.round(v/1000)}k€`;
    if (v >= 1000)  return `${(v/1000).toFixed(1)}k€`;
    return `${Math.round(v)}€`;
  };
  const fmtInt = (v) => String(Math.round(v));

  const makeSVG = (seriesData, formatVal, W=900, H=220, statsRowsData=[], targetLine=null) => {
    const PL=120, PR=20, PT=40, PB=36;
    const LBL_H=16, VAL_H=22, STAT_H=20;
    const SVG_H = H + seriesData.length*(LBL_H+VAL_H) + statsRowsData.length*STAT_H + 16;
    const CW = W - PL - PR, CH = H - PT - PB;
    const allVals = seriesData.flatMap(s => s.data);
    const maxVal  = Math.max(...allVals, targetLine?.value ?? 1, 1);
    const yMax    = maxVal <= 5 ? maxVal + 1 : Math.ceil(maxVal * 1.15);
    const gridVals = [0,1,2,3,4].map(i => Math.round(yMax * i / 4));
    const xPos = i => (PL + (i/11) * CW).toFixed(1);
    const yPos = v => (PT + CH - (v/yMax) * CH).toFixed(1);
    const pathD = data => data.map((v,i) => `${i===0?'M':'L'}${xPos(i)},${yPos(v)}`).join(' ');

    const grid = gridVals.map(v =>
      `<line x1="${PL}" y1="${yPos(v)}" x2="${W-PR}" y2="${yPos(v)}" stroke="#e2e5ed" stroke-width="1" stroke-dasharray="4,3"/>` +
      `<text x="${PL-6}" y="${(parseFloat(yPos(v))+4).toFixed(1)}" text-anchor="end" font-size="10" fill="#888">${formatVal(v)}</text>`
    ).join('');

    const xAxis = `<line x1="${PL}" y1="${yPos(0)}" x2="${W-PR}" y2="${yPos(0)}" stroke="#ddd" stroke-width="1"/>`;

    const target = targetLine
      ? `<line x1="${PL}" y1="${yPos(targetLine.value)}" x2="${W-PR}" y2="${yPos(targetLine.value)}" stroke="${targetLine.color||'#e74c3c'}" stroke-width="2" stroke-dasharray="8,5"/>` +
        `<text x="${W-PR-4}" y="${(parseFloat(yPos(targetLine.value))-5).toFixed(1)}" text-anchor="end" font-size="11" fill="${targetLine.color||'#e74c3c'}" font-weight="700">${targetLine.label||formatVal(targetLine.value)}</text>`
      : '';

    const xLabels = MONTHS_SHORT.map((m,i) =>
      `<text x="${xPos(i)}" y="${H-6}" text-anchor="middle" font-size="10" fill="#777">${m}</text>`
    ).join('');

    const paths = seriesData.map(s =>
      `<path d="${pathD(s.data)}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
    ).join('');

    const dots = seriesData.map(s =>
      s.data.map((v,i) =>
        `<circle cx="${xPos(i)}" cy="${yPos(v)}" r="4" fill="${s.color}" stroke="#fff" stroke-width="1.5"/>`
      ).join('')
    ).join('');

    // 2 filas por serie: label centrado + valores
    const valueRows = [...seriesData].reverse().map((s, rsi) => {
      const baseY = H + 8 + rsi*(LBL_H+VAL_H);
      const lblY  = baseY + LBL_H;
      const valY  = baseY + LBL_H + VAL_H;
      const rect  = `<rect x="${PL}" y="${baseY+2}" width="${CW}" height="${LBL_H}" fill="${s.color}18"/>`;
      const lbl   = `<text x="${(PL+CW/2).toFixed(1)}" y="${lblY-2}" text-anchor="middle" font-size="13" fill="${s.color}" font-weight="700">${s.label}</text>`;
      const vals  = s.data.map((v, mi) =>
        `<text x="${xPos(mi)}" y="${valY}" text-anchor="middle" font-size="16" fill="${v>0?s.color:'#ccc'}" font-weight="${v>0?'700':'400'}">${v>0?formatVal(v):'—'}</text>`
      ).join('');
      return rect + lbl + vals;
    }).join('');

    const statsRowsSVG = statsRowsData.map((sr, sri) => {
      const rowY = (H + 8 + seriesData.length*(LBL_H+VAL_H) + sri*STAT_H + STAT_H).toFixed(1);
      const lbl  = `<text x="${PL-6}" y="${rowY}" text-anchor="end" font-size="11" fill="${sr.color}" font-weight="700">${sr.label}</text>`;
      const vals = sr.data.map((v, mi) =>
        `<text x="${xPos(mi)}" y="${rowY}" text-anchor="middle" font-size="14" fill="${v!=null?sr.color:'#ccc'}" font-weight="${v!=null?'700':'400'}">${v!=null?(sr.isRaw?v:v+'%'):'—'}</text>`
      ).join('');
      return lbl + vals;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${SVG_H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">${grid}${xAxis}${target}${xLabels}${paths}${dots}${valueRows}${statsRowsSVG}</svg>`;
  };

  const LineChart = ({ title, series, formatVal, statsRows = [], targetLine = null }) => {
    const W=900, H=220, PL=120, PR=20, PT=40, PB=36;
    const CW=W-PL-PR, CH=H-PT-PB;
    // Cada serie ocupa 2 filas: una de label centrado + una de valores
    const LBL_H = 16, VAL_H = 22, STAT_H = 20;
    const SVG_H = H + series.length*(LBL_H+VAL_H) + statsRows.length*STAT_H + 16;
    const allVals = series.flatMap(s=>s.data);
    const maxVal  = Math.max(...allVals, targetLine?.value ?? 1, 1);
    const yMax    = maxVal<=5 ? maxVal+1 : Math.ceil(maxVal*1.15);
    const gridVals= [0,1,2,3,4].map(i=>Math.round(yMax*i/4));
    const xPos = i => PL+(i/11)*CW;
    const yPos = v => PT+CH-(v/yMax)*CH;
    const pathD= data=>data.map((v,i)=>`${i===0?'M':'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');

    return (
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,color:"#555",letterSpacing:2,fontWeight:700,marginBottom:8,textTransform:"uppercase"}}>{title}</div>
        <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e5ed",padding:"4px 0",overflow:"hidden"}}>
          <svg viewBox={`0 0 ${W} ${SVG_H}`} style={{width:"100%",display:"block"}}>
            {gridVals.map(v=>(
              <g key={v}>
                <line x1={PL} y1={yPos(v)} x2={W-PR} y2={yPos(v)} stroke="#e2e5ed" strokeWidth={1} strokeDasharray="4,3"/>
                <text x={PL-6} y={yPos(v)+4} textAnchor="end" fontSize={10} fill="#888">{formatVal(v)}</text>
              </g>
            ))}
            <line x1={PL} y1={yPos(0)} x2={W-PR} y2={yPos(0)} stroke="#ddd" strokeWidth={1}/>
            {targetLine && (
              <g>
                <line x1={PL} y1={yPos(targetLine.value)} x2={W-PR} y2={yPos(targetLine.value)}
                  stroke={targetLine.color||"#e74c3c"} strokeWidth={2} strokeDasharray="8,5"/>
                <text x={W-PR-4} y={yPos(targetLine.value)-5} textAnchor="end"
                  fontSize={11} fill={targetLine.color||"#e74c3c"} fontWeight="700">
                  {targetLine.label || formatVal(targetLine.value)}
                </text>
              </g>
            )}
            {MONTHS_SHORT.map((m,i)=>(
              <text key={i} x={xPos(i)} y={H-6} textAnchor="middle" fontSize={10} fill="#777">{m}</text>
            ))}
            {series.map((s,si)=>(
              <path key={si} d={pathD(s.data)} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
            ))}
            {series.map((s,si)=>(
              <g key={si}>
                {s.data.map((v,mi)=>{
                  const cx=xPos(mi), cy=yPos(v);
                  const ptList=s.pts?.[mi]||[];
                  return (
                    <g key={mi}>
                      <circle cx={cx} cy={cy} r={4} fill={s.color} stroke="#fff" strokeWidth={1.5}/>
                      {ptList.length>0 && (
                        <circle cx={cx} cy={cy} r={16} fill="transparent" style={{cursor:"pointer"}}
                          onClick={()=>setPointModal({title:`${MONTHS_ES[mi]} — ${s.label}`, list:ptList})}/>
                      )}
                    </g>
                  );
                })}
              </g>
            ))}
            {/* Por cada serie: label centrado en su propia fila + fila de valores debajo */}
            {[...series].reverse().map((s,rsi)=>{
              const baseY = H + 8 + rsi*(LBL_H+VAL_H);
              const lblY  = baseY + LBL_H;
              const valY  = baseY + LBL_H + VAL_H;
              return (
                <g key={`row_${rsi}`}>
                  {/* Label centrado — sin riesgo de overlap */}
                  <rect x={PL} y={baseY+2} width={CW} height={LBL_H} fill={s.color+"11"}/>
                  <text x={PL+CW/2} y={lblY-2} textAnchor="middle" fontSize={13} fill={s.color} fontWeight="700">{s.label}</text>
                  {/* Valores mensuales */}
                  {s.data.map((v,mi)=>(
                    <text key={mi} x={xPos(mi)} y={valY}
                      textAnchor="middle" fontSize={16} fill={v>0 ? s.color : "#ccc"} fontWeight={v>0?"700":"400"}>
                      {v>0 ? formatVal(v) : "—"}
                    </text>
                  ))}
                </g>
              );
            })}
            {/* Filas de efectividad (%) */}
            {statsRows.map((sr, sri) => {
              const rowY = H + 8 + series.length*(LBL_H+VAL_H) + sri*STAT_H + STAT_H;
              return (
                <g key={`sr_${sri}`}>
                  <text x={PL-6} y={rowY} textAnchor="end" fontSize={11} fill={sr.color} fontWeight="700">{sr.label}</text>
                  {sr.data.map((v, mi) => (
                    <text key={mi} x={xPos(mi)} y={rowY}
                      textAnchor="middle" fontSize={14}
                      fill={v != null ? sr.color : "#ccc"}
                      fontWeight={v != null ? "700" : "400"}>
                      {v != null ? (sr.isRaw ? v : `${v}%`) : "—"}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  const printProgreso = () => {
    const yearLabel = compareMode ? selectedYears.join(", ") : String(selectedYears[0] || currentYear);
    const cs  = "background:#fff;border-radius:8px;border:1px solid #e2e5ed;padding:4px 0;margin-bottom:14px;overflow:hidden;page-break-inside:avoid;";
    const ts  = "font-size:10px;color:#555;letter-spacing:2px;font-weight:700;margin:0 0 5px;text-transform:uppercase;";
    const cc  = "background:#fff;border:1px solid #e2e5ed;border-radius:8px;padding:8px 12px;";
    const cn  = (c) => `font-size:18px;font-weight:800;color:${c};line-height:1;`;
    const csb = "font-size:10px;color:#aaa;margin-top:2px;";

    // ── Tarjetas Martin (2x2) ─────────────────────────────────────────────
    const martinCards = globalEfect ? `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
  <div style="${cc}"><div style="${ts}color:#c9a84c;">💰 Fact. s/Total</div><div style="${cn('#3498db')}">${globalEfect.billAll!=null?globalEfect.billAll+'%':'—'}</div><div style="${csb}">${fmtEur(globalEfect.tp)} / ${fmtEur(globalEfect.tb)}</div></div>
  <div style="${cc}"><div style="${ts}color:#c9a84c;">💰 Fact. c/Pagos</div><div style="${cn('#2ecc71')}">${globalEfect.billPay!=null?globalEfect.billPay+'%':'—'}</div><div style="${csb}">${fmtEur(globalEfect.tp)} / ${fmtEur(globalEfect.bwp)}</div></div>
  <div style="${cc}"><div style="${ts}color:#9b59b6;">🦷 Ortodoncia</div><div style="${cn('#9b59b6')}">${globalEfect.ortho!=null?globalEfect.ortho+'%':'—'}</div><div style="${csb}">${globalEfect.oR} realiz. · ${globalEfect.oP} pend.</div></div>
  <div style="${cc}"><div style="${ts}color:#3498db;">🔩 Implantes</div><div style="${cn('#3498db')}">${globalEfect.impl!=null?globalEfect.impl+'%':'—'}</div><div style="${csb}">${globalEfect.iR} realiz. · ${globalEfect.iP} pend.</div></div>
</div>` : '';

    // ── Tarjetas Clínica (2x2) ─────────────────────────────────────────────
    const clinicCards = `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
  <div style="${cc}"><div style="${ts}color:#c9a84c;">💰 Presupuestado</div><div style="${cn('#c9a84c')}">${clinicTotals.presupuestado>0?fmtEur(clinicTotals.presupuestado):'—'}</div><div style="${csb}">Total anual ${activeYear}</div></div>
  <div style="${cc}"><div style="${ts}color:#2ecc71;">💳 Cobrado</div><div style="${cn('#2ecc71')}">${clinicTotals.cobrado>0?fmtEur(clinicTotals.cobrado):'—'}</div><div style="${csb}">${clinicTotals.presupuestado>0?Math.round(clinicTotals.cobrado/clinicTotals.presupuestado*100)+'% sobre presup.':'—'}</div></div>
  <div style="${cc}"><div style="${ts}color:#3498db;">🔩 Implantes</div><div style="${cn('#3498db')}">${clinicTotals.implantes>0?clinicTotals.implantes:'—'}</div><div style="${csb}">Colocados ${activeYear}</div></div>
  <div style="${cc}"><div style="${ts}color:#9b59b6;">🦷 Ortodoncia</div><div style="${cn('#9b59b6')}">${clinicTotals.ortodoncia>0?clinicTotals.ortodoncia:'—'}</div><div style="${csb}">Casos ${activeYear}</div></div>
</div>`;

    // ── SVGs ──────────────────────────────────────────────────────────────
    const svgW = 860;
    const svgMartin1  = makeSVG(allSeries.billing,  fmtEurK, svgW, 200, billStatsRows);
    const svgMartin2  = makeSVG(allSeries.ortho,    fmtInt,  svgW, 200, orthoStatsRows);
    const svgMartin3  = makeSVG(allSeries.implants, fmtInt,  svgW, 200, implStatsRows);
    const svgClinic1  = makeSVG(clinicBillingSeries,  fmtEurK, svgW, 200, [], {value:90000,color:'#e74c3c',label:'Objetivo 90k'});
    const svgClinic2  = makeSVG(clinicImplantsSeries, fmtInt,  svgW, 200);
    const svgClinic3  = makeSVG(clinicOrthoSeries,    fmtInt,  svgW, 200);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Progreso Anual — ${yearLabel}</title>
<style>
*{box-sizing:border-box;}
body{font-family:'Segoe UI',sans-serif;color:#111;margin:0;padding:20px;font-size:12px;background:#f0f2f7;}
h1{font-size:16px;margin:0 0 2px;color:#2c3250;}
.sub{color:#666;margin-bottom:14px;font-size:11px;}
.split{display:grid;grid-template-columns:1fr 1fr;gap:0;}
.col{padding:0 10px;}
.col:first-child{border-right:2px solid #dde4ef;padding-left:0;}
.col:last-child{padding-right:0;}
.col-title{font-size:9px;letter-spacing:3px;font-weight:700;text-transform:uppercase;margin-bottom:10px;padding-bottom:4px;border-bottom:2px solid currentColor;}
@media print{body{padding:10px;background:#fff;} @page{size:A4 landscape;margin:1cm;}}
</style></head><body>
<h1>IMPLANTDENT — Progreso Anual ${yearLabel}</h1>
<div class="sub">Generado: ${new Date().toLocaleDateString('es-ES')}</div>
<div class="split">
  <div class="col">
    <div class="col-title" style="color:#c9a84c;">PRODUCCIÓN MARTIN</div>
    ${martinCards}
    <p style="${ts}">Cobrado vs Presupuestado</p><div style="${cs}">${svgMartin1}</div>
    <p style="${ts}">Ortodoncia</p><div style="${cs}">${svgMartin2}</div>
    <p style="${ts}">Implantes</p><div style="${cs}">${svgMartin3}</div>
  </div>
  <div class="col">
    <div class="col-title" style="color:#2980b9;">PRODUCCIÓN CLÍNICA <span style="font-weight:400;letter-spacing:0;text-transform:none;">(incluye la producción de Martin)</span></div>
    ${clinicCards}
    <p style="${ts}">Cobrado vs Presupuestado</p><div style="${cs}">${svgClinic1}</div>
    <p style="${ts}">Implantes</p><div style="${cs}">${svgClinic2}</div>
    <p style="${ts}">Ortodoncia</p><div style="${cs}">${svgClinic3}</div>
  </div>
</div>
</body></html>`;

    const w = window.open("","_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(), 400);
  };

  // ── datos para el lado clínica ───────────────────────────────────────────────
  const activeYear = selectedYears[0] || currentYear;
  const cd = buildClinicData(activeYear);
  const clinicTotals = {
    presupuestado: cd.presupuestado.reduce((a,b)=>a+b,0),
    cobrado:       cd.cobrado.reduce((a,b)=>a+b,0),
    implantes:     cd.implantes.reduce((a,b)=>a+b,0),
    ortodoncia:    cd.ortodoncia.reduce((a,b)=>a+b,0),
  };
  const clinicBillingSeries  = [{ label:"Cobrado",data:cd.cobrado,color:"#2ecc71" },{ label:"Presupuestado",data:cd.presupuestado,color:"#c9a84c" }];
  const clinicImplantsSeries = [{ label:"Implantes",data:cd.implantes,color:"#3498db" }];
  const clinicOrthoSeries    = [{ label:"Ortodoncia",data:cd.ortodoncia,color:"#9b59b6" }];

  // estilos reutilizables para tarjetas compactas
  const cc  = { background:"#fff", border:"1px solid #e2e5ed", borderRadius:8, padding:"8px 12px" };
  const ct  = { fontSize:9, letterSpacing:2, color:"#555", fontWeight:700, textTransform:"uppercase", marginBottom:5 };
  const cn  = (c) => ({ fontSize:18, fontWeight:800, color:c, lineHeight:1 });
  const csb = { fontSize:10, color:"#aaa", marginTop:2 };
  const inS = { width:"100%", background:"#f5f7fa", border:"1px solid #dde4ef", borderRadius:4, color:"#2c3250", padding:"3px 6px", fontSize:11, outline:"none", textAlign:"right", boxSizing:"border-box" };

  return (
    <div style={{margin:"0 -32px", background:"#f0f2f7"}}>
      {/* ── Barra superior ──────────────────────────────────────────────────── */}
      <div style={{padding:"0 32px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <button onClick={onClose}
          style={{background:"none",border:"1px solid #e2e5ed",borderRadius:8,color:"#555",cursor:"pointer",fontSize:13,padding:"5px 14px"}}>
          ← Volver
        </button>
        <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700}}>📈 PROGRESO ANUAL</div>
        <div style={{flex:1}}/>
        <button
          onClick={() => { setCompareMode(m => !m); if (compareMode) setSelectedYears([selectedYears[0]||currentYear]); }}
          style={{...s.btnDark, fontSize:11, padding:"5px 14px",
            ...(compareMode ? {background:"#c9a84c22",color:"#c9a84c",border:"1px solid #c9a84c"} : {})}}>
          {compareMode ? "✓ Comparando años" : "Comparar años"}
        </button>
        <button onClick={printProgreso} style={{...s.btnDark,fontSize:11,padding:"5px 14px"}}>🖨 Imprimir PDF</button>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:11,color:"#888",letterSpacing:1,marginRight:4}}>AÑO:</span>
        {allYears.map((y) => {
          const sel = selectedYears.includes(y);
          const col = compareMode && sel ? YEAR_COLORS[selectedYears.indexOf(y)] : "#c9a84c";
          return (
            <button key={y} onClick={() => toggleYear(y)}
              style={{background: sel ? col+"22" : "#f5f7fa", color: sel ? col : "#555",
                border: `2px solid ${sel ? col : "#e2e5ed"}`, borderRadius:8,
                padding:"5px 16px", cursor:"pointer", fontSize:13, fontWeight:700, transition:"all 0.15s"}}>
              {y}{y === currentYear ? " ★" : ""}
            </button>
          );
        })}
        {compareMode && <span style={{fontSize:11,color:"#aaa",marginLeft:4}}>Hasta 4 años</span>}
      </div>

      </div>{/* cierre padding barra superior */}

      {/* ── Split 50/50 ─────────────────────────────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",alignItems:"start"}}>

        {/* ════ PRODUCCIÓN MARTIN (izquierda) ════ */}
        <div style={{padding:"0 12px 32px 32px",borderRight:"2px solid #dde4ef"}}>
          <div style={{fontSize:10,color:"#c9a84c",letterSpacing:3,fontWeight:700,marginBottom:12}}>PRODUCCIÓN MARTIN</div>

          {globalEfect && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {/* Facturación s/total */}
              <div style={cc}>
                <div style={ct}>💰 Fact. s/Total</div>
                <div style={cn(globalEfect.billAll!=null?"#3498db":"#ccc")}>{globalEfect.billAll!=null?`${globalEfect.billAll}%`:"—"}</div>
                <div style={csb}>{fmtEur(globalEfect.tp)} / {fmtEur(globalEfect.tb)}</div>
              </div>
              {/* Facturación c/pagos */}
              <div style={cc}>
                <div style={ct}>💰 Fact. c/Pagos</div>
                <div style={cn(globalEfect.billPay!=null?"#2ecc71":"#ccc")}>{globalEfect.billPay!=null?`${globalEfect.billPay}%`:"—"}</div>
                <div style={csb}>{fmtEur(globalEfect.tp)} / {fmtEur(globalEfect.bwp)}</div>
              </div>
              {/* Ortodoncia */}
              <div style={cc}>
                <div style={ct}>🦷 Ortodoncia</div>
                <div style={cn(globalEfect.ortho!=null?"#9b59b6":"#ccc")}>{globalEfect.ortho!=null?`${globalEfect.ortho}%`:"—"}</div>
                <div style={csb}>{globalEfect.oR} realiz. · {globalEfect.oP} pend.</div>
              </div>
              {/* Implantes */}
              <div style={cc}>
                <div style={ct}>🔩 Implantes</div>
                <div style={cn(globalEfect.impl!=null?"#3498db":"#ccc")}>{globalEfect.impl!=null?`${globalEfect.impl}%`:"—"}</div>
                <div style={csb}>{globalEfect.iR} realiz. · {globalEfect.iP} pend.</div>
              </div>
            </div>
          )}

          {/* Placeholder indicadores pendientes */}
          {/* ── Efectividad ortodoncia Martin vs Clínica (desde mayo) ── */}
          {(()=>{
            const MAY = 4; // índice 0-based de mayo
            const martinByMonth = yearFull ? yearFull.nums.orthoRealized : Array(12).fill(0);
            const clinicByMonth = cd.ortodoncia;
            const martinTotal   = martinByMonth.slice(MAY).reduce((a,b)=>a+b,0);
            const clinicTotal   = clinicByMonth.slice(MAY).reduce((a,b)=>a+b,0);
            const clinicNet     = Math.max(0, clinicTotal - martinTotal);
            const martinPct     = clinicTotal > 0 ? Math.round(martinTotal / clinicTotal * 100) : null;
            const netPct        = clinicTotal > 0 ? 100 - martinPct : null;
            const meses         = MONTHS_SHORT.slice(MAY); // May→Dic
            return (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:9,color:"#888",letterSpacing:2,fontWeight:700,marginBottom:6}}>OTROS INDICADORES</div>
                <div style={{background:"#fff",borderRadius:8,border:"1px solid #e2e5ed",minHeight:292,padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:"#9b59b6",letterSpacing:2,fontWeight:700,marginBottom:4}}>EFECTIVIDAD ORTODONCIA</div>
                  <div style={{fontSize:10,color:"#888",marginBottom:12}}>Martin vs Clínica neta · desde mayo {activeYear}</div>

                  {/* Totales */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                    <div style={{background:"#f5f7fa",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#9b59b6",fontWeight:700,marginBottom:3}}>MARTIN</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#9b59b6",lineHeight:1}}>{martinTotal}</div>
                      {martinPct!=null && <div style={{fontSize:10,color:"#aaa",marginTop:2}}>{martinPct}%</div>}
                    </div>
                    <div style={{background:"#f5f7fa",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#3498db",fontWeight:700,marginBottom:3}}>CLÍNICA NETA</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#3498db",lineHeight:1}}>{clinicNet}</div>
                      {netPct!=null && <div style={{fontSize:10,color:"#aaa",marginTop:2}}>{netPct}%</div>}
                    </div>
                    <div style={{background:"#f5f7fa",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#555",fontWeight:700,marginBottom:3}}>TOTAL CLÍNICA</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#555",lineHeight:1}}>{clinicTotal}</div>
                      <div style={{fontSize:10,color:"#aaa",marginTop:2}}>100%</div>
                    </div>
                  </div>

                  {/* Barra de proporción */}
                  {clinicTotal > 0 && (
                    <div style={{borderRadius:4,overflow:"hidden",display:"flex",height:10,marginBottom:12}}>
                      <div style={{width:`${martinPct}%`,background:"#9b59b6",transition:"width 0.4s"}}/>
                      <div style={{flex:1,background:"#3498db"}}/>
                    </div>
                  )}
                  {clinicTotal === 0 && (
                    <div style={{borderRadius:4,height:10,background:"#eee",marginBottom:12}}/>
                  )}

                  {/* Tabla mensual Mayo→Dic */}
                  <div style={{fontSize:9,color:"#888",fontWeight:700,letterSpacing:1,marginBottom:4}}>POR MES (MAYO → DICIEMBRE)</div>
                  <div style={{display:"grid",gridTemplateColumns:`40px repeat(${meses.length},1fr)`,gap:0,fontSize:10}}>
                    <div style={{color:"#888"}}/>
                    {meses.map((m,i)=><div key={i} style={{textAlign:"center",color:"#888",fontWeight:700,paddingBottom:2}}>{m}</div>)}
                    {/* Martin */}
                    <div style={{color:"#9b59b6",fontWeight:700,paddingRight:4}}>M</div>
                    {martinByMonth.slice(MAY).map((v,i)=>(
                      <div key={i} style={{textAlign:"center",fontWeight:700,color:v>0?"#9b59b6":"#ddd"}}>{v>0?v:"—"}</div>
                    ))}
                    {/* Clínica neta */}
                    <div style={{color:"#3498db",fontWeight:700,paddingRight:4}}>C</div>
                    {clinicByMonth.slice(MAY).map((cv,i)=>{
                      const net = Math.max(0, cv - martinByMonth[MAY+i]);
                      return <div key={i} style={{textAlign:"center",fontWeight:700,color:net>0?"#3498db":"#ddd"}}>{net>0?net:"—"}</div>;
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ════ PRODUCCIÓN CLÍNICA (derecha) ════ */}
        <div style={{padding:"0 32px 16px 12px"}}>
          <div style={{fontSize:10,color:"#2980b9",letterSpacing:3,fontWeight:700,marginBottom:12}}>PRODUCCIÓN CLÍNICA <span style={{fontWeight:400,letterSpacing:0,textTransform:"none"}}>(incluye la producción de Martin)</span></div>

          {/* Tarjetas resumen */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            <div style={cc}>
              <div style={{...ct,color:"#c9a84c"}}>💰 Presupuestado</div>
              <div style={cn("#c9a84c")}>{clinicTotals.presupuestado>0?fmtEur(clinicTotals.presupuestado):"—"}</div>
              <div style={csb}>Total anual {activeYear}</div>
            </div>
            <div style={cc}>
              <div style={{...ct,color:"#2ecc71"}}>💳 Cobrado</div>
              <div style={cn("#2ecc71")}>{clinicTotals.cobrado>0?fmtEur(clinicTotals.cobrado):"—"}</div>
              <div style={csb}>{clinicTotals.presupuestado>0?`${Math.round(clinicTotals.cobrado/clinicTotals.presupuestado*100)}% sobre presup.`:"—"}</div>
            </div>
            <div style={cc}>
              <div style={{...ct,color:"#3498db"}}>🔩 Implantes</div>
              <div style={cn("#3498db")}>{clinicTotals.implantes>0?clinicTotals.implantes:"—"}</div>
              <div style={csb}>Colocados año {activeYear}</div>
            </div>
            <div style={cc}>
              <div style={{...ct,color:"#9b59b6"}}>🦷 Ortodoncia</div>
              <div style={cn("#9b59b6")}>{clinicTotals.ortodoncia>0?clinicTotals.ortodoncia:"—"}</div>
              <div style={csb}>Casos año {activeYear}</div>
            </div>
          </div>

          {/* Grid de entrada mensual */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:9,color:"#888",letterSpacing:2,fontWeight:700,marginBottom:6}}>DATOS MENSUALES {activeYear} — completar a fin de mes</div>
            <div style={{background:"#fff",borderRadius:8,border:"1px solid #e2e5ed",overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"44px 1fr 1fr 56px 56px",gap:0,background:"#f5f7fa",padding:"5px 10px",borderBottom:"1px solid #e2e5ed"}}>
                {["","Presupuestado","Cobrado","Impl.","Orto."].map((h,i)=>(
                  <div key={i} style={{fontSize:9,color:"#888",fontWeight:700,letterSpacing:1,textAlign:i>1?"center":"left"}}>{h}</div>
                ))}
              </div>
              {MONTHS_ES.map((mn,mi)=>{
                const m   = mi+1;
                const key = `${activeYear}-${m}`;
                const saving = savingClinic.has(key);
                return (
                  <div key={mi} style={{display:"grid",gridTemplateColumns:"44px 1fr 1fr 56px 56px",gap:4,padding:"4px 10px",borderBottom:"1px solid #f0f2f7",alignItems:"center",background:mi%2===0?"#fff":"#fafbfd"}}>
                    <div style={{fontSize:11,color:"#888",fontWeight:600}}>{MONTHS_SHORT[mi]}</div>
                    {["presupuestado","cobrado","implantes","ortodoncia"].map(field=>(
                      <input key={field} type="number" placeholder="0"
                        value={getCL(activeYear,m,field)}
                        onChange={e=>setCL(activeYear,m,field,e.target.value)}
                        onBlur={()=>saveClinicRow(activeYear,m)}
                        style={{...inS,opacity:saving?0.5:1}}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>{/* fin split cards */}

      {/* ── Filas de gráficos comparativos (Martin izq | Clínica der) ──────── */}
      {[
        {
          titleM:"Cobrado vs Presupuestado", seriesM:allSeries.billing,  fmtM:fmtEurK, statsM:billStatsRows,
          titleC:"Cobrado vs Presupuestado CLÍNICA (Incluye producción Martin)", seriesC:clinicBillingSeries, fmtC:fmtEurK, targetC:{value:90000,color:"#e74c3c",label:"Objetivo 90k"},
        },
        {
          titleM:"Ortodoncia", seriesM:allSeries.ortho,    fmtM:fmtInt, statsM:orthoStatsRows,
          titleC:"Ortodoncia CLÍNICA (Incluye producción Martin)", seriesC:clinicOrthoSeries,  fmtC:fmtInt,
        },
        {
          titleM:"Implantes",  seriesM:allSeries.implants, fmtM:fmtInt, statsM:implStatsRows,
          titleC:"Implantes CLÍNICA (Incluye producción Martin)",  seriesC:clinicImplantsSeries, fmtC:fmtInt,
        },
      ].map(({titleM,seriesM,fmtM,statsM=[],titleC,seriesC,fmtC,targetC=null},ri)=>(
        <div key={ri} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0,borderTop:"1px solid #dde4ef"}}>
          <div style={{padding:"16px 12px 0 32px",borderRight:"2px solid #dde4ef"}}>
            <LineChart title={titleM} series={seriesM} formatVal={fmtM} statsRows={statsM}/>
          </div>
          <div style={{padding:"16px 32px 0 12px"}}>
            <LineChart title={titleC} series={seriesC} formatVal={fmtC} targetLine={targetC}/>
          </div>
        </div>
      ))}

      {pointModal && (
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
          onClick={()=>setPointModal(null)}>
          <div style={{background:"#f5f7fa",borderRadius:14,maxWidth:460,width:"100%",maxHeight:"78vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #0005"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #e2e5ed",flexShrink:0}}>
              <div style={{fontWeight:700,color:"#2c3250",fontSize:14}}>{pointModal.title}</div>
              <button onClick={()=>setPointModal(null)} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:22,lineHeight:1,padding:"0 4px"}}>×</button>
            </div>
            <div style={{overflowY:"auto",padding:"12px 16px",flex:1}}>
              {pointModal.list.length===0 && <div style={{color:"#888",textAlign:"center",padding:20}}>Sin datos</div>}
              {pointModal.list.map((item,i)=>{
                const pat=patients.find(p=>p.id===item.patientId);
                const clickable=pat&&onOpenPatient;
                return (
                  <div key={i} style={{...s.card,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                    <div onClick={()=>{if(clickable){onOpenPatient(pat);setPointModal(null);}}}
                      style={{flex:1,cursor:clickable?"pointer":"default",minWidth:0}}
                      onMouseEnter={e=>{if(clickable)e.currentTarget.style.opacity="0.75";}}
                      onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>
                      <div style={{fontWeight:700,color:"#2c3250",fontSize:14,display:"flex",alignItems:"center",gap:6}}>
                        {item.name}
                        {clickable && <span style={{color:"#c9a84c",fontSize:16,lineHeight:1}}>›</span>}
                      </div>
                      <div style={{fontSize:12,color:"#777",marginTop:2}}>{item.hc!=="—"?`HC ${item.hc} · `:""}{item.detail}</div>
                    </div>
                    {item.txName && (
                      <button onClick={()=>excludeItem(item.patientId, item.txName)}
                        title="Excluir de Progreso"
                        style={{background:"#fff0f0",border:"1px solid #e74c3c55",borderRadius:6,color:"#e74c3c",
                          padding:"4px 8px",cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0}}>
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EstadisticasPanel ───────────────────────────────────────────────────────
function EstadisticasPanel({ payments, items, patients, onOpenPatient, onRefreshItems, onSync, onEnsureArchived, archivedLoaded, clinicStats=[], onSaveClinicStat }) {
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth();
  const [from,         setFrom]   = useState(`${y}-${String(mo+1).padStart(2,"0")}-01`);
  const [to,           setTo]     = useState(today());
  const [activeDetail,  setDetail]      = useState(null);
  const [busy,          setBusy]        = useState(null);
  const [syncing,       setSyncing]     = useState(false);
  const [showProgreso,  setShowProgreso] = useState(false);
  const [excluded, setExcluded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("progreso_excluded") || "[]")); }
    catch { return new Set(); }
  });
  const excludeSyn = (patientId, txName) => {
    const key = `${patientId}|${(txName||"").toLowerCase().trim()}`;
    setExcluded(prev => {
      const next = new Set(prev); next.add(key);
      try { localStorage.setItem("progreso_excluded", JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const restoreSyn = (patientId, txName) => {
    const key = `${patientId}|${(txName||"").toLowerCase().trim()}`;
    setExcluded(prev => {
      const next = new Set(prev); next.delete(key);
      try { localStorage.setItem("progreso_excluded", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  useEffect(() => {
    setSyncing(true);
    onSync().finally(() => setSyncing(false));
    if (onEnsureArchived) onEnsureArchived();
  }, []);

  const inRange = (d) => {
    if (!d) return false;
    const ds = d.slice(0, 10);
    return ds >= from && ds <= to;
  };

  // Pagos: filtrados por rango de fechas
  const rangePayments = payments.filter(pay => inRange(pay.date));
  const totalPaid     = rangePayments.reduce((a,p) => a + (parseFloat(p.amount)||0), 0);

  // Implantes y ortodoncia: realizados solo en el rango, pendientes siempre
  const implantRx    = /implant/i;
  const implantExcRx = /corona|aditamento/i;
  const isImplant    = (name) => implantRx.test(name) && !implantExcRx.test(name);
  const orthoRx      = /ortodoncia|orthodontic|invisalign|invisaling|invisible\s|ortod|placa expansiva|hass/i;

  // Items de treatment_items: realizados solo en rango, pendientes siempre
  const implantItems = items.filter(i => {
    if (!isImplant(i.treatment_name || "")) return false;
    if (i.realized_date) return inRange(i.realized_date);
    const pat = patients.find(p => p.id === i.patient_id);
    return pat?.status !== "frío";
  });
  const orthoItems = items.filter(i => {
    if (!orthoRx.test(i.treatment_name || "")) return false;
    return i.realized_date ? inRange(i.realized_date) : true;
  });

  // Suplementar con ítems de pacientes sin registro en treatment_items
  const inItemsKeys   = new Set(items.map(i => `${i.patient_id}|${(i.treatment_name||"").toLowerCase().trim()}`));
  const patientsWithPayment = new Set(payments.map(p => p.patient_id));
  patients.forEach(pat => {
    const hasPayment = patientsWithPayment.has(pat.id);
    getTxItems(pat).forEach(tx => {
      const key = `${pat.id}|${(tx.name||"").toLowerCase().trim()}`;
      if (inItemsKeys.has(key)) return;
      if (excluded.has(key)) return;
      const syn = { id:null, patient_id:pat.id, patient_name:pat.name, hc:pat.hc,
                    treatment_name:tx.name, amount:tx.value||0, realized_date:null, _synthetic:true };
      // Ortodoncia: todos los pacientes
      if (orthoRx.test(tx.name||"")) orthoItems.push(syn);
      // Implantes: solo si tiene al menos un pago registrado (en curso ya están en treatment_items)
      if (isImplant(tx.name||"") && hasPayment && pat.status !== "frío") implantItems.push(syn);
    });
  });

  // Ítems excluidos manualmente (falsos positivos) para poder restaurarlos
  const excludedOrthoItems = [];
  const excludedImplantItems = [];
  patients.forEach(pat => {
    getTxItems(pat).forEach(tx => {
      const key = `${pat.id}|${(tx.name||"").toLowerCase().trim()}`;
      if (!excluded.has(key)) return;
      const syn = { patient_id:pat.id, patient_name:pat.name, hc:pat.hc, treatment_name:tx.name };
      if (orthoRx.test(tx.name||"")) excludedOrthoItems.push(syn);
      if (isImplant(tx.name||"")) excludedImplantItems.push(syn);
    });
  });

  let implantTotal = 0;
  implantItems.forEach(item => {
    if (!item.realized_date) return;
    const m = (item.treatment_name||"").match(/(\d+)\s*implante/i);
    implantTotal += m ? parseInt(m[1]) : 1;
  });
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

    const implantRows = implantItems.filter(i=>i.realized_date).map(item => {
      const pat  = findPatient(item.patient_id);
      const hc   = item.hc || pat?.hc || "—";
      const name = item.patient_name || pat?.name || "—";
      return `<tr><td>${hc}</td><td>${name}</td><td>${item.treatment_name}</td><td>${fmtDate(item.realized_date)}</td></tr>`;
    }).join("");

    const orthoRows = orthoItems.filter(i=>i.realized_date).map(item => {
      const pat  = findPatient(item.patient_id);
      const hc   = item.hc || pat?.hc || "—";
      const name = item.patient_name || pat?.name || "—";
      return `<tr><td>${hc}</td><td>${name}</td><td>${item.treatment_name}</td><td>${fmtDate(item.realized_date)}</td><td>${item.notes||"—"}</td></tr>`;
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

<h2>Implantes realizados</h2>
${implantItems.filter(i=>i.realized_date).length === 0
  ? '<div class="none">Sin implantes realizados</div>'
  : `<table><thead><tr><th>HC</th><th>Paciente</th><th>Tratamiento</th><th>Fecha colocación</th></tr></thead><tbody>${implantRows}</tbody></table>`}

<h2>Ortodoncia realizada</h2>
${orthoItems.filter(i=>i.realized_date).length === 0
  ? '<div class="none">Sin ortodoncia realizada</div>'
  : `<table><thead><tr><th>HC</th><th>Paciente</th><th>Tratamiento</th><th>Fecha inicio</th><th>Notas</th></tr></thead><tbody>${orthoRows}</tbody></table>`}

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

  const ItemRow = ({ item, qty, type }) => {
    const [editing,      setEditing]      = useState(false);
    const [pendingDate,  setPendingDate]  = useState(today());
    const [pendingNotes, setPendingNotes] = useState("");
    const pat       = findPatient(item.patient_id);
    const name      = item.patient_name || pat?.name || "—";
    const realizado = !!item.realized_date;
    const busyKey   = item.id ?? `syn_${item.patient_id}_${(item.treatment_name||"").slice(0,30)}`;
    const loading   = busy === busyKey;

    const doRealize = async (e) => {
      e.stopPropagation();
      setBusy(busyKey);
      if (item._synthetic) {
        const rec = { patient_id:item.patient_id, patient_name:item.patient_name, hc:item.hc,
                      treatment_name:item.treatment_name, amount:item.amount,
                      realized_date: pendingDate || today() };
        if (type === "ortho") rec.notes = pendingNotes;
        await supabase.from("treatment_items").insert([rec]);
      } else {
        const upd = { realized_date: pendingDate || today() };
        if (type === "ortho") upd.notes = pendingNotes;
        await supabase.from("treatment_items").update(upd).eq("id", item.id);
      }
      await onRefreshItems();
      setBusy(null); setEditing(false);
    };

    const doUnrealize = async (e) => {
      e.stopPropagation();
      setBusy(busyKey);
      const upd = { realized_date: null };
      if (type === "ortho") upd.notes = null;
      await supabase.from("treatment_items").update(upd).eq("id", item.id);
      await onRefreshItems();
      setBusy(null);
    };

    const startEditing = (e) => {
      e.stopPropagation();
      setPendingDate(today()); setPendingNotes(item.notes || "");
      setEditing(true);
    };

    return (
      <div style={{...s.card, marginBottom:6, opacity: loading ? 0.5 : 1}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <div onClick={() => pat && onOpenPatient(pat)} style={{flex:1, cursor: pat ? "pointer" : "default"}}>
            <div style={{fontWeight:700, color:"#2c3250", fontSize:14}}>{name}</div>
            <div style={{fontSize:12, color:"#777", marginTop:2}}>
              {item.treatment_name}{qty > 1 ? ` · ${qty} uds` : ""} · {fmtEur(item.amount)}
            </div>
            {realizado && (
              <div style={{fontSize:11, color:"#2ecc71", marginTop:3}}>
                {type==="ortho" ? "Inicio" : "Colocado"}: {fmtDate(item.realized_date)}
                {type==="ortho" && item.notes ? ` · ${item.notes}` : ""}
              </div>
            )}
            {(() => {
              const todayStr = today();
              const future = (pat?.appointments||[])
                .filter(a => a.date && a.date >= todayStr)
                .sort((a,b) => a.date.localeCompare(b.date));
              if (!future.length) return null;
              return (
                <div style={{fontSize:11, color:"#3498db", marginTop:4}}>
                  {future.map((a,i) => (
                    <span key={i} style={{marginRight:10}}>
                      📅 {fmtDate(a.date)}{a.time ? ` ${a.time}` : ""}{a.doctors ? ` · ${a.doctors}` : ""}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
          <div style={{display:"flex", gap:6, alignItems:"center", flexShrink:0, marginLeft:12}}>
            {!realizado && !editing && (
              <button onClick={startEditing} disabled={loading}
                style={{background:"#ffffff", border:"1px solid #555", borderRadius:6,
                  color:"#888", padding:"4px 10px", cursor:"pointer", fontSize:11, fontWeight:700}}>
                Pendiente
              </button>
            )}
            {realizado && (
              <button onClick={doUnrealize} disabled={loading}
                style={{background:"#2ecc7122", border:"1px solid #2ecc71", borderRadius:6,
                  color:"#2ecc71", padding:"4px 10px", cursor:"pointer", fontSize:11, fontWeight:700}}>
                Realizado
              </button>
            )}
            {pat && <span onClick={() => onOpenPatient(pat)} style={{color:"#c9a84c",fontSize:20,lineHeight:1,cursor:"pointer"}}>›</span>}
            {item._synthetic
              ? <button onClick={e=>{e.stopPropagation();excludeSyn(item.patient_id,item.treatment_name);}}
                  disabled={loading}
                  style={{background:"#fff0f0",border:"1px solid #e74c3c88",borderRadius:6,
                    color:"#e74c3c",padding:"4px 8px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                  ×
                </button>
              : <button onClick={e => deleteItem(e, item.id)} disabled={loading}
                  style={{background:"#fff0f0",border:"1px solid #e74c3c88",borderRadius:6,
                    color:"#e74c3c",padding:"4px 8px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                  ×
                </button>
            }
          </div>
        </div>
        {editing && (
          <div style={{marginTop:8, display:"flex", gap:8, alignItems:"flex-end", flexWrap:"wrap",
            borderTop:"1px solid #e2e5ed", paddingTop:8}}>
            <div>
              <label style={{...s.label, display:"block"}}>{type==="ortho" ? "Fecha inicio" : "Fecha colocación"}</label>
              <input type="date" value={pendingDate} onChange={e=>setPendingDate(e.target.value)}
                style={{...s.smInput, width:160}}/>
            </div>
            {type === "ortho" && (
              <div style={{flex:1, minWidth:180}}>
                <label style={{...s.label, display:"block"}}>Notas</label>
                <input type="text" value={pendingNotes} onChange={e=>setPendingNotes(e.target.value)}
                  placeholder="ej: Invisalign, bracket metálico..." style={s.smInput}/>
              </div>
            )}
            <div style={{display:"flex", gap:6}}>
              <button onClick={doRealize} disabled={loading}
                style={{background:"#2ecc71", border:"none", borderRadius:6, color:"#fff",
                  padding:"7px 14px", cursor:"pointer", fontSize:12, fontWeight:700}}>
                Confirmar
              </button>
              <button onClick={e=>{e.stopPropagation();setEditing(false);}}
                style={{background:"#eee", border:"1px solid #ccc", borderRadius:6,
                  color:"#555", padding:"7px 12px", cursor:"pointer", fontSize:12}}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (showProgreso) {
    return (
      <ProgresoPanel
        payments={payments}
        items={items}
        patients={patients}
        clinicStats={clinicStats}
        onSaveClinicStat={onSaveClinicStat}
        onClose={() => setShowProgreso(false)}
        onOpenPatient={onOpenPatient}
      />
    );
  }

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
        <div style={{display:"flex",alignItems:"flex-end"}}>
          <button onClick={() => setShowProgreso(true)}
            style={{...s.btnGold, fontSize:12, padding:"9px 18px", display:"flex", alignItems:"center", gap:6}}>
            📈 Progreso
          </button>
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
                return <ItemRow key={item.id} item={item} qty={m ? parseInt(m[1]) : 1} type="implant"/>;
              })
          }
          {excludedImplantItems.length > 0 && (
            <div style={{marginTop:16,borderTop:"1px dashed #ccc",paddingTop:12}}>
              <div style={{fontSize:11,color:"#999",letterSpacing:1,marginBottom:8,fontWeight:700}}>EXCLUIDOS ({excludedImplantItems.length}) — click Restaurar para recuperar</div>
              {excludedImplantItems.map((item,i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"#f9f9f9",borderRadius:6,marginBottom:4,opacity:0.7}}>
                  <div style={{flex:1,fontSize:13}}>
                    <span style={{fontWeight:600,color:"#555"}}>{item.patient_name}</span>
                    {item.hc && <span style={{color:"#999",fontSize:11}}> · HC {item.hc}</span>}
                    <div style={{fontSize:11,color:"#aaa"}}>{item.treatment_name}</div>
                  </div>
                  <button onClick={()=>restoreSyn(item.patient_id,item.treatment_name)}
                    style={{background:"#e8f5e9",border:"1px solid #4caf5088",borderRadius:6,
                      color:"#2e7d32",padding:"4px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeDetail === "ortodoncia" && (
        <div>
          <div style={{fontSize:11,color:"#9b59b6",letterSpacing:2,marginBottom:8,fontWeight:700}}>ORTODONCIA — TODOS LOS TRATAMIENTOS</div>
          <div style={{fontSize:12,color:"#555",marginBottom:12}}>Marcá "Realizado" para sumar al contador. Eliminá falsos positivos con ×.</div>
          {orthoItems.length === 0
            ? <div style={{color:"#555",padding:20,textAlign:"center"}}>Sin ortodoncia en este período</div>
            : orthoItems.map(item => <ItemRow key={item.id} item={item} qty={1} type="ortho"/>)
          }
          {excludedOrthoItems.length > 0 && (
            <div style={{marginTop:16,borderTop:"1px dashed #ccc",paddingTop:12}}>
              <div style={{fontSize:11,color:"#999",letterSpacing:1,marginBottom:8,fontWeight:700}}>EXCLUIDOS ({excludedOrthoItems.length}) — click Restaurar para recuperar</div>
              {excludedOrthoItems.map((item,i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"#f9f9f9",borderRadius:6,marginBottom:4,opacity:0.7}}>
                  <div style={{flex:1,fontSize:13}}>
                    <span style={{fontWeight:600,color:"#555"}}>{item.patient_name}</span>
                    {item.hc && <span style={{color:"#999",fontSize:11}}> · HC {item.hc}</span>}
                    <div style={{fontSize:11,color:"#aaa"}}>{item.treatment_name}</div>
                  </div>
                  <button onClick={()=>restoreSyn(item.patient_id,item.treatment_name)}
                    style={{background:"#e8f5e9",border:"1px solid #4caf5088",borderRadius:6,
                      color:"#2e7d32",padding:"4px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
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
function PagosExcelPanel({ patients, payments, onPaymentsChange }) {
  const [list1,   setList1]   = useState(null);  // agrupado por Nº presupuesto
  const [list2,   setList2]   = useState(null);  // coincidencias por nombre
  const [list3,   setList3]   = useState(null);  // sin ninguna coincidencia
  const [totals,  setTotals]  = useState(null);  // { excelTotal, matched1, matched2, unmatched }
  const [added1,  setAdded1]  = useState(new Set());  // presNums ya agregados
  const [loading, setLoading] = useState(new Set());  // claves en proceso
  const fileRef = useRef();

  const normalize = (s) =>
    (s || "").toString().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, "").trim();

  const namesMatch = (a, b) => {
    const na = normalize(a), nb = normalize(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const wa = na.split(/\s+/).filter(w => w.length > 2);
    const wb = nb.split(/\s+/).filter(w => w.length > 2);
    const shared = wa.filter(w => wb.includes(w));
    return shared.length >= 2 || (wa.length === 1 && shared.length === 1) || (wb.length === 1 && shared.length === 1);
  };

  const parseDate = (val) => {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val)) return val;
    if (typeof val === "string") { const d = new Date(val); if (!isNaN(d)) return d; }
    return null;
  };

  const fmt = (d) => {
    if (!d) return "—";
    return d.toLocaleDateString("es-ES", { day:"2-digit", month:"2-digit", year:"numeric" });
  };

  const toISO = (d) => {
    if (!d) return today();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };

  const fmtAmt = (n) => "€" + n.toLocaleString("es-ES", { minimumFractionDigits:2, maximumFractionDigits:2 });

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target.result, { type:"array", cellDates:true });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"" });

      const presMap  = new Map();  // presNum → entry
      const nameMap  = new Map();  // patientId → entry
      const noMatch  = [];         // filas sin ninguna coincidencia
      let excelTotal = 0;

      for (let i = 1; i < data.length; i++) {
        const row     = data[i];
        const dateObj = parseDate(row[1]);                    // col B
        const name    = (row[5]  || "").toString().trim();   // col F
        const presNum = (row[6]  || "").toString().trim();   // col G
        const rawAmt  = (row[10] || "").toString().trim();   // col K
        const amt     = parseFloat(rawAmt.replace(",", ".")) || 0;
        if (!name && !presNum) continue;
        excelTotal += amt;

        // Lista 1: coincidencia por Nº presupuesto
        if (presNum) {
          const pat = patients.find(p => {
            const pp = (p.budget_no || p.budgetNo || "").toString().trim();
            return pp && pp === presNum;
          }) || null;
          if (pat) {
            if (!presMap.has(presNum)) presMap.set(presNum, { patient:pat, presNum, totalAmt:0, latestDate:null });
            const e = presMap.get(presNum);
            e.totalAmt += amt;
            if (dateObj && (!e.latestDate || dateObj > e.latestDate)) e.latestDate = dateObj;
            continue;
          }
        }

        // Lista 2: coincidencia por nombre
        if (name) {
          const pat = patients.find(p => namesMatch(name, p.name)) || null;
          if (pat) {
            if (!nameMap.has(pat.id)) nameMap.set(pat.id, { patient:pat, totalAmt:0, latestDate:null });
            const e = nameMap.get(pat.id);
            e.totalAmt += amt;
            if (dateObj && (!e.latestDate || dateObj > e.latestDate)) e.latestDate = dateObj;
            continue;
          }
        }

        // Lista 3: sin coincidencia
        noMatch.push({ name, presNum, amt, dateObj });
      }

      const sort = (arr) => arr.sort((a,b) => a.patient.name.localeCompare(b.patient.name, "es"));
      const l1 = sort(Array.from(presMap.values()));
      const l2 = sort(Array.from(nameMap.values()));
      setList1(l1);
      setList2(l2);
      setList3(noMatch);
      setTotals({
        excelTotal,
        matched1: l1.reduce((s,e) => s+e.totalAmt, 0),
        matched2: l2.reduce((s,e) => s+e.totalAmt, 0),
        unmatched: noMatch.reduce((s,r) => s+r.amt, 0),
      });
      setAdded1(new Set());
      setLoading(new Set());
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const addPay = async (entry) => {
    const key = entry.presNum;
    setLoading(prev => new Set([...prev, key]));
    await supabase.from("payments").insert([{
      id: genId(), patient_id: entry.patient.id,
      amount: entry.totalAmt,
      date: toISO(entry.latestDate),
      note: `Importado Excel · Pres. ${entry.presNum}`,
    }]);
    setAdded1(prev => new Set([...prev, key]));
    setLoading(prev => { const s = new Set(prev); s.delete(key); return s; });
    if (onPaymentsChange) onPaymentsChange();
  };

  const GRID1 = "2fr 1fr 1.2fr 1fr 100px";
  const HDR   = { fontSize:10, color:"#888", fontWeight:700, letterSpacing:1, textTransform:"uppercase" };

  return (
    <div>
      <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700,marginBottom:20}}>📂 IMPORTAR COBROS EXCEL</div>

      <div style={{background:"#fff",border:"2px dashed #c9a84c44",borderRadius:12,padding:"24px",marginBottom:20,textAlign:"center"}}>
        <div style={{fontSize:13,color:"#555",marginBottom:14}}>
          Seleccioná el Excel semanal de cobros.<br/>
          <span style={{fontSize:11,color:"#888"}}>Col B (fecha) · Col F (nombre) · Col G (Nº presupuesto) · Col K (importe)</span>
        </div>
        <button onClick={()=>fileRef.current.click()}
          style={{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:8,color:"#fff",padding:"10px 24px",cursor:"pointer",fontSize:13,fontWeight:700}}>
          📊 Seleccionar Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFile} style={{display:"none"}}/>
      </div>

      {list1 !== null && (
        <div>
          {/* ── Resumen de totales ───────────────────────────────────────── */}
          {totals && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
              {[
                { label:"Total Excel", amt:totals.excelTotal, color:"#2c3250" },
                { label:"Por presupuesto", amt:totals.matched1, color:"#27ae60" },
                { label:"Por nombre", amt:totals.matched2, color:"#e67e22" },
                { label:"Sin coincidencia", amt:totals.unmatched, color:"#e74c3c" },
              ].map(({label,amt,color})=>(
                <div key={label} style={{background:"#fff",border:"1px solid #e2e5ed",borderRadius:10,padding:"12px 16px"}}>
                  <div style={{fontSize:10,color:"#888",letterSpacing:1,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{label}</div>
                  <div style={{fontSize:18,fontWeight:700,color}}>{fmtAmt(amt)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Lista 1: por Nº presupuesto ─────────────────────────────── */}
          <div style={{marginBottom:28}}>
            <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700,marginBottom:10}}>
              COBROS POR Nº PRESUPUESTO ({list1.length})
            </div>

            {list1.length === 0 && (
              <div style={{color:"#aaa",fontSize:13,padding:"12px 0"}}>Sin coincidencias por número de presupuesto</div>
            )}

            {list1.length > 0 && (
              <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e5ed",overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:GRID1,gap:0,background:"#f5f7fa",padding:"8px 16px",borderBottom:"1px solid #e2e5ed"}}>
                  {["Paciente","Nº Presupuesto","Total Excel","Fecha cobro",""].map((h,i)=>(
                    <div key={i} style={HDR}>{h}</div>
                  ))}
                </div>
                {list1.map((e, i) => {
                  const done = added1.has(e.presNum);
                  const busy = loading.has(e.presNum);
                  return (
                    <div key={e.presNum} style={{display:"grid",gridTemplateColumns:GRID1,gap:0,padding:"10px 16px",borderBottom:"1px solid #f0f2f7",alignItems:"center",background:done?"#f0fdf4":i%2===0?"#fff":"#fafbfd"}}>
                      <div style={{fontWeight:600,color:"#2c3250",fontSize:13}}>{e.patient.name}</div>
                      <div style={{fontSize:13,color:"#c9a84c",fontWeight:700}}>{e.presNum}</div>
                      <div style={{fontSize:14,fontWeight:700,color:"#2c3250"}}>{fmtAmt(e.totalAmt)}</div>
                      <div style={{fontSize:12,color:"#888"}}>{fmt(e.latestDate)}</div>
                      <div>
                        {done
                          ? <span style={{color:"#27ae60",fontWeight:700,fontSize:12}}>✓ Agregado</span>
                          : <button onClick={()=>addPay(e)} disabled={busy}
                              style={{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:6,color:"#fff",padding:"6px 14px",cursor:busy?"not-allowed":"pointer",fontSize:12,fontWeight:700,opacity:busy?0.6:1}}>
                              {busy?"...":"Agregar"}
                            </button>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Lista 2: por nombre ──────────────────────────────────────── */}
          <div>
            <div style={{fontSize:11,color:"#888",letterSpacing:2,fontWeight:700,marginBottom:10}}>
              COINCIDENCIAS POR NOMBRE ({list2.length})
            </div>

            {list2.length === 0 && (
              <div style={{color:"#aaa",fontSize:13,padding:"12px 0"}}>Sin coincidencias adicionales por nombre</div>
            )}

            {list2.length > 0 && (
              <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e5ed",overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 2fr",gap:0,background:"#f5f7fa",padding:"8px 16px",borderBottom:"1px solid #e2e5ed"}}>
                  {["Paciente","Total Excel","Fecha cobro","Nº Presupuesto en sistema"].map((h,i)=>(
                    <div key={i} style={HDR}>{h}</div>
                  ))}
                </div>
                {list2.map((e, i) => {
                  const patPres = (e.patient.budget_no || e.patient.budgetNo || "").toString().trim();
                  return (
                    <div key={e.patient.id} style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 2fr",gap:0,padding:"10px 16px",borderBottom:"1px solid #f0f2f7",alignItems:"center",background:i%2===0?"#fff":"#fafbfd"}}>
                      <div style={{fontWeight:600,color:"#2c3250",fontSize:13}}>{e.patient.name}</div>
                      <div style={{fontSize:14,fontWeight:700,color:"#2c3250"}}>{fmtAmt(e.totalAmt)}</div>
                      <div style={{fontSize:12,color:"#888"}}>{fmt(e.latestDate)}</div>
                      <div>
                        {patPres
                          ? <span style={{fontSize:12,color:"#2c3250"}}>Nº {patPres}</span>
                          : <span style={{fontSize:12,color:"#e74c3c",fontWeight:600}}>Sin número de presupuesto</span>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Lista 3: sin coincidencia ────────────────────────────────── */}
          {list3 && list3.length > 0 && (
            <div style={{marginTop:24}}>
              <div style={{fontSize:11,color:"#e74c3c",letterSpacing:2,fontWeight:700,marginBottom:10}}>
                SIN COINCIDENCIA — {fmtAmt(totals.unmatched)} ({list3.length} filas)
              </div>
              <div style={{background:"#fff",borderRadius:12,border:"1px solid #fca5a5",overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1.2fr",gap:0,background:"#fff5f5",padding:"8px 16px",borderBottom:"1px solid #fca5a5"}}>
                  {["Nombre en Excel","Nº Pres. Excel","Importe","Fecha"].map((h,i)=>(
                    <div key={i} style={HDR}>{h}</div>
                  ))}
                </div>
                {list3.map((r,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1.2fr",gap:0,padding:"9px 16px",borderBottom:"1px solid #fef2f2",alignItems:"center",background:i%2===0?"#fff":"#fffbfb"}}>
                    <div style={{fontSize:13,color:"#2c3250"}}>{r.name||"—"}</div>
                    <div style={{fontSize:12,color:"#888"}}>{r.presNum||"—"}</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#e74c3c"}}>{fmtAmt(r.amt)}</div>
                    <div style={{fontSize:12,color:"#888"}}>{fmt(r.dateObj)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CitasExcelPanel ──────────────────────────────────────────────────────────
function CitasExcelPanel({ patients, onRefresh }) {
  const [totalRows, setTotalRows] = useState(null);
  const [groups,    setGroups]    = useState(null); // [{patientId, patientName, dates:[isoStr]}]
  const [added,     setAdded]     = useState(new Set());
  const [busy,      setBusy]      = useState(null); // "patientId|date" being saved
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

  const toIsoDate = (val) => {
    if (!val) return null;
    let d;
    if (val instanceof Date && !isNaN(val)) {
      d = val;
    } else if (typeof val === "number") {
      // Excel serial date fallback
      d = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else if (typeof val === "string") {
      const s = val.trim();
      // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
      const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (dmy) d = new Date(`${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`);
      else d = new Date(s);
      if (isNaN(d)) return null;
    } else {
      return null;
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const fmtIso = (iso) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const todayIso = today();
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const parsed = [];
      for (let i = 1; i < data.length; i++) {
        const row  = data[i];
        const dateIso = toIsoDate(row[3]);    // col D (index 3)
        const name    = (row[7] || "").toString().trim(); // col H (index 7)
        if (!name || !dateIso) continue;
        if (dateIso < todayIso) continue;     // ignorar fechas pasadas
        parsed.push({ name, dateIso });
      }
      setTotalRows(parsed.length);

      const groupMap = new Map();
      for (const row of parsed) {
        const match = patients.find(p => namesMatch(row.name, p.name));
        if (!match) continue;
        if (!groupMap.has(match.id)) {
          groupMap.set(match.id, { patientId: match.id, patientName: match.name, dates: [] });
        }
        const entry = groupMap.get(match.id);
        if (!entry.dates.includes(row.dateIso)) entry.dates.push(row.dateIso);
      }

      const grouped = Array.from(groupMap.values()).map(g => ({
        ...g,
        dates: [...g.dates].sort(),
      })).sort((a, b) => a.patientName.localeCompare(b.patientName, "es"));

      setGroups(grouped);
      setAdded(new Set());
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const existsInSystem = (patientId, dateIso) => {
    if (added.has(`${patientId}|${dateIso}`)) return true;
    const p = patients.find(x => x.id === patientId);
    return (p?.appointments || []).some(a => a.date === dateIso);
  };

  const addAppointment = async (patientId, dateIso) => {
    const key = `${patientId}|${dateIso}`;
    setBusy(key);
    const p = patients.find(x => x.id === patientId);
    if (p) {
      const current = p.appointments || [];
      const newAppt = { id: genId(), label: "", date: dateIso, time: "", doctors: "", payment: "", treatmentIds: [] };
      await supabase.from("patients").update({ appointments: [...current, newAppt] }).eq("id", patientId);
      setAdded(prev => new Set([...prev, key]));
      onRefresh();
    }
    setBusy(null);
  };

  const print = () => {
    const date = new Date().toLocaleDateString("es-ES");
    const trs = groups.flatMap(g =>
      g.dates.map(d => {
        const inSys = existsInSystem(g.patientId, d);
        return `<tr>
          <td>${g.patientName}</td>
          <td>${fmtIso(d)}</td>
          <td>${inSys ? "✓ En sistema" : "—"}</td>
        </tr>`;
      })
    ).join("");
    const totalAppts = groups.reduce((s, g) => s + g.dates.length, 0);
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Citas — ${date}</title>
<style>
  body{font-family:'Segoe UI',sans-serif;color:#111;padding:32px;font-size:13px;}
  h1{font-size:18px;margin:0 0 4px;}
  .sub{color:#666;font-size:12px;margin-bottom:24px;}
  table{width:100%;border-collapse:collapse;}
  th{text-align:left;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;padding:6px 8px;border-bottom:2px solid #ddd;}
  td{padding:7px 8px;border-bottom:1px solid #eee;}
  .ok{color:#27ae60;font-weight:700;}
  @media print{body{padding:16px;}}
</style></head><body>
<h1>IMPLANTDENT — Citas importadas</h1>
<div class="sub">Fecha: ${date} · ${groups.length} paciente(s) · ${totalAppts} cita(s)</div>
<table>
  <thead><tr><th>Paciente</th><th>Fecha cita</th><th>Estado</th></tr></thead>
  <tbody>${trs}</tbody>
</table>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  const totalAppts = groups ? groups.reduce((s, g) => s + g.dates.length, 0) : 0;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700}}>📅 IMPORTAR CITAS EXCEL</div>
        <div style={{flex:1}}/>
        {groups && groups.length > 0 && (
          <button onClick={print} style={{background:"#2c3250",border:"none",borderRadius:8,color:"#fff",padding:"6px 16px",cursor:"pointer",fontSize:12,fontWeight:600}}>
            🖨 Imprimir
          </button>
        )}
      </div>

      <div style={{background:"#ffffff",border:"2px dashed #c9a84c44",borderRadius:12,padding:"28px 24px",marginBottom:20,textAlign:"center"}}>
        <div style={{fontSize:13,color:"#555",marginBottom:14}}>
          Seleccioná el archivo Excel con la lista de citas.<br/>
          <span style={{fontSize:11,color:"#888"}}>Se leen: columna D (fecha), columna H (nombre) · Solo se muestran citas desde hoy en adelante</span>
        </div>
        <button onClick={()=>fileRef.current.click()}
          style={{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:8,color:"#fff",padding:"10px 24px",cursor:"pointer",fontSize:13,fontWeight:700}}>
          📅 Seleccionar Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFile} style={{display:"none"}}/>
      </div>

      {groups !== null && (
        <div>
          <div style={{fontSize:12,color:"#555",marginBottom:12}}>
            {totalRows} fila(s) leídas · <span style={{color:"#c9a84c",fontWeight:700}}>{groups.length} paciente(s)</span> identificados · {totalAppts} cita(s)
          </div>

          {groups.length === 0 && (
            <div style={{textAlign:"center",color:"#888",padding:40,fontSize:13}}>No se encontraron coincidencias</div>
          )}

          {groups.map((g) => (
            <div key={g.patientId} style={{background:"#ffffff",borderRadius:12,border:"1px solid #e2e5ed",marginBottom:12,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",padding:"10px 16px",background:"#f5f7fa",borderBottom:"1px solid #e2e5ed"}}>
                <div style={{fontWeight:700,color:"#2c3250",fontSize:13}}>{g.patientName}</div>
                <div style={{marginLeft:10,fontSize:11,color:"#888"}}>{g.dates.length} cita(s)</div>
              </div>
              {g.dates.map((dateIso) => {
                const inSys = existsInSystem(g.patientId, dateIso);
                const key = `${g.patientId}|${dateIso}`;
                return (
                  <div key={dateIso} style={{display:"flex",alignItems:"center",padding:"9px 16px",borderBottom:"1px solid #f0f2f7",gap:12}}>
                    <div style={{fontSize:13,color:"#333",fontWeight:500,minWidth:90}}>{fmtIso(dateIso)}</div>
                    <div style={{flex:1}}/>
                    {inSys
                      ? <span style={{fontSize:12,color:"#27ae60",fontWeight:700}}>✓ Ya existe</span>
                      : <button
                          onClick={() => addAppointment(g.patientId, dateIso)}
                          disabled={busy === key}
                          style={{background:"#2c3250",border:"none",borderRadius:6,color:"#fff",padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:600,opacity:busy===key?0.6:1}}>
                          {busy === key ? "..." : "+ Agregar"}
                        </button>
                    }
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PresupuestosExcelPanel ──────────────────────────────────────────────────
function PresupuestosExcelPanel({ patients, onRefresh }) {
  const [status,      setStatus]      = useState(null);   // { autoCount, conflicts, notFound }
  const [processing,  setProcessing]  = useState(false);
  const [busySet,     setBusySet]     = useState(new Set());
  const [assignedSet, setAssignedSet] = useState(new Set());
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      const rows = [];
      for (let i = 1; i < data.length; i++) {
        const row    = data[i];
        const presNum    = (row[2]  || "").toString().trim();  // col C
        const hc         = (row[5]  || "").toString().trim();  // col F
        const rawExcelAmt= (row[10] || "").toString().trim();  // col K
        const excelAmt   = parseFloat(rawExcelAmt.replace(",", ".")) || 0;
        if (!presNum && !hc) continue;
        rows.push({ presNum, hc, excelAmt });
      }

      // cuántas veces aparece cada HC en el Excel
      const hcExcelCount = new Map();
      for (const r of rows) {
        if (r.hc) hcExcelCount.set(r.hc, (hcExcelCount.get(r.hc) || 0) + 1);
      }

      const conflicts = [];  // revisar manualmente
      const notFound  = [];  // HC no existe en sistema
      let autoCount   = 0;

      for (const r of rows) {
        if (!r.hc) {
          notFound.push({ ...r, reason: "Sin HC en Excel" });
          continue;
        }
        const sysMatches = patients.filter(p => (p.hc || "").toString().trim() === r.hc);
        const exCount    = hcExcelCount.get(r.hc) || 1;

        if (sysMatches.length === 0) {
          notFound.push({ ...r, reason: "HC no encontrado en sistema" });
          continue;
        }
        if (exCount > 1) {
          conflicts.push({ ...r, reason: `HC repetido en Excel (${exCount} veces)`, candidates: sysMatches });
          continue;
        }
        if (sysMatches.length > 1) {
          conflicts.push({ ...r, reason: `HC repetido en sistema (${sysMatches.length} pacientes)`, candidates: sysMatches });
          continue;
        }
        // coincidencia única → asignar automáticamente
        await supabase.from("patients").update({ budget_no: r.presNum }).eq("id", sysMatches[0].id);
        autoCount++;
      }

      setStatus({ autoCount, conflicts, notFound });
      setAssignedSet(new Set());
      setBusySet(new Set());
      if (autoCount > 0 && onRefresh) onRefresh();
      setProcessing(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const assign = async (conflict, conflictIdx, patientId) => {
    const key = `${conflictIdx}-${patientId}`;
    setBusySet(prev => new Set([...prev, key]));
    await supabase.from("patients").update({ budget_no: conflict.presNum }).eq("id", patientId);
    setAssignedSet(prev => new Set([...prev, conflictIdx]));
    setBusySet(prev => { const s = new Set(prev); s.delete(key); return s; });
    if (onRefresh) onRefresh();
  };

  const cardStyle = { background:"#fff", border:"1px solid #e2e5ed", borderRadius:10, padding:"12px 16px", marginBottom:8 };

  return (
    <div>
      <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700,marginBottom:20}}>🔢 IMPORTAR N° DE PRESUPUESTOS</div>

      <div style={{background:"#ffffff",border:"2px dashed #c9a84c44",borderRadius:12,padding:"28px 24px",marginBottom:20,textAlign:"center"}}>
        <div style={{fontSize:13,color:"#555",marginBottom:14}}>
          Seleccioná el Excel con los números de presupuesto.<br/>
          <span style={{fontSize:11,color:"#888"}}>Col C (Nº presupuesto) · Col F (HC del paciente) · Col K (total presupuesto)</span>
        </div>
        <button onClick={()=>fileRef.current.click()} disabled={processing}
          style={{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:8,color:"#fff",padding:"10px 24px",cursor:processing?"not-allowed":"pointer",fontSize:13,fontWeight:700,opacity:processing?0.6:1}}>
          {processing ? "⏳ Procesando..." : "📊 Seleccionar Excel"}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFile} style={{display:"none"}}/>
      </div>

      {status && (
        <div>
          {/* resumen automáticos */}
          <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:22}}>✅</span>
            <div>
              <div style={{fontWeight:700,color:"#166534",fontSize:14}}>{status.autoCount} número(s) de presupuesto asignados automáticamente</div>
              {status.notFound.length > 0 && (
                <div style={{fontSize:12,color:"#555",marginTop:2}}>{status.notFound.length} fila(s) sin coincidencia en el sistema</div>
              )}
            </div>
          </div>

          {/* conflictos para revisar */}
          {status.conflicts.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:"#e67e22",letterSpacing:2,fontWeight:700,marginBottom:10}}>
                ⚠️ REQUIEREN REVISIÓN MANUAL ({status.conflicts.length})
              </div>
              {status.conflicts.map((c, idx) => {
                const assigned = assignedSet.has(idx);
                return (
                  <div key={idx} style={{...cardStyle, borderLeft:`3px solid ${assigned?"#27ae60":"#e67e22"}`, marginBottom:12}}>
                    {/* cabecera del conflicto */}
                    <div style={{display:"flex",gap:24,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:10,color:"#888",marginBottom:1}}>HC (Excel)</div>
                        <div style={{fontWeight:700,color:"#2c3250",fontSize:14}}>{c.hc||"—"}</div>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:"#888",marginBottom:1}}>Nº Presupuesto (Excel)</div>
                        <div style={{fontWeight:700,color:"#c9a84c",fontSize:16}}>{c.presNum||"—"}</div>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:"#888",marginBottom:1}}>Total presupuesto (Excel)</div>
                        <div style={{fontWeight:700,color:"#2c3250",fontSize:15}}>
                          {c.excelAmt > 0 ? `€${c.excelAmt.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}
                        </div>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,color:"#888",marginBottom:1}}>Motivo</div>
                        <div style={{fontSize:11,color:"#e67e22",fontWeight:600}}>{c.reason}</div>
                      </div>
                      {assigned && <div style={{color:"#27ae60",fontWeight:700,fontSize:13}}>✓ Asignado</div>}
                    </div>

                    {/* candidatos */}
                    {!assigned && c.candidates.length > 0 && (
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{fontSize:10,color:"#888",letterSpacing:1,fontWeight:700,marginBottom:2}}>ELEGIR PACIENTE:</div>
                        {c.candidates.map(p => {
                          const key    = `${idx}-${p.id}`;
                          const busy   = busySet.has(key);
                          const grand  = patientGrand(p);
                          const curPres= (p.budget_no||p.budgetNo||"").toString().trim();
                          return (
                            <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,background:"#f5f7fa",borderRadius:8,padding:"10px 14px",flexWrap:"wrap"}}>
                              <div style={{flex:1,minWidth:160}}>
                                <div style={{fontWeight:700,color:"#2c3250",fontSize:13}}>{p.name}</div>
                                <div style={{fontSize:11,color:"#888",marginTop:2}}>HC: {p.hc||"—"} · Nº Pres: {curPres||"sin asignar"}</div>
                              </div>
                              <div style={{textAlign:"center",minWidth:100}}>
                                <div style={{fontSize:10,color:"#888",marginBottom:2}}>Total sistema</div>
                                <div style={{fontWeight:700,color:"#2c3250",fontSize:14}}>
                                  {grand > 0 ? `€${grand.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}
                                </div>
                              </div>
                              <div style={{fontSize:18,color:"#ccc",alignSelf:"center"}}>↔</div>
                              <div style={{textAlign:"center",minWidth:100}}>
                                <div style={{fontSize:10,color:"#888",marginBottom:2}}>Total Excel</div>
                                <div style={{fontWeight:700,fontSize:14,color:c.excelAmt>0&&grand>0&&Math.abs(c.excelAmt-grand)<1?"#27ae60":"#2c3250"}}>
                                  {c.excelAmt > 0 ? `€${c.excelAmt.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}
                                </div>
                              </div>
                              <button
                                onClick={()=>assign(c,idx,p.id)}
                                disabled={busy}
                                style={{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:6,color:"#fff",padding:"7px 18px",cursor:busy?"not-allowed":"pointer",fontSize:12,fontWeight:700,opacity:busy?0.6:1,flexShrink:0}}>
                                {busy?"...":"Asignar"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* no encontrados */}
          {status.notFound.length > 0 && (
            <div>
              <div style={{fontSize:11,color:"#888",letterSpacing:2,fontWeight:700,marginBottom:10}}>
                HC NO ENCONTRADOS ({status.notFound.length})
              </div>
              {status.notFound.map((c, idx) => (
                <div key={idx} style={{...cardStyle, background:"#fafafa"}}>
                  <div style={{display:"flex",gap:16,fontSize:12}}>
                    <span><span style={{color:"#888"}}>HC:</span> <strong>{c.hc||"—"}</strong></span>
                    <span><span style={{color:"#888"}}>Pres:</span> <strong>{c.presNum||"—"}</strong></span>
                    <span style={{color:"#888"}}>{c.reason}</span>
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
  const [unlocked,       setUnlocked]       = useState(false);
  const [hasSession,     setHasSession]     = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [patients,  setPatients]  = useState([]);
  const [doctors,   setDoctors]   = useState([]);
  const [items,     setItems]     = useState([]);
  const [templates,     setTemplates]     = useState([]);
  const [translations,  setTranslations]  = useState([]);
  const [payments,      setPayments]      = useState([]);
  const [waClicks,      setWaClicks]      = useState([]);
  const [viewHistory, setViewHistory] = useState(["dashboard"]);
  const view = viewHistory[viewHistory.length - 1];
  const navigate = (id) => setViewHistory(prev => prev[prev.length-1]===id ? prev : [...prev, id]);
  const goBack   = ()   => setViewHistory(prev => prev.length>1 ? prev.slice(0,-1) : prev);
  const [statusTab,        setStatusTab]       = useState("pendiente");
  const [editing,          setEditing]         = useState(null);
  const [filter,           setFilter]          = useState("");
  const [dbLoading,        setDbLoad]          = useState(true);
  const [archivedPatients, setArchivedPatients] = useState([]);
  const [archivedLoaded,   setArchivedLoaded]   = useState(false);
  const [archivedLoading,  setArchivedLoading]  = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchPatients  = async () => { const {data}=await supabase.from("patients").select("*").neq("status","frío").neq("status","cerrado sin deuda").order("created_at",{ascending:false}); setPatients(data||[]); };
  const fetchArchived  = async () => { const {data}=await supabase.from("patients").select("*").in("status",["frío","cerrado sin deuda"]).order("created_at",{ascending:false}); setArchivedPatients(data||[]); setArchivedLoaded(true); setArchivedLoading(false); };
  const ensureArchived = () => { if (!archivedLoaded && !archivedLoading) { setArchivedLoading(true); fetchArchived(); } };
  const fetchDoctors   = async () => { const {data}=await supabase.from("doctors").select("*").order("name"); setDoctors(data||[]); };
  const fetchItems     = async () => { const {data}=await supabase.from("treatment_items").select("*").order("created_at",{ascending:false}); setItems(data||[]); };
  const fetchTemplates    = async () => { const {data}=await supabase.from("treatment_templates").select("*").order("keyword"); setTemplates(data||[]); };
  const fetchTranslations = async () => { const {data,error}=await supabase.from("treatment_translations").select("*").order("name_es"); if(!error){setTranslations(data||[]);setTranslationDict(data||[]);} };
  const fetchPayments     = async () => { const {data}=await supabase.from("payments").select("*").order("date",{ascending:false}); setPayments(data||[]); };
  const fetchWaClicks     = async () => { const {data}=await supabase.from("wa_clicks").select("*"); setWaClicks(data||[]); };
  const [clinicStats, setClinicStats] = useState([]);
  const fetchClinicStats = async () => { const {data}=await supabase.from("clinic_monthly_stats").select("*"); setClinicStats(data||[]); };
  const saveClinicStat = async (year, month, vals) => {
    const id = `${year}-${String(month).padStart(2,"0")}`;
    await supabase.from("clinic_monthly_stats").upsert([{ id, year, month, ...vals }]);
    await fetchClinicStats();
  };
  const incWaClick = async (patientId, key) => {
    const existing = waClicks.find(c=>c.patient_id===patientId&&c.button_key===key);
    const lsKey = `wa_${patientId}_${key}`;
    const lsVal = parseInt(localStorage.getItem(lsKey)||"0");
    const newCount = Math.max((existing?.count||0), lsVal) + 1;
    setWaClicks(prev=>[...prev.filter(c=>!(c.patient_id===patientId&&c.button_key===key)), {patient_id:patientId,button_key:key,count:newCount}]);
    try { localStorage.setItem(lsKey, String(newCount)); } catch {}
    await supabase.from("wa_clicks").upsert({patient_id:patientId,button_key:key,count:newCount},{onConflict:"patient_id,button_key"});
  };

  // Comprobar sesión activa al arrancar
  useEffect(()=>{
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setSessionChecked(true);
    });
  }, []);

  // Resetear estado al cerrar sesión (token expirado o sign out explícito)
  useEffect(()=>{
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setUnlocked(false); setHasSession(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(()=>{ Promise.all([fetchPatients(),fetchDoctors(),fetchItems(),fetchTemplates(),fetchTranslations(),fetchPayments(),fetchWaClicks(),fetchClinicStats()]).finally(()=>setDbLoad(false)); },[]);

  useEffect(()=>{
    if (!unlocked) return;
    setDbLoad(true);
    Promise.all([fetchPatients(),fetchDoctors(),fetchItems(),fetchTemplates(),fetchTranslations(),fetchPayments(),fetchWaClicks()])
      .then(() => autoEnCurso())
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
      appointments:p.appointments||[], reminders:p.reminders||[], notes:p.notes, history:p.history||[],
      status:p.status||"pendiente", last_contact:p.last_contact||today(), closed:isCerrado(p.status),
    };
    const isNew = ![...patients, ...archivedPatients].some(x=>x.id===p.id);
    if (isNew) await supabase.from("patients").insert([payload]);
    else       await supabase.from("patients").update(payload).eq("id",p.id);
    const savedId = p.id;
    await fetchPatients();
    if (archivedLoaded) await fetchArchived();
    setPatients(prev => {
      const idx = prev.findIndex(x => x.id === savedId);
      if (idx <= 0) return prev;
      const copy = [...prev];
      copy.unshift(...copy.splice(idx, 1));
      return copy;
    });
    goBack(); setEditing(null);
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
    if (archivedLoaded) await fetchArchived();
  };

  const syncAllItems = async () => {
    const toSync = patients.filter(p => isCerrado(getStatus(p)) || getStatus(p) === "en curso");
    const existingIds = new Set(items.map(i => i.patient_id));
    const missing = toSync.filter(p => !existingIds.has(p.id));
    await Promise.all(missing.map(p => insertTreatmentItems(p)));
    if (missing.length > 0) await fetchItems();
  };

  const autoEnCurso = async () => {
    const todayStr = new Date().toISOString().slice(0,10);
    const {data} = await supabase.from("patients").select("*")
      .neq("status","frío").neq("status","cerrado sin deuda");
    const toUpdate = (data||[]).filter(p => {
      const st = getStatus(p);
      if (st === "en curso" || isCerrado(st)) return false;
      return (p.appointments||[]).some(a => a.date && a.date >= todayStr);
    });
    if (toUpdate.length === 0) return;
    await Promise.all(toUpdate.map(p =>
      supabase.from("patients").update({status:"en curso", closed:false}).eq("id", p.id)
    ));
    await Promise.all(toUpdate.map(p => insertTreatmentItems({...p, status:"en curso", closed:false})));
    await fetchItems();
    await fetchPatients();
  };

  const deletePatient = async (patient) => {
    if (!confirm(`¿Seguro que querés eliminar a ${patient.name}? Esta acción no se puede deshacer`)) return;
    await Promise.all([
      supabase.from("payments").delete().eq("patient_id", patient.id),
      supabase.from("treatment_items").delete().eq("patient_id", patient.id),
    ]);
    await supabase.from("patients").delete().eq("id", patient.id);
    await Promise.all([fetchPatients(), fetchItems(), fetchPayments()]);
    if (archivedLoaded) await fetchArchived();
  };

  const openEdit = (p) => { setEditing(p); navigate("form"); };
  const newPt    = ()  => { setEditing(emptyPatient()); navigate("form"); };

  const recent = patients;
  const allPatients = [...patients, ...archivedPatients];

  const todayStr = today();
  const todayAppts = [];
  const todayReminders = [];
  patients.forEach(p => {
    (p.appointments || []).forEach(appt => {
      if (appt.date === todayStr) todayAppts.push({ patient: p, appt });
    });
    (p.reminders || []).forEach(rem => {
      if (rem.date === todayStr) todayReminders.push({ patient: p, reminder: rem });
    });
  });
  todayAppts.sort((a,b) => (a.appt.time||"").localeCompare(b.appt.time||""));

  const DIAS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const weekDays = (() => {
    const d = new Date();
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);
    monday.setHours(0,0,0,0);
    return Array.from({length:7}, (_,i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const y = day.getFullYear(), m = String(day.getMonth()+1).padStart(2,"0"), dd = String(day.getDate()).padStart(2,"0");
      return { iso:`${y}-${m}-${dd}`, label:`${DIAS_ES[day.getDay()]} ${dd}/${m}` };
    });
  })();

  const weekAppts = weekDays.map(({iso, label}) => {
    const appts = [];
    const reminders = [];
    allPatients.forEach(p => {
      (p.appointments||[]).forEach(appt => {
        if (appt.date === iso) appts.push({ patient:p, appt });
      });
      (p.reminders||[]).forEach(rem => {
        if (rem.date === iso) reminders.push({ patient:p, reminder:rem });
      });
    });
    appts.sort((a,b)=>(a.appt.time||"").localeCompare(b.appt.time||""));
    return { iso, label, appts, reminders };
  });

  const printWeekly = () => {
    const [from, to] = [weekDays[0].label, weekDays[6].label];
    const sections = weekAppts.map(({label, appts}) => {
      if (appts.length === 0) return `<tr><td colspan="7" class="dayhead">${label}</td></tr><tr><td colspan="7" class="empty">Sin citas</td></tr>`;
      const rows = appts.map(({patient:pat, appt}) => {
        const grand = patientGrand(pat);
        const paid  = payments.filter(pay=>pay.patient_id===pat.id).reduce((s,pay)=>s+(parseFloat(pay.amount)||0),0);
        const debt  = parseFloat((grand-paid).toFixed(2));
        let estado = "";
        if (grand > 0) {
          if (paid===0)     estado = `<span style="color:#e67e22">${fmtEur(grand)} (a pagar)</span>`;
          else if (debt<=0) estado = `<span style="color:#27ae60">Pagado</span>`;
          else              estado = `<span style="color:#e74c3c">Deuda: ${fmtEur(debt)}</span>`;
        }
        return `<tr>
          <td class="dayhead" style="background:#f9f9f9;font-size:11px;color:#666;font-weight:400">${label}</td>
          <td>${appt.time||"—"}</td>
          <td><strong>${pat.name||"Sin nombre"}</strong></td>
          <td>${pat.hc||"—"}</td>
          <td>${appt.doctors||""}</td>
          <td>${estado}</td>
          <td class="notes"><div class="notes-line"></div><div class="notes-line"></div></td>
        </tr>`;
      }).join("");
      return rows;
    }).join("");
    const win = window.open("","_blank");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Agenda semanal</title>
<style>
  @page{size:A4 landscape;margin:1.2cm;}
  body{font-family:'Segoe UI',sans-serif;font-size:13px;color:#111;padding:16px;}
  h1{font-size:17px;margin:0 0 4px;}
  .sub{color:#666;font-size:12px;margin-bottom:16px;}
  table{width:100%;border-collapse:collapse;}
  th{text-align:left;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;padding:6px 8px;border-bottom:2px solid #ddd;}
  td{padding:7px 8px;border-bottom:1px solid #eee;vertical-align:middle;}
  .dayhead{font-weight:700;color:#2c3250;background:#f0f2f7;}
  .empty{color:#aaa;font-style:italic;padding:6px 8px;}
  .notes{width:35%;padding:4px 8px;}
  .notes-line{border-bottom:1px solid #aaa;height:20px;margin-bottom:4px;}
  @media print{body{padding:0;}}
</style></head><body>
<h1>IMPLANTDENT — Agenda semanal</h1>
<div class="sub">${from} → ${to}</div>
<table>
  <thead><tr><th>Día</th><th>Hora</th><th>Paciente</th><th>HC</th><th>Doctor / Comentario</th><th>Estado pago</th><th>Notas</th></tr></thead>
  <tbody>${sections}</tbody>
</table>
</body></html>`);
    win.document.close();
    setTimeout(()=>win.print(),600);
  };

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
    ? allPatients.filter(p =>
        (p.name||"").toLowerCase().includes(filter.toLowerCase()) ||
        (p.budget_no||"").includes(filter) ||
        (p.hc||"").includes(filter)
      )
    : recent;

  const NavBtn = ({id,label,badge}) => (
    <button onClick={()=>navigate(id)}
      style={{background:"none",border:"none",color:view===id?"#c9a84c":"#666",cursor:"pointer",fontSize:13,fontWeight:view===id?700:400,borderBottom:view===id?"2px solid #c9a84c":"2px solid transparent",padding:"0 10px",height:60,display:"flex",alignItems:"center"}}>
      {label}
      {badge>0 && <span style={{background:"#e74c3c",color:"#fff",borderRadius:"50%",width:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,marginLeft:5}}>{badge}</span>}
    </button>
  );

  // Esperar a que se verifique la sesión antes de mostrar cualquier pantalla
  if (!sessionChecked) return (
    <div style={{minHeight:"100vh",background:"#f0f2f7",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:13,color:"#888",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>Cargando...</div>
    </div>
  );

  // Sin sesión activa → formulario de login real
  if (!hasSession) return (
    <LoginForm onLogin={() => { setHasSession(true); setUnlocked(true); }} />
  );

  // Sesión activa pero pantalla bloqueada → PIN
  if (!unlocked) return <PinLock onUnlock={()=>setUnlocked(true)} />;

  return (
    <div style={{minHeight:"100vh",background:"#f0f2f7",color:"#2c3250",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#ffffff",borderBottom:"1px solid #e2e5ed",padding:"0 16px",display:"flex",alignItems:"center",gap:4,height:60}}>
        <span style={{fontWeight:900,fontSize:15,letterSpacing:3,color:"#c9a84c",marginRight:8}}>IMPLANTDENT</span>
        <div style={{flex:1}}/>
        <NavBtn id="dashboard" label="Pacientes"  badge={0}/>
        <NavBtn id="debts"     label="Deudas"     badge={pendingDebtPatients.length}/>
        <NavBtn id="pagos"     label="Cobros"/>
        <NavBtn id="citas"         label="Citas"/>
        <NavBtn id="presupuestos"  label="N° Presupuestos"/>
        <NavBtn id="clinica"       label="Clínica"/>
        <NavBtn id="stats"     label="Estadísticas" badge={0}/>

        {/* ── Agenda semanal ────────────────────────────────────────── */}
        <button onClick={()=>setShowWeekly(true)}
          style={{background:"none",border:"none",cursor:"pointer",fontSize:20,lineHeight:1,padding:"4px 6px",color:"#444"}}>
          📆
        </button>

        {/* ── Campanita ─────────────────────────────────────────────── */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowAlerts(v=>!v)}
            style={{background:"none",border:"none",cursor:"pointer",fontSize:22,lineHeight:1,padding:"4px 6px",
              color: (todayAppts.length+todayReminders.length)>0 ? "#c9a84c" : "#444", position:"relative"}}>
            🔔
            {(todayAppts.length+todayReminders.length) > 0 && (
              <span style={{position:"absolute",top:-4,right:-4,background:"#e74c3c",color:"#fff",
                borderRadius:"50%",minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:10,fontWeight:800,lineHeight:1,padding:"0 3px",boxSizing:"border-box"}}>
                {todayAppts.length+todayReminders.length}
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
                {todayReminders.map(({patient:pat, reminder:rem})=>(
                  <div key={rem.id}
                    onClick={()=>{ openEdit(pat); setShowAlerts(false); }}
                    style={{padding:"12px 18px",borderBottom:"1px solid #e2e5ed",cursor:"pointer",
                      background:"#fffdf5",borderLeft:"3px solid #c9a84c",
                      display:"flex",justifyContent:"space-between",alignItems:"center"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#fff3d0"}
                    onMouseLeave={e=>e.currentTarget.style.background="#fffdf5"}>
                    <div>
                      <div style={{fontSize:10,color:"#c9a84c",fontWeight:700,letterSpacing:1,marginBottom:2}}>📌 RECORDATORIO</div>
                      <div style={{fontWeight:700,color:"#2c3250",fontSize:14}}>{pat.name||"Sin nombre"}</div>
                      {rem.text && <div style={{fontSize:12,color:"#777",marginTop:2}}>{rem.text}</div>}
                    </div>
                    <span style={{color:"#c9a84c",fontSize:20}}>›</span>
                  </div>
                ))}
                {todayAppts.length === 0 && todayReminders.length === 0
                  ? <div style={{padding:24,color:"#555",textAlign:"center",fontSize:13}}>Sin citas ni recordatorios para hoy</div>
                  : todayAppts.map(({patient:pat, appt}) => {
                      const grand   = patientGrand(pat);
                      const paid    = payments.filter(pay=>pay.patient_id===pat.id).reduce((s,pay)=>s+(parseFloat(pay.amount)||0),0);
                      const debt    = parseFloat((grand - paid).toFixed(2));
                      let payBadge = null;
                      if (grand > 0) {
                        if (paid === 0)       payBadge = { text: `${fmtEur(grand)} (a pagar)`, color:"#e67e22" };
                        else if (debt <= 0)   payBadge = { text: "Pagado", color:"#27ae60" };
                        else                  payBadge = { text: `Deuda: ${fmtEur(debt)}`, color:"#e74c3c" };
                      }
                      return (
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
                          {payBadge && (
                            <div style={{fontSize:11,fontWeight:700,color:payBadge.color,marginTop:3}}>
                              {payBadge.text}
                            </div>
                          )}
                        </div>
                        <span style={{color:"#c9a84c",fontSize:20}}>›</span>
                      </div>
                      );
                    })
                }
              </div>
            </>
          )}
        </div>

        <button onClick={newPt} style={s.btnGold}>+ Nuevo paciente</button>
      </div>

      {/* ── Agenda semanal modal ──────────────────────────────────────────── */}
      {showWeekly && (
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"#1e2230",display:"flex",flexDirection:"column"}}>
          {/* Header */}
          <div style={{background:"#2c3250",padding:"12px 20px",display:"flex",alignItems:"center",gap:14,
            boxShadow:"0 2px 10px #0006",flexShrink:0}}>
            <div style={{fontSize:13,color:"#c9a84c",fontWeight:700,letterSpacing:2}}>
              📆 AGENDA SEMANAL
            </div>
            <button onClick={()=>setWeekOffset(w=>w-1)}
              style={{background:"#ffffff18",border:"none",borderRadius:6,color:"#fff",
                padding:"4px 10px",cursor:"pointer",fontSize:14,fontWeight:700}}>
              ‹
            </button>
            <div style={{fontSize:12,color:"#fff",minWidth:160,textAlign:"center"}}>
              {weekOffset===0 ? "Esta semana" : weekOffset===1 ? "Próxima semana" : weekOffset===-1 ? "Semana anterior" : `Semana ${weekOffset>0?"+":""}${weekOffset}`}
              <div style={{fontSize:10,color:"#aaa"}}>
                {weekDays[0].label.split(" ")[1]} → {weekDays[6].label.split(" ")[1]}
              </div>
            </div>
            <button onClick={()=>setWeekOffset(w=>w+1)}
              style={{background:"#ffffff18",border:"none",borderRadius:6,color:"#fff",
                padding:"4px 10px",cursor:"pointer",fontSize:14,fontWeight:700}}>
              ›
            </button>
            {weekOffset!==0 && (
              <button onClick={()=>setWeekOffset(0)}
                style={{background:"#c9a84c33",border:"1px solid #c9a84c66",borderRadius:6,color:"#c9a84c",
                  padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                Hoy
              </button>
            )}
            <div style={{flex:1}}/>
            <button onClick={printWeekly}
              style={{background:"#c9a84c",border:"none",borderRadius:8,color:"#fff",padding:"6px 16px",
                cursor:"pointer",fontSize:12,fontWeight:700}}>
              🖨 Imprimir
            </button>
            <button onClick={()=>setShowWeekly(false)}
              style={{background:"#ffffff22",border:"none",borderRadius:8,color:"#fff",padding:"6px 12px",
                cursor:"pointer",fontSize:12,fontWeight:700}}>
              ✕ Cerrar
            </button>
          </div>

          {/* Almanaque grid */}
          <div style={{flex:1,overflowY:"auto",padding:"16px",display:"grid",
            gridTemplateColumns:"repeat(7,1fr)",gap:10,alignContent:"start"}}>
            {weekAppts.map(({iso, label, appts, reminders}, idx)=>{
              const isToday = iso === todayStr;
              const [dayNameFull, dayDate] = label.split(" ");
              const dayShort = dayNameFull.slice(0,3).toUpperCase();
              return (
                <div key={iso} style={{display:"flex",flexDirection:"column",minHeight:160,
                  borderRadius:12,overflow:"hidden",
                  border: isToday ? "2px solid #c9a84c" : "1px solid #ffffff18",
                  boxShadow: isToday ? "0 0 0 1px #c9a84c33" : "none"}}>
                  {/* Cabecera del día */}
                  <div style={{background: isToday ? "#c9a84c" : "#2c3250",
                    padding:"10px 8px",textAlign:"center",flexShrink:0}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:2,
                      color: isToday ? "#fff" : "#8899bb",textTransform:"uppercase"}}>
                      {dayShort}
                    </div>
                    <div style={{fontSize:24,fontWeight:900,lineHeight:1.1,
                      color: isToday ? "#fff" : "#ffffff",marginTop:2}}>
                      {dayDate?.split("/")[0]}
                    </div>
                    {(appts.length > 0 || reminders.length > 0) && (
                      <div style={{fontSize:10,color: isToday?"#fff8":"#c9a84c",marginTop:3,fontWeight:600}}>
                        {appts.length > 0 && `${appts.length} cita${appts.length>1?"s":""}`}
                        {appts.length > 0 && reminders.length > 0 && " · "}
                        {reminders.length > 0 && `${reminders.length} 📌`}
                      </div>
                    )}
                  </div>

                  {/* Citas y recordatorios del día */}
                  <div style={{flex:1,background:"#252d45",padding:"6px 0",overflowY:"auto"}}>
                    {appts.length === 0 && reminders.length === 0
                      ? <div style={{padding:"12px 8px",color:"#ffffff22",fontSize:11,textAlign:"center"}}>—</div>
                      : appts.map(({patient:pat, appt})=>{
                          const grand = patientGrand(pat);
                          const paid  = payments.filter(pay=>pay.patient_id===pat.id).reduce((s,pay)=>s+(parseFloat(pay.amount)||0),0);
                          const debt  = parseFloat((grand-paid).toFixed(2));
                          let badgeColor = null;
                          if (grand>0) {
                            if (paid===0)     badgeColor="#e67e22";
                            else if (debt<=0) badgeColor="#27ae60";
                            else              badgeColor="#e74c3c";
                          }
                          return (
                            <div key={appt.id}
                              style={{margin:"4px 6px",borderRadius:8,padding:"7px 8px",
                                background:"#2c3250",borderLeft:`3px solid ${badgeColor||"#445"}`,
                                transition:"background 0.12s"}}
                              onMouseEnter={e=>e.currentTarget.style.background="#364060"}
                              onMouseLeave={e=>e.currentTarget.style.background="#2c3250"}>
                              <div onClick={()=>{ openEdit(pat); setShowWeekly(false); }} style={{cursor:"pointer"}}>
                                {appt.time && (
                                  <div style={{fontSize:10,color:"#c9a84c",fontWeight:700,marginBottom:2}}>
                                    {appt.time}
                                  </div>
                                )}
                                <div style={{fontSize:11,fontWeight:700,color:"#fff",lineHeight:1.3,
                                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                  {pat.name||"Sin nombre"}
                                </div>
                                <div style={{fontSize:10,color:"#8899bb",marginTop:1}}>
                                  HC {pat.hc||"—"}
                                </div>
                                {badgeColor && (
                                  <div style={{fontSize:10,fontWeight:700,color:badgeColor,marginTop:3}}>
                                    {paid===0 ? `${fmtEur(grand)} a pagar` : debt<=0 ? "Pagado" : `Deuda ${fmtEur(debt)}`}
                                  </div>
                                )}
                              </div>
                              {pat.phone && (()=>{
                                const fn = ((pat.name||"").trim().split(/\s+/)[0]||"paciente").replace(/^./,c=>c.toUpperCase()).replace(/(?<=^.).*/,s=>s.toLowerCase());
                                const wp = (n=>/^[6789]\d{8}$/.test(n)?"34"+n:n)(pat.phone.replace(/\D/g,""));
                                const msg = `Hola ${fn}! Como estás?.\n\nTe envío este mensaje para recordarte que el día ${fmtDate(appt.date)} tienes cita en la clínica.\n\nCualquier cambio que quieras hacer, me lo dices y vemos si nos podemos ajustar o bien cambiamos la cita.\n\nSaludos ${fn}, nos vemos el ${fmtDate(appt.date)}`;
                                const dbCount = (waClicks.find(c=>c.patient_id===pat.id&&c.button_key==="cita")?.count)||0;
                                const count = dbCount > 0 ? dbCount : parseInt(localStorage.getItem(`wa_${pat.id}_cita`)||"0");
                                return (
                                  <div style={{marginTop:5,display:"flex"}} onClick={e=>e.stopPropagation()}>
                                    <div style={{position:"relative",display:"inline-flex"}}>
                                      <a href={`whatsapp://send?phone=${wp}&text=${encodeURIComponent(msg)}`}
                                        onClick={()=>incWaClick(pat.id,"cita")}
                                        style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:"#3498db18",border:"1px solid #3498db55",color:"#3498db",fontWeight:600,textDecoration:"none",whiteSpace:"nowrap"}}>
                                        aviso de cita
                                      </a>
                                      {count > 0 && (
                                        <span style={{position:"absolute",top:-5,right:-5,background:"#3498db",color:"#fff",borderRadius:"50%",minWidth:14,height:14,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 2px",lineHeight:1,pointerEvents:"none"}}>
                                          {count}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })
                    }
                    {reminders.map(({patient:pat, reminder:rem})=>(
                      <div key={rem.id}
                        onClick={()=>{ openEdit(pat); setShowWeekly(false); }}
                        style={{margin:"4px 6px",borderRadius:8,padding:"7px 8px",cursor:"pointer",
                          background:"#c9a84c18",border:"1px solid #c9a84c44",borderLeft:"3px solid #c9a84c",
                          transition:"background 0.12s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#c9a84c30"}
                        onMouseLeave={e=>e.currentTarget.style.background="#c9a84c18"}>
                        <div style={{fontSize:10,color:"#c9a84c",fontWeight:700,marginBottom:2}}>📌 Recordatorio</div>
                        <div style={{fontSize:11,fontWeight:700,color:"#fff",lineHeight:1.3,
                          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {pat.name||"Sin nombre"}
                        </div>
                        {rem.text && (
                          <div style={{fontSize:10,color:"#c9a84ccc",marginTop:2,lineHeight:1.3,
                            overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
                            {rem.text}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{padding:"26px 32px"}}>
        {dbLoading && <div style={{textAlign:"center",color:"#444",padding:60,fontSize:14}}>Cargando...</div>}

        {!dbLoading && view==="form" && editing && (
          <>
            <div style={{marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>{goBack();setEditing(null);}} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:22}}>←</button>
              <h2 style={{margin:0,color:"#2c3250",fontSize:18,fontWeight:700}}>
                {editing.name?`Editando: ${editing.name}`:"Nuevo paciente"}
              </h2>
              {editing.name && editing.phone && (
                <a href={`whatsapp://send?phone=${(editing.phone||"").replace(/\D/g,"")}`}
                  style={{background:"#25D366",borderRadius:8,color:"#fff",padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:700,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6,flexShrink:0}}>
                  💬 WhatsApp
                </a>
              )}
            </div>
            <PatientForm patient={editing} onSave={savePatient} onCancel={()=>{goBack();setEditing(null);}} templates={templates}
              payments={payments} onPaymentsChange={fetchPayments} isNew={!patients.some(x=>x.id===editing.id)}/>
          </>
        )}

        {!dbLoading && view==="dashboard" && (
          <>
            {(() => {
              const tabs = [
                { id:"frío",               label:"Fríos",             color:"#7f8c8d", list: archivedPatients.filter(p=>getStatus(p)==="frío"),              archived:true },
                { id:"pendiente",          label:"Pendientes",        color:"#c9a84c", list: recent.filter(p=>getStatus(p)==="pendiente")                              },
                { id:"en curso",           label:"Con citas",         color:"#3498db", list: recent.filter(p=>getStatus(p)==="en curso")                               },
                { id:"cerrado con deuda",  label:"Cerrados c/ deuda", color:"#e67e22", list: recent.filter(p=>getStatus(p)==="cerrado con deuda")                      },
                { id:"cerrado sin deuda",  label:"Cerrados sin deuda",color:"#2ecc71", list: archivedPatients.filter(p=>getStatus(p)==="cerrado sin deuda"), archived:true },
              ];
              const activeTab = tabs.find(t=>t.id===statusTab) || tabs[0];
              const tabList   = isSearching ? filtered : activeTab.list;

              return (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
                    {tabs.map(tab => {
                      const active = !isSearching && statusTab === tab.id;
                      return (
                        <div key={tab.id} onClick={()=>{setStatusTab(tab.id);setFilter("");if(tab.archived)ensureArchived();}}
                          style={{background: active ? tab.color+"1a":"#f5f7fa", borderRadius:10, padding:"14px 18px",
                            borderTop:`3px solid ${tab.color}`,
                            border: active ? `1px solid ${tab.color}55`:"1px solid #e2e5ed",
                            cursor:"pointer", transition:"all 0.15s"}}
                          onMouseEnter={e=>{ if(!active) e.currentTarget.style.background="#e2e5ed"; }}
                          onMouseLeave={e=>{ if(!active) e.currentTarget.style.background="#f5f7fa"; }}>
                          <div style={{fontSize:28,fontWeight:800,color:tab.color,lineHeight:1}}>
                            {tab.archived && !archivedLoaded ? "…" : tab.list.length}
                          </div>
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
                    waClicks={waClicks.filter(c=>c.patient_id===p.id)}
                    onWaClick={(key)=>incWaClick(p.id,key)}
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
          <PagosExcelPanel patients={[...patients,...archivedPatients]} payments={payments} onPaymentsChange={fetchPayments}/>
        )}

        {!dbLoading && view==="citas" && (
          <CitasExcelPanel patients={[...patients,...archivedPatients]} onRefresh={fetchPatients}/>
        )}

        {!dbLoading && view==="presupuestos" && (
          <PresupuestosExcelPanel patients={[...patients,...archivedPatients]} onRefresh={fetchPatients}/>
        )}

        {!dbLoading && view==="clinica" && (
          <ClinicaPanel doctors={doctors} templates={templates} translations={translations}
            onRefreshDoctors={fetchDoctors} onRefreshTemplates={fetchTemplates} onRefreshTranslations={fetchTranslations}/>
        )}

        {!dbLoading && view==="stats" && (
          <EstadisticasPanel payments={payments} items={items} patients={allPatients} onOpenPatient={openEdit} onRefreshItems={fetchItems} onSync={syncAllItems} onEnsureArchived={ensureArchived} archivedLoaded={archivedLoaded} clinicStats={clinicStats} onSaveClinicStat={saveClinicStat}/>
        )}
      </div>
    </div>
  );
} 
