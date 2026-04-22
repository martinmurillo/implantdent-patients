import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { translateTreatment } from "./treatments";

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
  const budgetNo = get(/Presupuesto\s*:\s*([\d\s\/]+)/i).replace(/\s+/g,"");
  const dateRaw  = get(/Fecha\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const date     = dateRaw ? dateRaw.split("/").reverse().join("-") : today();
  const treatments = [];
  const rx = /(\d{4})\s+\d\s+([\w\s\.\-\/áéíóúñüÁÉÍÓÚÑÜ]+?)\s+([\d]+[.,]\d{2})\s*€\s+([\d]+[.,]\d{2})\s*€\s+(\d+)%\s+([\d]+[.,]\d{2})\s*€/g;
  let m;
  while ((m = rx.exec(txt)) !== null) {
    const value    = parseFloat(m[4].replace(",","."));
    const total    = parseFloat(m[6].replace(",","."));
    const discount = parseFloat((value - total).toFixed(2));
    treatments.push({ id:genId(), name:m[2].trim(), value:String(value), discount:discount>0?String(discount):"0" });
  }
  return { hc, name, budgetNo, date, time:"", treatments };
};

// ─── PIN AUTH ────────────────────────────────────────────────────────────────
const PIN_HASH = "5409cbc4848a7d07b30a475b98165ea5b25a13fc0982eccab3fa679365ffa0ca";
const hashPin  = async (pin) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
};

function PinLock({ onUnlock }) {
  const [pin,   setPin]   = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const h = await hashPin(pin);
    if (h === PIN_HASH) {
      sessionStorage.setItem("unlocked","1");
      onUnlock();
    } else {
      setError(true); setShake(true); setPin("");
      setTimeout(()=>setShake(false), 500);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"#0a0d14",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#12151e",border:"1px solid #1e2230",borderRadius:16,padding:"48px 40px",textAlign:"center",width:320}}>
        <div style={{fontWeight:900,fontSize:18,letterSpacing:4,color:"#c9a84c",marginBottom:6}}>IMPLANTDENT</div>
        <div style={{fontSize:11,color:"#444",letterSpacing:2,marginBottom:36}}>GESTIÓN DE PACIENTES</div>
        <form onSubmit={submit}>
          <input
            type="password" inputMode="numeric" maxLength={8} autoFocus
            value={pin} onChange={e=>{setPin(e.target.value);setError(false);}}
            placeholder="PIN"
            style={{
              background:"#0d1117", border:`1px solid ${error?"#e74c3c":"#2a2e3b"}`,
              borderRadius:10, color:"#e8e6e0", padding:"14px 16px", fontSize:22,
              textAlign:"center", letterSpacing:10, width:"100%", outline:"none",
              boxSizing:"border-box", marginBottom:16,
              animation: shake ? "shake 0.4s" : "none",
            }}
          />
          {error && <div style={{color:"#e74c3c",fontSize:12,marginBottom:12}}>PIN incorrecto</div>}
          <button type="submit" style={{...{background:"linear-gradient(135deg,#c9a84c,#a07830)",border:"none",borderRadius:8,color:"#fff",padding:"12px 0",cursor:"pointer",fontSize:14,fontWeight:700,width:"100%"}}}>
            Entrar
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
const fmtEur   = (v) => v && parseFloat(v) ? `€${parseFloat(v).toLocaleString("es-ES",{minimumFractionDigits:2})}` : "-";
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
  id:genId(), name:"", hc:"", budgetNo:"", date:today(), time:"",
  treatments:[], appointments:[], notes:"",
  status:"active", last_contact:today(), closed:false,
});
const emptyTx   = () => ({ id:genId(), name:"", value:"", discount:"0" });
const emptyAppt = () => ({ id:genId(), label:"", date:"", time:"", doctors:"", payment:"", treatmentIds:[] });

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = {
  card:    { background:"#12151e", border:"1px solid #1e2230", borderRadius:12, padding:"16px 20px", marginBottom:10 },
  input:   { background:"#0d1117", border:"1px solid #2a2e3b", borderRadius:8, color:"#e8e6e0", padding:"9px 12px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" },
  smInput: { background:"#0d1117", border:"1px solid #2a2e3b", borderRadius:6, color:"#e8e6e0", padding:"7px 10px", fontSize:13, width:"100%", outline:"none", boxSizing:"border-box" },
  label:   { fontSize:11, color:"#c9a84c", letterSpacing:1, textTransform:"uppercase", display:"block", marginBottom:5 },
  btnGold: { background:"linear-gradient(135deg,#c9a84c,#a07830)", border:"none", borderRadius:8, color:"#fff", padding:"9px 22px", cursor:"pointer", fontSize:13, fontWeight:700 },
  btnDark: { background:"#1a2240", border:"1px solid #c9a84c44", borderRadius:8, color:"#c9a84c", padding:"9px 16px", cursor:"pointer", fontSize:13, fontWeight:600 },
  btnGhost:{ background:"none", border:"1px solid #333", borderRadius:8, color:"#888", padding:"9px 20px", cursor:"pointer", fontSize:13 },
  btnSm:   { background:"#1a2240", border:"1px solid #c9a84c33", borderRadius:6, color:"#c9a84c", padding:"4px 10px", cursor:"pointer", fontSize:12 },
};

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
const exportToPDF = async (patient, lang, setExporting, patPayments=[]) => {
  if (setExporting) setExporting(lang);
  let treatments = [...(patient.treatments||[])];
  const appointments = patient.appointments || [];
  treatments.sort((a,b) => a.name.localeCompare(b.name));
  if (lang !== "es" && treatments.length > 0) {
    treatments = treatments.map(tr => ({ ...tr, name: translateTreatment(tr.name, lang) }));
  }
  const t    = T[lang];
  const sub  = treatments.reduce((a,tr)=>a+(parseFloat(tr.value)||0),0);
  const disc = treatments.reduce((a,tr)=>a+(parseFloat(tr.discount)||0),0);
  const grand = sub-disc;
  const totalPaid = (patPayments||[]).reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
  const remaining = grand - totalPaid;
  const txRows = treatments.map(tr=>`
    <tr>
      <td>${tr.name}</td><td>${fmtEur(tr.value)}</td>
      <td>${fmtEur(tr.discount)}</td>
      <td>${fmtEur((parseFloat(tr.value)||0)-(parseFloat(tr.discount)||0))}</td>
    </tr>`).join("");
  const txMap = Object.fromEntries(treatments.map(tr=>[tr.id, tr]));
  const apptRows = appointments.map((appt, idx) => {
    const apptTxs = (appt.treatmentIds||[]).map(id => txMap[id]).filter(Boolean);
    const dateStr = appt.date ? `${fmtDate(appt.date)}${appt.time?" "+appt.time:""}` : t.toConfirm;
    const txGrid = apptTxs.length === 0 ? "-" :
      `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">` +
      apptTxs.slice(0,20).map(tr=>`<div style="font-size:10px;line-height:1.3;word-break:break-word">☐ ${tr.name}</div>`).join("") + `</div>`;
    return `<tr>
      <td style="font-weight:700;color:#1a1a2e;white-space:nowrap">${ordinal(idx+1, lang)}</td>
      <td style="white-space:nowrap">${dateStr}</td>
      <td style="white-space:nowrap">${appt.doctors || "-"}</td>
      <td style="padding:6px 12px">${txGrid}</td>
      <td style="white-space:nowrap">${fmtEur(appt.payment)}</td>
    </tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  *{box-sizing:border-box}body{font-family:'Georgia',serif;margin:36px 40px 60px;color:#1a1a2e;font-size:13px;line-height:1.8}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #c9a84c;padding-bottom:18px;margin-bottom:26px}
  .header-center{text-align:center;flex:1}.header-center h1{font-size:24px;letter-spacing:5px;margin:0 0 3px}
  .header-center p{color:#888;margin:0;font-size:12px}.logo{width:80px;height:auto}.spacer{width:80px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:26px}
  .info-item{display:flex;gap:6px}.lbl{font-weight:bold;color:#c9a84c;white-space:nowrap}
  table{width:100%;border-collapse:collapse;margin-bottom:26px}
  th{background:#1a1a2e;color:#ffffff;padding:10px 12px;text-align:left;font-size:14px;letter-spacing:1px;white-space:nowrap}
  td{padding:9px 12px;border-bottom:1px solid #eee;vertical-align:middle}tr:nth-child(even) td{background:#f9f8f5}
  .totals{margin-left:auto;width:290px;margin-bottom:26px}.tr{display:flex;justify-content:space-between;padding:6px 12px}
  .tr-grand{background:#1a1a2e;color:#c9a84c;font-weight:700;font-size:15px;border-radius:4px}
  .sec{font-size:11px;letter-spacing:3px;text-transform:uppercase;border-left:4px solid #c9a84c;padding-left:10px;margin:26px 0 12px;color:#1a1a2e}
  .notes-box{background:#f9f8f5;border-left:3px solid #c9a84c;padding:12px 14px;border-radius:4px;font-style:italic}
  .footer{margin-top:36px;border-top:1px solid #ddd;padding-top:18px}.consent{font-style:italic;margin-bottom:24px;color:#333}
  .sig-block{display:flex;align-items:flex-end;gap:10px;margin-bottom:28px}.sig-line{border-bottom:1px solid #1a1a2e;width:240px;height:44px}
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
  </div>
  <table><thead><tr><th>${t.treatment}</th><th>${t.value}</th><th>${t.discount}</th><th>${t.total}</th></tr></thead>
  <tbody>${txRows}</tbody></table>
  <div class="totals">
    <div class="tr"><span>${t.subtotal}</span><span>${fmtEur(sub)}</span></div>
    <div class="tr"><span>${t.totalDiscount}</span><span>-${fmtEur(disc)}</span></div>
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
function TreatmentRow({ tr, onChange, onRemove }) {
  const total = (parseFloat(tr.value)||0)-(parseFloat(tr.discount)||0);
  const si = (f, ph, type="text") => (
    <input type={type} placeholder={ph} value={tr[f]} onChange={e=>onChange(f,e.target.value)} style={s.smInput}/>
  );
  return (
    <div style={{...s.card, padding:"12px 14px", position:"relative", marginBottom:8}}>
      <div style={{display:"grid", gridTemplateColumns:"2.5fr 1fr 1fr auto", gap:8}}>
        {si("name","Tratamiento")}{si("value","Valor €","number")}{si("discount","Descuento €","number")}
        <div style={{background:"#1a2240",borderRadius:6,padding:"7px 12px",color:"#c9a84c",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",whiteSpace:"nowrap"}}>
          €{total.toLocaleString("es-ES",{minimumFractionDigits:2})}
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
    <div style={{background:"#0d1117",border:"1px solid #c9a84c33",borderRadius:10,padding:"14px 16px",marginBottom:10,position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{background:"#c9a84c",color:"#0a0d14",borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:800}}>{idx+1}ª CITA</span>
        <div style={{flex:1,height:1,background:"#1e2230"}}/>
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
                style={{background:sel?"#c9a84c":"#12151e",border:`1px solid ${sel?"#c9a84c":"#2a2e3b"}`,borderRadius:20,color:sel?"#0a0d14":"#888",padding:"4px 12px",cursor:"pointer",fontSize:12,transition:"all 0.15s",display:"inline-flex",alignItems:"center",gap:6}}>
                {tr.name||"Sin nombre"}
                {usedCount > 0 && (
                  <span style={{background:sel?"#0a0d14":"#c9a84c",color:sel?"#c9a84c":"#0a0d14",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,flexShrink:0}}>{usedCount}</span>
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
  const [p, setP]           = useState(patient);
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

  const sub   = p.treatments.reduce((a,t)=>a+(parseFloat(t.value)||0),0);
  const disc  = p.treatments.reduce((a,t)=>a+(parseFloat(t.discount)||0),0);
  const grand = sub-disc;

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
        budgetNo:parsed.budgetNo||prev.budgetNo, date:parsed.date||prev.date,
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
        onBlur={e=>e.target.style.borderColor="#2a2e3b"}/>
    </div>
  );

  const sortedTx = [...p.treatments].sort((a,b)=>a.name.localeCompare(b.name));

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
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:14,marginBottom:14}}>
          <Field label="Nombre del paciente" field="name"/>
          <Field label="Expediente / HC" field="hc"/>
          <Field label="Nº Presupuesto" field="budgetNo"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <Field label="Fecha" field="date" type="date"/>
          <Field label="Hora" field="time" type="time"/>
        </div>
      </div>
      <div style={{display:"flex",gap:0,marginBottom:16,background:"#0d1117",borderRadius:10,padding:4,width:"fit-content"}}>
        {[["treatments","Tratamientos"],["appointments","Citas"],["payments","Pagos"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{background:tab===id?"#1a2240":"none",border:"none",borderRadius:8,color:tab===id?"#c9a84c":"#555",padding:"8px 20px",cursor:"pointer",fontSize:13,fontWeight:tab===id?700:400,transition:"all 0.15s"}}>
            {label}
            {id==="appointments" && p.appointments.length>0 &&
              <span style={{background:"#c9a84c",color:"#0a0d14",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,marginLeft:6}}>{p.appointments.length}</span>}
            {id==="payments" && patPayments.length>0 &&
              <span style={{background:"#e74c3c",color:"#fff",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,marginLeft:6}}>{patPayments.length}</span>}
          </button>
        ))}
      </div>
      {tab==="treatments" && (
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={s.label}>Tratamientos (se ordenan por nombre en el PDF)</span>
            <button onClick={addTx} style={s.btnDark}>+ Agregar</button>
          </div>
          {p.treatments.length===0 && (
            <div style={{textAlign:"center",color:"#333",padding:24,background:"#0d1117",borderRadius:10,fontSize:13}}>Sin tratamientos — importá un PDF o agregá manualmente</div>
          )}
          {sortedTx.map(tr=>(<TreatmentRow key={tr.id} tr={tr} onChange={(f,v)=>updTx(tr.id,f,v)} onRemove={()=>remTx(tr.id)}/>))}
          {p.treatments.length>0 && (
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
              <div style={{width:280}}>
                {[["Subtotal",fmtEur(sub)],["Descuentos",`-${fmtEur(disc)}`]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 10px",color:"#666",fontSize:13}}><span>{l}</span><span>{v}</span></div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:"#1a2240",borderRadius:8,color:"#c9a84c",fontWeight:700,fontSize:15,marginTop:4}}>
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
            <div style={{textAlign:"center",color:"#333",padding:24,background:"#0d1117",borderRadius:10,fontSize:13}}>Sin citas — agregá la primera cita y asignale tratamientos</div>
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
            <div style={{textAlign:"center",color:"#555",padding:40,background:"#0d1117",borderRadius:10,fontSize:13}}>
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
                ? <div style={{textAlign:"center",color:"#333",padding:28,background:"#0d1117",borderRadius:10,fontSize:13}}>Sin pagos registrados</div>
                : patPayments.map(pay=>(
                  <div key={pay.id} style={{...s.card,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div>
                      <span style={{color:"#c9a84c",fontWeight:700,marginRight:12}}>{fmtEur(pay.amount)}</span>
                      <span style={{color:"#888",fontSize:12}}>{fmtDate(pay.date)}</span>
                      {pay.note && <span style={{color:"#555",fontSize:12,marginLeft:8}}>— {pay.note}</span>}
                    </div>
                    <button onClick={()=>deletePayment(pay.id)}
                      style={{...s.btnSm,background:"#2a0a0a",border:"1px solid #e74c3c88",color:"#e74c3c"}}>
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
          <button key={lang} onClick={()=>exportToPDF(p,lang,setExp,patPayments)} disabled={!!exporting}
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
      style={{background:"#12151e",border:`1px solid ${c}44`,borderLeft:`4px solid ${c}`,borderRadius:10,padding:"12px 16px",cursor:"pointer",marginBottom:8}}
      onMouseEnter={e=>e.currentTarget.style.background="#1a1e2a"}
      onMouseLeave={e=>e.currentTarget.style.background="#12151e"}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:"#e8e6e0",fontWeight:600}}>{patient.name}</span>
        <span style={{fontSize:11,color:c,fontWeight:700,letterSpacing:1}}>{msg.toUpperCase()}</span>
      </div>
      <div style={{fontSize:12,color:"#555",marginTop:3}}>Presupuesto #{patient.budget_no} — Tocá para abrir</div>
    </div>
  );
}

// ─── PatientCard ──────────────────────────────────────────────────────────────
function PatientCard({ patient, onEdit, onToggleClosed, onDelete, patientPayments=[], onOpen=null }) {
  const [exporting, setExp] = useState(null);
  const sub  = (patient.treatments||[]).reduce((a,t)=>a+(parseFloat(t.value)||0),0);
  const disc = (patient.treatments||[]).reduce((a,t)=>a+(parseFloat(t.discount)||0),0);
  const grand = sub - disc;
  const totalPaid = patientPayments.reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
  const hasPending = patientPayments.length > 0 && totalPaid < grand;
  const days = daysDiff(patient.last_contact);
  let bc = "#c9a84c44";
  if(!patient.closed){
    if(days>=15) bc="#8e44ad"; else if(days>=7) bc="#e74c3c"; else if(days>=4) bc="#f39c12";
  } else bc="#2ecc71";
  return (
    <div style={{...s.card, borderLeft:`4px solid ${bc}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div onClick={onOpen?()=>onOpen(patient):undefined}
          style={{flex:1, cursor:onOpen?"pointer":"default"}}>
          <div style={{fontWeight:700,color:"#e8e6e0",fontSize:15}}>{patient.name||"Sin nombre"}</div>
          <div style={{fontSize:12,color:"#555",marginTop:2}}>HC: {patient.hc||"—"} · #{patient.budget_no||"—"} · {fmtDate(patient.date)}</div>
          <div style={{fontSize:12,color:"#777",marginTop:4}}>
            {(patient.treatments||[]).length} tratamiento(s) · {(patient.appointments||[]).length} cita(s) · <span style={{color:"#c9a84c",fontWeight:600}}>{fmtEur(grand)}</span>
            {hasPending && <span style={{color:"#e74c3c",marginLeft:8,fontWeight:600}}>· Deuda: {fmtEur(grand-totalPaid)}</span>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
          <div style={{display:"flex",gap:5}}>
            {["es","en","fr"].map(lang=>(
              <button key={lang} onClick={()=>exportToPDF(patient,lang,setExp,patientPayments)} disabled={!!exporting} title={`PDF ${lang.toUpperCase()}`}
                style={{...s.btnSm, opacity:exporting?0.6:1, cursor:exporting?"not-allowed":"pointer"}}>
                {exporting===lang?"⏳":lang.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>onEdit(patient)} style={{...s.btnDark,padding:"5px 12px",fontSize:12}}>Editar</button>
            <button onClick={()=>onToggleClosed(patient)}
              style={{background:patient.closed?"#0d2014":"#1a1e2a",border:`1px solid ${patient.closed?"#2ecc7144":"#44444444"}`,borderRadius:6,color:patient.closed?"#2ecc71":"#777",padding:"5px 12px",cursor:"pointer",fontSize:12}}>
              {patient.closed?"✓ Cerrado":"Cerrar"}
            </button>
            <button onClick={()=>onDelete(patient)}
              style={{...s.btnSm,background:"#2a0a0a",border:"1px solid #e74c3c88",color:"#e74c3c",padding:"5px 12px",fontSize:12}}>
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
    <div style={{display:"flex",alignItems:"center",gap:12,background:"#12151e",borderRadius:10,padding:"8px 14px",border:"1px solid #1e2230"}}>
      <button onClick={prev} style={{background:"none",border:"none",color:"#c9a84c",cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px"}}>‹</button>
      <span style={{color:"#e8e6e0",fontWeight:700,fontSize:14,minWidth:160,textAlign:"center"}}>{fmtMonthLabel(year, month)}</span>
      <button onClick={next} style={{background:"none",border:"none",color:isNow?"#333":"#c9a84c",cursor:isNow?"default":"pointer",fontSize:18,lineHeight:1,padding:"0 4px"}} disabled={isNow}>›</button>
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
            <span style={{color:"#e8e6e0",fontWeight:600}}>{d.name}</span>
            <button onClick={()=>remove(d.id)}
              style={{background:"#2a0a0a",border:"1px solid #e74c3c88",borderRadius:6,color:"#e74c3c",padding:"4px 12px",cursor:"pointer",fontSize:12}}>
              Eliminar
            </button>
          </div>
        ))
      }
    </div>
  );
}

// ─── PendingPanel ─────────────────────────────────────────────────────────────
function PendingPanel({ items, doctors, onRefresh }) {
  const [saving, setSaving] = useState({});
  const pending = items.filter(i => !i.realized_date);

  const updateItem = async (id, fields) => {
    setSaving(prev=>({...prev,[id]:true}));
    await supabase.from("treatment_items").update(fields).eq("id", id);
    await onRefresh();
    setSaving(prev=>({...prev,[id]:false}));
  };

  const markRealized = async (item) => {
    const date = prompt("Fecha de realización (YYYY-MM):", today().slice(0,7));
    if (!date) return;
    await updateItem(item.id, { realized_date: date + "-01" });
  };

  if (pending.length === 0) return (
    <div>
      <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,marginBottom:16,fontWeight:700}}>⏳ TRATAMIENTOS PENDIENTES DE REALIZAR</div>
      <div style={{textAlign:"center",color:"#333",padding:56,fontSize:14}}>No hay tratamientos pendientes</div>
    </div>
  );

  return (
    <div>
      <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,marginBottom:16,fontWeight:700}}>
        ⏳ TRATAMIENTOS PENDIENTES DE REALIZAR
        <span style={{background:"#e74c3c",color:"#fff",borderRadius:"50%",width:20,height:20,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,marginLeft:8}}>{pending.length}</span>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{borderBottom:"1px solid #1e2230"}}>
              {["Paciente","HC","Tratamiento","Importe","Doctor",""].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:11,color:"#c9a84c",letterSpacing:1,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pending.map(item => (
              <tr key={item.id} style={{borderBottom:"1px solid #1a1e2a"}}>
                <td style={{padding:"10px 12px",color:"#e8e6e0",fontSize:13}}>{item.patient_name}</td>
                <td style={{padding:"10px 12px",color:"#666",fontSize:12}}>{item.hc||"—"}</td>
                <td style={{padding:"10px 12px",color:"#aaa",fontSize:13}}>{item.treatment_name}</td>
                <td style={{padding:"10px 12px",color:"#c9a84c",fontWeight:600,fontSize:13,whiteSpace:"nowrap"}}>{fmtEur(item.amount)}</td>
                <td style={{padding:"6px 12px",minWidth:160}}>
                  <select value={item.doctor_id||""} onChange={e=>updateItem(item.id,{doctor_id:e.target.value||null})}
                    style={{...s.smInput,fontSize:12}} disabled={saving[item.id]}>
                    <option value="">Sin asignar</option>
                    {doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </td>
                <td style={{padding:"6px 12px"}}>
                  <button onClick={()=>markRealized(item)}
                    style={{...s.btnSm,background:"#0d2014",border:"1px solid #2ecc7144",color:"#2ecc71",whiteSpace:"nowrap"}}
                    disabled={saving[item.id]}>
                    ✓ Marcar realizado
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ResumenPanel ─────────────────────────────────────────────────────────────
function ResumenPanel({ items, doctors }) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedRealized, setSelectedRealized] = useState(new Set());

  const monthStr   = `${year}-${String(month+1).padStart(2,"0")}`;
  const vendidos   = items.filter(i => i.closed_date   && i.closed_date.startsWith(monthStr));
  const realizados = items.filter(i => i.realized_date && i.realized_date.startsWith(monthStr));

  const getDoctorName = (id) => doctors.find(d=>d.id===id)?.name || "Sin doctor";

  const groupByDoctorTreatment = (list) => {
    const map = {};
    list.forEach(item => {
      const docKey  = item.doctor_id || "__none__";
      const docName = getDoctorName(item.doctor_id);
      if (!map[docKey]) map[docKey] = { name: docName, treatments: {} };
      const txKey = item.treatment_name;
      if (!map[docKey].treatments[txKey]) map[docKey].treatments[txKey] = { name: txKey, items: [] };
      map[docKey].treatments[txKey].items.push(item);
    });
    return map;
  };

  const toggleRealized = (id) => {
    setSelectedRealized(prev => { const next = new Set(prev); if(next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const printResumen = (lista, titulo, agruparPorHC=false) => {
    const getDrName = (id) => doctors.find(d=>d.id===id)?.name || "Sin doctor";
    let grandTotal = 0;
    let rows = "";

    if (agruparPorHC) {
      // Doctor → Paciente (HC) → tratamientos
      const byDoc = {};
      lista.forEach(item => {
        const dk = item.doctor_id||"__none__";
        if (!byDoc[dk]) byDoc[dk] = { name:getDrName(item.doctor_id), patients:{} };
        const pk = item.hc||item.patient_name;
        if (!byDoc[dk].patients[pk]) byDoc[dk].patients[pk] = { hc:item.hc, name:item.patient_name, items:[] };
        byDoc[dk].patients[pk].items.push(item);
      });
      rows = Object.values(byDoc).map(doc => {
        let docTotal = 0;
        const patRows = Object.values(doc.patients).map(pat => {
          const patTotal = pat.items.reduce((a,i)=>a+(parseFloat(i.amount)||0),0);
          docTotal += patTotal; grandTotal += patTotal;
          const txRows = pat.items.map(item => {
            const pieza = (item.treatment_name.match(/\s{2,}(\d{1,2})$/) || [])[1] || "—";
            return `<tr>
              <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;color:#888;font-size:11px">${pat.hc||"—"}</td>
              <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;color:#555;font-size:11px">${pat.name}</td>
              <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;color:#333;padding-left:20px">${item.treatment_name}</td>
              <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;color:#888;font-size:12px;text-align:center">${pieza}</td>
              <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;text-align:right;font-weight:600">${fmtEur(item.amount)}</td>
            </tr>`;
          }).join("");
          return `<tr style="background:#f9f8f5">
            <td colspan="4" style="padding:8px 12px;font-weight:700;color:#1a1a2e;font-size:12px;border-left:3px solid #c9a84c">HC ${pat.hc||"—"} — ${pat.name}</td>
            <td style="padding:8px 12px;text-align:right;color:#c9a84c;font-weight:700">${fmtEur(patTotal)}</td>
          </tr>${txRows}`;
        }).join("");
        return `<tr style="background:#e8e4dc">
          <td colspan="4" style="padding:10px 12px;font-weight:800;color:#1a1a2e;font-size:14px">👨‍⚕️ ${doc.name}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:800;color:#c9a84c">${fmtEur(docTotal)}</td>
        </tr>${patRows}`;
      }).join("");
    } else {
      // Doctor → filas individuales (HC, nombre, tratamiento, pieza, importe)
      const byDoc = {};
      lista.forEach(item => {
        const dk = item.doctor_id||"__none__";
        if (!byDoc[dk]) byDoc[dk] = { name:getDrName(item.doctor_id), items:[] };
        byDoc[dk].items.push(item);
      });
      rows = Object.values(byDoc).map(doc => {
        let docTotal = 0;
        const itemRows = doc.items.map(item => {
          const pieza = (item.treatment_name.match(/\s{2,}(\d{1,2})$/) || [])[1] || "—";
          const amt = parseFloat(item.amount)||0;
          docTotal += amt; grandTotal += amt;
          return `<tr>
            <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;color:#888;font-size:11px">${item.hc||"—"}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;color:#555;font-size:11px">${item.patient_name}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;color:#333">${item.treatment_name}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;color:#888;font-size:12px;text-align:center">${pieza}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f0ede6;text-align:right;font-weight:600">${fmtEur(item.amount)}</td>
          </tr>`;
        }).join("");
        return `<tr style="background:#e8e4dc">
          <td colspan="4" style="padding:10px 12px;font-weight:800;color:#1a1a2e;font-size:14px">👨‍⚕️ ${doc.name}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:800;color:#c9a84c">${fmtEur(docTotal)}</td>
        </tr>${itemRows}`;
      }).join("");
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:Georgia,serif;margin:36px 40px;color:#1a1a2e;font-size:13px}
      h1{font-size:20px;letter-spacing:4px;border-bottom:3px solid #c9a84c;padding-bottom:12px;margin-bottom:6px}
      h2{font-size:13px;color:#888;font-weight:400;margin:0 0 24px}
      table{width:100%;border-collapse:collapse}
      th{background:#1a1a2e;color:#ffffff;padding:10px 12px;text-align:left;font-size:14px;letter-spacing:1px}
      th:last-child,td:last-child{text-align:right}
      .grand{background:#1a1a2e;color:#c9a84c;font-size:16px;font-weight:800}
      .grand td{padding:14px 12px}
    </style></head><body>
      <h1>${titulo}</h1><h2>${fmtMonthLabel(year, month)}</h2>
      <table><thead><tr>
        <th>HC</th><th>Paciente</th><th>Tratamiento</th><th style="text-align:center">Pieza</th><th>Importe</th>
      </tr></thead><tbody>
        ${rows}
        <tr class="grand"><td colspan="4">TOTAL GENERAL</td><td>${fmtEur(grandTotal)}</td></tr>
      </tbody></table>
    </body></html>`;
    const win = window.open("","_blank");
    win.document.write(html); win.document.close();
    setTimeout(()=>win.print(), 600);
  };

  const ListaResumen = ({ lista, titulo, color, selectable=false }) => {
    if (lista.length === 0) return (
      <div style={{textAlign:"center",color:"#333",padding:32,background:"#0d1117",borderRadius:10,fontSize:13}}>
        Sin datos para {fmtMonthLabel(year, month)}
      </div>
    );
    const grouped = groupByDoctorTreatment(lista);
    return (
      <div>
        {Object.values(grouped).map(doc => {
          let docTotal = 0;
          return (
            <div key={doc.name} style={{marginBottom:16}}>
              <div style={{background:"#12151e",borderLeft:`4px solid ${color}`,borderRadius:"8px 8px 0 0",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:"#e8e6e0",fontWeight:700,fontSize:14}}>👨‍⚕️ {doc.name}</span>
              </div>
              <div style={{background:"#0d1117",borderRadius:"0 0 8px 8px",overflow:"hidden"}}>
                {Object.values(doc.treatments).map(tx => {
                  const total = tx.items.reduce((a,i)=>a+(parseFloat(i.amount)||0),0);
                  docTotal += total;
                  return tx.items.map(item => {
                    const isSel = selectedRealized.has(item.id);
                    return (
                      <div key={item.id}
                        onClick={selectable?()=>toggleRealized(item.id):undefined}
                        style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid #1a1e2a",cursor:selectable?"pointer":"default",background:selectable&&isSel?"#0d2014":"transparent",transition:"background 0.1s"}}
                        onMouseEnter={selectable&&!isSel?e=>{e.currentTarget.style.background="#12151e";}:undefined}
                        onMouseLeave={selectable?e=>{e.currentTarget.style.background=isSel?"#0d2014":"transparent";}:undefined}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          {selectable && (
                            <span style={{width:16,height:16,borderRadius:4,border:`2px solid ${isSel?"#2ecc71":"#333"}`,background:isSel?"#2ecc71":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#0a0d14",flexShrink:0}}>
                              {isSel?"✓":""}
                            </span>
                          )}
                          <div>
                            <div style={{color:"#aaa",fontSize:13}}>{item.treatment_name}</div>
                            <div style={{color:"#444",fontSize:11}}>{item.patient_name}{item.hc?` · HC ${item.hc}`:""}</div>
                          </div>
                        </div>
                        <span style={{color:color,fontWeight:600,fontSize:13,whiteSpace:"nowrap"}}>{fmtEur(item.amount)}</span>
                      </div>
                    );
                  });
                })}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 16px",background:"#12151e"}}>
                  <span style={{color:"#555",fontSize:12}}>Total {doc.name}</span>
                  <span style={{color:color,fontWeight:700}}>{fmtEur(docTotal)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const realizadosSelected = realizados.filter(i => selectedRealized.has(i.id));
  const grandVendidos   = vendidos.reduce((a,i)=>a+(parseFloat(i.amount)||0),0);
  const grandRealizados = realizados.reduce((a,i)=>a+(parseFloat(i.amount)||0),0);

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700}}>📊 RESUMEN CLÍNICO</div>
        <MonthNav year={year} month={month} onChange={(y,m)=>{setYear(y);setMonth(m);setSelectedRealized(new Set());}}/>
      </div>

      {/* Lista 1 */}
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:"#c9a84c",letterSpacing:2,fontWeight:700}}>💰 VENDIDOS / CERRADOS</div>
            <div style={{fontSize:12,color:"#555",marginTop:2}}>{vendidos.length} tratamiento(s) · <span style={{color:"#c9a84c",fontWeight:600}}>{fmtEur(grandVendidos)}</span></div>
          </div>
          <button onClick={()=>printResumen(vendidos,"PRESUPUESTOS CERRADOS",true)} style={s.btnDark}>🖨 Imprimir</button>
        </div>
        <ListaResumen lista={vendidos} color="#c9a84c" selectable={false}/>
      </div>

      {/* Lista 2 */}
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div>
            <div style={{fontSize:11,color:"#2ecc71",letterSpacing:2,fontWeight:700}}>✅ REALIZADOS</div>
            <div style={{fontSize:11,color:"#444",marginTop:3}}>
              {realizados.length} tratamiento(s) · <span style={{color:"#2ecc71",fontWeight:600}}>{fmtEur(grandRealizados)}</span>
              {" · Tocá los ítems para seleccionarlos"}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {selectedRealized.size > 0 && (
              <button onClick={()=>printResumen(realizadosSelected,"TRATAMIENTOS REALIZADOS")}
                style={{...s.btnDark,border:"1px solid #2ecc7144",color:"#2ecc71"}}>
                🖨 Selección ({selectedRealized.size})
              </button>
            )}
            <button onClick={()=>printResumen(realizados,"TRATAMIENTOS REALIZADOS")}
              style={{...s.btnDark,border:"1px solid #2ecc7144",color:"#2ecc71"}}>🖨 Todos</button>
          </div>
        </div>
        <ListaResumen lista={realizados} color="#2ecc71" selectable={true}/>
      </div>
    </div>
  );
}


// ─── PlantillasPanel ──────────────────────────────────────────────────────────
function PlantillasPanel({ templates, onRefresh }) {
  const [keyword,   setKeyword]   = useState("");
  const [textBlock, setTextBlock] = useState("");
  const [editing,   setEditing]   = useState(null); // id being edited
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

  const startEdit = (t) => { setKeyword(t.keyword); setTextBlock(t.text_block); setEditing(t.id); };

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
                  style={{...s.btnSm,background:"#2a0a0a",border:"1px solid #e74c3c88",color:"#e74c3c"}}>
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

// ─── ClinicaPanel ─────────────────────────────────────────────────────────────
function ClinicaPanel({ doctors, items, templates, onRefreshDoctors, onRefreshItems, onRefreshTemplates }) {
  const [tab, setTab] = useState("resumen");
  const pendingCount  = items.filter(i=>!i.realized_date).length;

  return (
    <div>
      <div style={{display:"flex",gap:0,marginBottom:20,background:"#0d1117",borderRadius:10,padding:4,width:"fit-content"}}>
        {[["resumen","Resumen"],["pending","Pendientes"],["doctors","Doctores"],["plantillas","Plantillas"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{background:tab===id?"#1a2240":"none",border:"none",borderRadius:8,color:tab===id?"#c9a84c":"#555",padding:"8px 20px",cursor:"pointer",fontSize:13,fontWeight:tab===id?700:400,transition:"all 0.15s"}}>
            {label}
            {id==="pending" && pendingCount > 0 &&
              <span style={{background:"#e74c3c",color:"#fff",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,marginLeft:6}}>{pendingCount}</span>}
          </button>
        ))}
      </div>
      {tab==="resumen"    && <ResumenPanel items={items} doctors={doctors}/>}
      {tab==="pending"    && <PendingPanel items={items} doctors={doctors} onRefresh={onRefreshItems}/>}
      {tab==="doctors"    && <DoctorsPanel doctors={doctors} onRefresh={onRefreshDoctors}/>}
      {tab==="plantillas" && <PlantillasPanel templates={templates} onRefresh={onRefreshTemplates}/>}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [unlocked, setUnlocked] = useState(()=>sessionStorage.getItem("unlocked")==="1");
  const [patients,  setPatients]  = useState([]);
  const [doctors,   setDoctors]   = useState([]);
  const [items,     setItems]     = useState([]);
  const [templates, setTemplates] = useState([]);
  const [payments,  setPayments]  = useState([]);
  const [view,      setView]      = useState("dashboard");
  const [editing,   setEditing]   = useState(null);
  const [filter,    setFilter]    = useState("");
  const [dbLoading, setDbLoad]    = useState(true);

  const fetchPatients  = async () => { const {data}=await supabase.from("patients").select("*").order("created_at",{ascending:false}); setPatients(data||[]); };
  const fetchDoctors   = async () => { const {data}=await supabase.from("doctors").select("*").order("name"); setDoctors(data||[]); };
  const fetchItems     = async () => { const {data}=await supabase.from("treatment_items").select("*").order("created_at",{ascending:false}); setItems(data||[]); };
  const fetchTemplates = async () => { const {data}=await supabase.from("treatment_templates").select("*").order("keyword"); setTemplates(data||[]); };
  const fetchPayments  = async () => { const {data}=await supabase.from("payments").select("*").order("date",{ascending:false}); setPayments(data||[]); };

  useEffect(()=>{ Promise.all([fetchPatients(),fetchDoctors(),fetchItems(),fetchTemplates(),fetchPayments()]).then(()=>setDbLoad(false)); },[]);

  useEffect(()=>{
    const toFreeze = patients.filter(p=>!p.closed && p.status!=="cold" && daysDiff(p.last_contact)>15);
    if(!toFreeze.length) return;
    Promise.all(toFreeze.map(p=>supabase.from("patients").update({status:"cold"}).eq("id",p.id))).then(fetchPatients);
  },[patients]);

  const insertTreatmentItems = async (patient) => {
    const {data:existing} = await supabase.from("treatment_items").select("id").eq("patient_id", patient.id);
    if ((existing||[]).length > 0) return;
    const rows = (patient.treatments||[]).map(tr => ({
      patient_id: patient.id, patient_name: patient.name, hc: patient.hc,
      treatment_name: tr.name,
      amount: (parseFloat(tr.value)||0)-(parseFloat(tr.discount)||0),
      doctor_id: null, closed_date: patient.date||today(), realized_date: null,
    }));
    if (rows.length > 0) await supabase.from("treatment_items").insert(rows);
  };

  const savePatient = async (p) => {
    const payload = {
      name:p.name, hc:p.hc, budget_no:p.budgetNo||p.budget_no, date:p.date, time:p.time,
      treatments:p.treatments, appointments:p.appointments||[], notes:p.notes,
      status:p.status||"active", last_contact:p.last_contact||today(), closed:p.closed||false,
    };
    const isNew = !patients.some(x=>x.id===p.id);
    if (isNew) await supabase.from("patients").insert([payload]);
    else       await supabase.from("patients").update(payload).eq("id",p.id);
    await fetchPatients(); setView("dashboard"); setEditing(null);
  };

  const toggleClosed = async (patient) => {
    const nowClosed = !patient.closed;
    await supabase.from("patients").update({closed:nowClosed, last_contact:today()}).eq("id",patient.id);
    if (nowClosed) { await insertTreatmentItems({...patient,closed:true}); await fetchItems(); }
    await fetchPatients();
  };

  const deletePatient = async (patient) => {
    if (!confirm(`¿Seguro que querés eliminar a ${patient.name}? Esta acción no se puede deshacer`)) return;
    await supabase.from("patients").delete().eq("id",patient.id);
    await fetchPatients(); await fetchItems();
  };

  const openEdit = (p) => { setEditing(p); setView("form"); };
  const newPt    = ()  => { setEditing(emptyPatient()); setView("form"); };

  const active = patients.filter(p=>p.status!=="cold");
  const cold   = patients.filter(p=>p.status==="cold");
  const alerts = active.filter(p=>!p.closed && daysDiff(p.last_contact)>=4);
  const recent = active.filter(p=>daysDiff(p.date)<15);
  const old    = active.filter(p=>daysDiff(p.date)>=15);

  const pendingDebtPatients = patients.filter(p=>{
    const hasPayments = payments.some(pay=>pay.patient_id===p.id);
    if (!hasPayments) return false;
    const sub  = (p.treatments||[]).reduce((a,t)=>a+(parseFloat(t.value)||0),0);
    const disc = (p.treatments||[]).reduce((a,t)=>a+(parseFloat(t.discount)||0),0);
    const grand = sub - disc;
    const paid = payments.filter(pay=>pay.patient_id===p.id).reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
    return paid < grand;
  });

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
    <div style={{minHeight:"100vh",background:"#0a0d14",color:"#e8e6e0",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#0d1117",borderBottom:"1px solid #1e2230",padding:"0 28px",display:"flex",alignItems:"center",gap:28,height:60}}>
        <span style={{fontWeight:900,fontSize:15,letterSpacing:3,color:"#c9a84c"}}>IMPLANTDENT</span>
        <span style={{fontSize:10,color:"#3a3a4a",letterSpacing:2}}>GESTIÓN DE PACIENTES</span>
        <div style={{flex:1}}/>
        <NavBtn id="dashboard" label="Pacientes"  badge={alerts.length}/>
        <NavBtn id="old"       label="+15 días"    badge={old.length}/>
        <NavBtn id="cold"      label="Fríos"       badge={cold.length}/>
        <NavBtn id="debts"     label="Deudas"      badge={pendingDebtPatients.length}/>
        <NavBtn id="clinica"   label="Clínica"     badge={items.filter(i=>!i.realized_date).length}/>
        <button onClick={newPt} style={s.btnGold}>+ Nuevo paciente</button>
      </div>

      <div style={{padding:"26px 28px",maxWidth:980,margin:"0 auto"}}>
        {dbLoading && <div style={{textAlign:"center",color:"#444",padding:60,fontSize:14}}>Cargando...</div>}

        {!dbLoading && view==="form" && editing && (
          <>
            <div style={{marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>{setView("dashboard");setEditing(null);}} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:22}}>←</button>
              <h2 style={{margin:0,color:"#e8e6e0",fontSize:18,fontWeight:700}}>
                {editing.name?`Editando: ${editing.name}`:"Nuevo paciente"}
              </h2>
            </div>
            <PatientForm patient={editing} onSave={savePatient} onCancel={()=>{setView("dashboard");setEditing(null);}} templates={templates}
              payments={payments} onPaymentsChange={fetchPayments} isNew={!patients.some(x=>x.id===editing.id)}/>
          </>
        )}

        {!dbLoading && view==="dashboard" && (
          <>
            {alerts.length>0 && (
              <div style={{marginBottom:24}}>
                <div style={{fontSize:11,color:"#e74c3c",letterSpacing:2,marginBottom:10,fontWeight:700}}>🔔 ALERTAS DE SEGUIMIENTO</div>
                {alerts.map(p=><AlertCard key={p.id} patient={p} onOpen={openEdit}/>)}
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
              {[
                {label:"Activos",  value:active.filter(p=>!p.closed).length, color:"#c9a84c"},
                {label:"Cerrados", value:active.filter(p=>p.closed).length,  color:"#2ecc71"},
                {label:"Alertas",  value:alerts.length,                       color:"#e74c3c"},
                {label:"Fríos",    value:cold.length,                         color:"#8e44ad"},
              ].map(st=>(
                <div key={st.label} style={{background:"#12151e",borderRadius:10,padding:"14px 18px",borderTop:`3px solid ${st.color}`}}>
                  <div style={{fontSize:28,fontWeight:800,color:st.color,lineHeight:1}}>{st.value}</div>
                  <div style={{fontSize:12,color:"#555",marginTop:4}}>{st.label}</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:12,marginBottom:14,alignItems:"center"}}>
              <input type="text" placeholder="Buscar en todos los pacientes (nombre, HC, Nº presupuesto)..."
                value={filter} onChange={e=>setFilter(e.target.value)}
                style={{...s.input, flex:1, fontSize:13}}/>
            </div>

            {isSearching && (
              <div style={{fontSize:12,color:"#555",marginBottom:10}}>Resultados para "{filter}" — todos los estados</div>
            )}
            {!isSearching && (
              <div style={{fontSize:11,color:"#555",letterSpacing:1,marginBottom:10,fontWeight:700}}>ÚLTIMOS 15 DÍAS</div>
            )}
            {filtered.length===0 && (
              <div style={{textAlign:"center",color:"#333",padding:56,fontSize:14}}>
                {isSearching ? "Sin resultados para esa búsqueda" : "Sin presupuestos de los últimos 15 días"}
              </div>
            )}
            {filtered.map(p=><PatientCard key={p.id} patient={p} onEdit={openEdit} onToggleClosed={toggleClosed} onDelete={deletePatient}
              patientPayments={payments.filter(pay=>pay.patient_id===p.id)}
              onOpen={isSearching ? openEdit : null}
            />)}
          </>
        )}

        {!dbLoading && view==="old" && (
          <>
            <div style={{fontSize:12,color:"#888",letterSpacing:2,marginBottom:16,fontWeight:700}}>📅 PRESUPUESTOS +15 DÍAS</div>
            {old.length===0
              ? <div style={{textAlign:"center",color:"#333",padding:56,fontSize:14}}>No hay presupuestos de más de 15 días</div>
              : old.map(p=><PatientCard key={p.id} patient={p} onEdit={openEdit} onToggleClosed={toggleClosed} onDelete={deletePatient}
                  patientPayments={payments.filter(pay=>pay.patient_id===p.id)}/>)
            }
          </>
        )}

        {!dbLoading && view==="cold" && (
          <>
            <div style={{fontSize:12,color:"#8e44ad",letterSpacing:2,marginBottom:16,fontWeight:700}}>❄️ PACIENTES FRÍOS</div>
            {cold.length===0
              ? <div style={{textAlign:"center",color:"#333",padding:56,fontSize:14}}>No hay pacientes fríos</div>
              : cold.map(p=><PatientCard key={p.id} patient={p} onEdit={openEdit} onToggleClosed={toggleClosed} onDelete={deletePatient}
                  patientPayments={payments.filter(pay=>pay.patient_id===p.id)}/>)
            }
          </>
        )}

        {!dbLoading && view==="debts" && (
          <>
            <div style={{fontSize:12,color:"#e74c3c",letterSpacing:2,marginBottom:16,fontWeight:700}}>💳 PACIENTES CON SALDO PENDIENTE</div>
            {pendingDebtPatients.length===0
              ? <div style={{textAlign:"center",color:"#333",padding:56,fontSize:14}}>No hay pacientes con saldo pendiente</div>
              : pendingDebtPatients.map(p=>{
                  const sub  = (p.treatments||[]).reduce((a,t)=>a+(parseFloat(t.value)||0),0);
                  const disc = (p.treatments||[]).reduce((a,t)=>a+(parseFloat(t.discount)||0),0);
                  const grand = sub - disc;
                  const paid = payments.filter(pay=>pay.patient_id===p.id).reduce((a,pay)=>a+(parseFloat(pay.amount)||0),0);
                  const pending = grand - paid;
                  return (
                    <div key={p.id} onClick={()=>openEdit(p)}
                      style={{...s.card,cursor:"pointer",borderLeft:"4px solid #e74c3c88",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#1a1e2a"}
                      onMouseLeave={e=>e.currentTarget.style.background="#12151e"}>
                      <div>
                        <div style={{fontWeight:700,color:"#e8e6e0",fontSize:15}}>{p.name||"Sin nombre"}</div>
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

        {!dbLoading && view==="clinica" && (
          <ClinicaPanel doctors={doctors} items={items} templates={templates}
            onRefreshDoctors={fetchDoctors} onRefreshItems={fetchItems} onRefreshTemplates={fetchTemplates}/>
        )}
      </div>
    </div>
  );
} 