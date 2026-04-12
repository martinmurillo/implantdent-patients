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

// ─── LOGO ─────────────────────────────────────────────────────────────────────
const LOGO = null;
// ─── DATA SHAPES ──────────────────────────────────────────────────────────────
const emptyPatient = () => ({
  id:genId(), name:"", hc:"", budgetNo:"", date:today(), time:"",
  treatments:[], appointments:[], notes:"",
  status:"active", last_contact:today(), closed:false,
});
const emptyTx   = () => ({ id:genId(), name:"", value:"", discount:"0" });
const emptyAppt = () => ({ id:genId(), label:"", date:"", time:"", doctors:"", payment:"", treatmentIds:[] });

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
const exportToPDF = async (patient, lang, setExporting) => {
  if (setExporting) setExporting(lang);

  let treatments = [...(patient.treatments||[])];
  const appointments = patient.appointments || [];

  // Sort treatments by name so same names group together
  treatments.sort((a,b) => a.name.localeCompare(b.name));

  // Translate treatment names using local dictionary (no API needed)
  if (lang !== "es" && treatments.length > 0) {
    treatments = treatments.map(tr => ({ ...tr, name: translateTreatment(tr.name, lang) }));
  }

  const t    = T[lang];
  const sub  = treatments.reduce((a,tr)=>a+(parseFloat(tr.value)||0),0);
  const disc = treatments.reduce((a,tr)=>a+(parseFloat(tr.discount)||0),0);
  const grand = sub-disc;

  // Build treatment rows (already sorted by name = grouped)
  const txRows = treatments.map(tr=>`
    <tr>
      <td>${tr.name}</td>
      <td>${fmtEur(tr.value)}</td>
      <td>${fmtEur(tr.discount)}</td>
      <td>${fmtEur((parseFloat(tr.value)||0)-(parseFloat(tr.discount)||0))}</td>
    </tr>`).join("");

  // Build appointment schedule
  // For each appointment, find its treatments (by id)
  const txMap = Object.fromEntries(treatments.map(tr=>[tr.id, tr]));
  const apptRows = appointments.map((appt, idx) => {
    const apptTxs = (appt.treatmentIds||[]).map(id => txMap[id]).filter(Boolean);
    const dateStr = appt.date ? `${fmtDate(appt.date)}${appt.time?" "+appt.time:""}` : t.toConfirm;
    const txLines = apptTxs.map(tr=>`<div style="padding:3px 0;border-bottom:1px solid #f0f0f0">${tr.name}</div>`).join("");
    return `
    <tr>
      <td style="font-weight:700;color:#1a1a2e;vertical-align:top;white-space:nowrap">${ordinal(idx+1, lang)}</td>
      <td style="vertical-align:top">${dateStr}</td>
      <td style="vertical-align:top">${appt.doctors || "-"}</td>
      <td style="vertical-align:top">${txLines || "-"}</td>
      <td style="vertical-align:top;white-space:nowrap">${fmtEur(appt.payment)}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  *{box-sizing:border-box}
  body{font-family:'Georgia',serif;margin:36px 40px 60px;color:#1a1a2e;font-size:13px;line-height:1.8}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #c9a84c;padding-bottom:18px;margin-bottom:26px}
  .header-center{text-align:center;flex:1}
  .header-center h1{font-size:24px;letter-spacing:5px;margin:0 0 3px}
  .header-center p{color:#888;margin:0;font-size:12px}
  .logo{width:80px;height:auto}
  .spacer{width:80px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:26px}
  .info-item{display:flex;gap:6px}
  .lbl{font-weight:bold;color:#c9a84c;white-space:nowrap}
  table{width:100%;border-collapse:collapse;margin-bottom:26px}
  th{background:#1a1a2e;color:#c9a84c;padding:10px 12px;text-align:left;font-size:11px;letter-spacing:1px}
  td{padding:9px 12px;border-bottom:1px solid #eee;vertical-align:middle}
  tr:nth-child(even) td{background:#f9f8f5}
  .totals{margin-left:auto;width:290px;margin-bottom:26px}
  .tr{display:flex;justify-content:space-between;padding:6px 12px}
  .tr-grand{background:#1a1a2e;color:#c9a84c;font-weight:700;font-size:15px;border-radius:4px}
  .sec{font-size:11px;letter-spacing:3px;text-transform:uppercase;border-left:4px solid #c9a84c;padding-left:10px;margin:26px 0 12px;color:#1a1a2e}
  .notes-box{background:#f9f8f5;border-left:3px solid #c9a84c;padding:12px 14px;border-radius:4px;font-style:italic}
  .footer{margin-top:36px;border-top:1px solid #ddd;padding-top:18px}
  .consent{font-style:italic;margin-bottom:24px;color:#333}
  .sig-block{display:flex;align-items:flex-end;gap:10px;margin-bottom:28px}
  .sig-line{border-bottom:1px solid #1a1a2e;width:240px;height:44px}
  .sig-lbl{font-size:11px;color:#888;letter-spacing:1px}
  .legal{font-size:10px;color:#999;line-height:1.7;border-top:1px solid #eee;padding-top:12px}
  </style></head><body>

  <div class="header">
    <img src="http://localhost:5173/logo.png" class="logo" alt="Logo"/>
    <div class="header-center">
      <h1>${t.budget}</h1>
      <p>${fmtDate(patient.date)}${patient.time?" · "+patient.time:""}</p>
    </div>
    <div class="spacer"></div>
  </div>

  <div class="info-grid">
    <div class="info-item"><span class="lbl">${t.patient}:</span> ${patient.name}</div>
    <div class="info-item"><span class="lbl">${t.budgetNo}:</span> ${patient.budget_no||patient.budgetNo||""}</div>
    <div class="info-item"><span class="lbl">${t.hc}:</span> ${patient.hc||""}</div>
    <div class="info-item"><span class="lbl">${t.date}:</span> ${fmtDate(patient.date)}</div>
  </div>

  <table>
    <thead><tr>
      <th>${t.treatment}</th><th>${t.value}</th><th>${t.discount}</th><th>${t.total}</th>
    </tr></thead>
    <tbody>${txRows}</tbody>
  </table>

  <div class="totals">
    <div class="tr"><span>${t.subtotal}</span><span>${fmtEur(sub)}</span></div>
    <div class="tr"><span>${t.totalDiscount}</span><span>-${fmtEur(disc)}</span></div>
    <div class="tr tr-grand"><span>${t.grandTotal}</span><span>${fmtEur(grand)}</span></div>
  </div>

  ${appointments.length > 0 ? `
  <div class="sec">${t.appointmentDetail}</div>
  <table>
    <thead><tr>
      <th>Cita</th><th>${t.appointment}</th><th>${t.doctors}</th><th>${t.treatment}</th><th>${t.payment}</th>
    </tr></thead>
    <tbody>${apptRows}</tbody>
  </table>` : ""}

  ${patient.notes ? `<div class="sec">${t.notes}</div><div class="notes-box">${patient.notes}</div>` : ""}

  <div class="footer">
    <p class="consent">${CONSENT[lang]}</p>
    <div class="sig-block">
      <div class="sig-line"></div>
      <span class="sig-lbl">${SIG_LABEL[lang]}</span>
    </div>
    <div class="legal">${LEGAL[lang]}</div>
  </div>
  </body></html>`;

  if (setExporting) setExporting(null);
  const win = window.open("","_blank");
  win.document.write(html);
  win.document.close();
  setTimeout(()=>win.print(), 800);
};

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

// ─── TreatmentRow ─────────────────────────────────────────────────────────────
function TreatmentRow({ tr, onChange, onRemove }) {
  const total = (parseFloat(tr.value)||0)-(parseFloat(tr.discount)||0);
  const si = (f, ph, type="text") => (
    <input type={type} placeholder={ph} value={tr[f]} onChange={e=>onChange(f,e.target.value)} style={s.smInput}/>
  );
  return (
    <div style={{...s.card, padding:"12px 14px", position:"relative", marginBottom:8}}>
      <div style={{display:"grid", gridTemplateColumns:"2.5fr 1fr 1fr auto", gap:8}}>
        {si("name","Tratamiento")}
        {si("value","Valor €","number")}
        {si("discount","Descuento €","number")}
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
  const si = (f, ph, type="text", grid="1fr") => (
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
        {si("date","Fecha","date")}
        {si("time","Hora","time")}
        {si("doctors","Doctor(es)")}
        {si("payment","Pago €","number")}
      </div>
      <div>
        <label style={{...s.label, fontSize:10, marginBottom:6}}>Tratamientos en esta cita</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {treatments.length===0 && <span style={{color:"#444",fontSize:12}}>Primero agregá tratamientos arriba</span>}
          {treatments.map(tr=>{
            const sel = (appt.treatmentIds||[]).includes(tr.id);
            // Count how many OTHER appointments already have this treatment
            const usedCount = (allAppointments||[]).filter(a => a.id !== appt.id && (a.treatmentIds||[]).includes(tr.id)).length;
            return (
              <button key={tr.id} onClick={()=>toggleTx(tr.id)}
                style={{background:sel?"#c9a84c":"#12151e",border:`1px solid ${sel?"#c9a84c":"#2a2e3b"}`,borderRadius:20,color:sel?"#0a0d14":"#888",padding:"4px 12px",cursor:"pointer",fontSize:12,transition:"all 0.15s",position:"relative",display:"inline-flex",alignItems:"center",gap:6}}>
                {tr.name||"Sin nombre"}
                {usedCount > 0 && (
                  <span style={{background:sel?"#0a0d14":"#c9a84c",color:sel?"#c9a84c":"#0a0d14",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,flexShrink:0}}>
                    {usedCount}
                  </span>
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
function PatientForm({ patient, onSave, onCancel }) {
  const [p, setP]             = useState(patient);
  const [msg, setMsg]         = useState("");
  const [loading, setL]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const [exporting, setExp]   = useState(null);
  const [tab, setTab]         = useState("treatments"); // treatments | appointments
  const fileRef               = useRef();

  const setF   = (f,v) => setP(prev=>({...prev,[f]:v}));
  const addTx  = () => setP(prev=>({...prev, treatments:[...prev.treatments, emptyTx()]}));
  const updTx  = (id,f,v) => setP(prev=>({...prev, treatments:prev.treatments.map(t=>t.id===id?{...t,[f]:v}:t)}));
  const remTx  = (id) => setP(prev=>({...prev, treatments:prev.treatments.filter(t=>t.id!==id)}));
  const addAppt= () => setP(prev=>({...prev, appointments:[...prev.appointments, emptyAppt()]}));
  const updAppt= (id,f,v) => setP(prev=>({...prev, appointments:prev.appointments.map(a=>a.id===id?{...a,[f]:v}:a)}));
  const remAppt= (id) => setP(prev=>({...prev, appointments:prev.appointments.filter(a=>a.id!==id)}));

  const sub   = p.treatments.reduce((a,t)=>a+(parseFloat(t.value)||0),0);
  const disc  = p.treatments.reduce((a,t)=>a+(parseFloat(t.discount)||0),0);
  const grand = sub-disc;

  const handlePDF = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    setL(true); setMsg("Leyendo PDF...");
    try {
      const parsed = await parsePDF(file);
      setP(prev=>({
        ...prev,
        name:       parsed.name      || prev.name,
        hc:         parsed.hc        || prev.hc,
        budgetNo:   parsed.budgetNo  || prev.budgetNo,
        date:       parsed.date      || prev.date,
        treatments: parsed.treatments.length ? parsed.treatments : prev.treatments,
      }));
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

  // Sort treatments by name for display
  const sortedTx = [...p.treatments].sort((a,b)=>a.name.localeCompare(b.name));

  return (
    <div style={{maxWidth:920,margin:"0 auto"}}>
      {/* PDF import */}
      <div style={{...s.card, border:"2px dashed #c9a84c33", display:"flex", alignItems:"center", gap:16, marginBottom:20}}>
        <button onClick={()=>fileRef.current.click()} disabled={loading}
          style={{...s.btnGold, opacity:loading?0.6:1, whiteSpace:"nowrap"}}>
          {loading?"⏳ Leyendo...":"📄 Importar PDF"}
        </button>
        <input ref={fileRef} type="file" accept=".pdf" onChange={handlePDF} style={{display:"none"}}/>
        <span style={{fontSize:13, color:msg.startsWith("✓")?"#2ecc71":msg.startsWith("Error")?"#e74c3c":"#555"}}>
          {msg||"Importá un presupuesto PDF o completá manualmente"}
        </span>
      </div>

      {/* Datos básicos */}
      <div style={{...s.card, marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:14,marginBottom:14}}>
          <Field label="Nombre del paciente" field="name"/>
          <Field label="Expediente / HC"     field="hc"/>
          <Field label="Nº Presupuesto"      field="budgetNo"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <Field label="Fecha" field="date" type="date"/>
          <Field label="Hora"  field="time" type="time"/>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,marginBottom:16,background:"#0d1117",borderRadius:10,padding:4,width:"fit-content"}}>
        {[["treatments","Tratamientos"],["appointments","Citas"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{background:tab===id?"#1a2240":"none",border:"none",borderRadius:8,color:tab===id?"#c9a84c":"#555",padding:"8px 20px",cursor:"pointer",fontSize:13,fontWeight:tab===id?700:400,transition:"all 0.15s"}}>
            {label}
            {id==="appointments" && p.appointments.length>0 &&
              <span style={{background:"#c9a84c",color:"#0a0d14",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,marginLeft:6}}>{p.appointments.length}</span>
            }
          </button>
        ))}
      </div>

      {/* TRATAMIENTOS */}
      {tab==="treatments" && (
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={s.label}>Tratamientos (se ordenan por nombre en el PDF)</span>
            <button onClick={addTx} style={s.btnDark}>+ Agregar</button>
          </div>
          {p.treatments.length===0 && (
            <div style={{textAlign:"center",color:"#333",padding:24,background:"#0d1117",borderRadius:10,fontSize:13}}>
              Sin tratamientos — importá un PDF o agregá manualmente
            </div>
          )}
          {/* Show sorted visually */}
          {sortedTx.map(tr=>(
            <TreatmentRow key={tr.id} tr={tr} onChange={(f,v)=>updTx(tr.id,f,v)} onRemove={()=>remTx(tr.id)}/>
          ))}
          {p.treatments.length>0 && (
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
              <div style={{width:280}}>
                {[["Subtotal",fmtEur(sub)],["Descuentos",`-${fmtEur(disc)}`]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 10px",color:"#666",fontSize:13}}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:"#1a2240",borderRadius:8,color:"#c9a84c",fontWeight:700,fontSize:15,marginTop:4}}>
                  <span>TOTAL</span><span>{fmtEur(grand)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CITAS */}
      {tab==="appointments" && (
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={s.label}>Cronograma de citas</span>
            <button onClick={addAppt} style={s.btnDark}>+ Agregar cita</button>
          </div>
          {p.appointments.length===0 && (
            <div style={{textAlign:"center",color:"#333",padding:24,background:"#0d1117",borderRadius:10,fontSize:13}}>
              Sin citas — agregá la primera cita y asignale tratamientos
            </div>
          )}
          {p.appointments.map((appt,idx)=>(
            <AppointmentRow key={appt.id} appt={appt} idx={idx}
              treatments={p.treatments}
              allAppointments={p.appointments}
              onChange={(f,v)=>updAppt(appt.id,f,v)}
              onRemove={()=>remAppt(appt.id)}/>
          ))}
        </div>
      )}

      {/* Notas */}
      <div style={{marginBottom:20}}>
        <label style={s.label}>Notas</label>
        <textarea value={p.notes||""} onChange={e=>setF("notes",e.target.value)} rows={3}
          placeholder="Observaciones, indicaciones..."
          style={{...s.input, resize:"vertical"}}/>
      </div>

      {/* Acciones */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        {["es","en","fr"].map(lang=>(
          <button key={lang} onClick={()=>exportToPDF(p,lang,setExp)}
            disabled={!!exporting}
            style={{...s.btnDark, opacity:exporting?0.6:1, cursor:exporting?"not-allowed":"pointer"}}>
            {exporting===lang?"⏳ Traduciendo...":`🖨 PDF ${lang.toUpperCase()}`}
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={onCancel} style={s.btnGhost}>Cancelar</button>
        <button onClick={async()=>{setSaving(true);await onSave(p);setSaving(false);}}
          disabled={saving} style={{...s.btnGold, opacity:saving?0.7:1}}>
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
function PatientCard({ patient, onEdit, onToggleClosed }) {
  const [exporting, setExp] = useState(null);
  const sub  = (patient.treatments||[]).reduce((a,t)=>a+(parseFloat(t.value)||0),0);
  const disc = (patient.treatments||[]).reduce((a,t)=>a+(parseFloat(t.discount)||0),0);
  const days = daysDiff(patient.last_contact);
  let bc = "#c9a84c44";
  if(!patient.closed){
    if(days>=15) bc="#8e44ad"; else if(days>=7) bc="#e74c3c"; else if(days>=4) bc="#f39c12";
  } else bc="#2ecc71";

  return (
    <div style={{...s.card, borderLeft:`4px solid ${bc}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontWeight:700,color:"#e8e6e0",fontSize:15}}>{patient.name||"Sin nombre"}</div>
          <div style={{fontSize:12,color:"#555",marginTop:2}}>
            HC: {patient.hc||"—"} · #{patient.budget_no||"—"} · {fmtDate(patient.date)}
          </div>
          <div style={{fontSize:12,color:"#777",marginTop:4}}>
            {(patient.treatments||[]).length} tratamiento(s) · {(patient.appointments||[]).length} cita(s) · <span style={{color:"#c9a84c",fontWeight:600}}>{fmtEur(sub-disc)}</span>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
          <div style={{display:"flex",gap:5}}>
            {["es","en","fr"].map(lang=>(
              <button key={lang} onClick={()=>exportToPDF(patient,lang,setExp)}
                disabled={!!exporting} title={`PDF ${lang.toUpperCase()}`}
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
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [patients, setPatients] = useState([]);
  const [view, setView]         = useState("dashboard");
  const [editing, setEditing]   = useState(null);
  const [filter, setFilter]     = useState("");
  const [dbLoading, setDbLoad]  = useState(true);

  const fetchPatients = async () => {
    setDbLoad(true);
    const { data, error } = await supabase.from("patients").select("*").order("created_at",{ascending:false});
    if (!error) setPatients(data||[]);
    setDbLoad(false);
  };

  useEffect(()=>{ fetchPatients(); },[]);

  useEffect(()=>{
    const toFreeze = patients.filter(p=>!p.closed && p.status!=="cold" && daysDiff(p.last_contact)>15);
    if(!toFreeze.length) return;
    Promise.all(toFreeze.map(p=>supabase.from("patients").update({status:"cold"}).eq("id",p.id))).then(fetchPatients);
  },[patients]);

  const savePatient = async (p) => {
    const payload = {
      name:         p.name,
      hc:           p.hc,
      budget_no:    p.budgetNo || p.budget_no,
      date:         p.date,
      time:         p.time,
      treatments:   p.treatments,
      appointments: p.appointments || [],
      notes:        p.notes,
      status:       p.status||"active",
      last_contact: p.last_contact||today(),
      closed:       p.closed||false,
    };
    const isNew = !patients.some(x=>x.id===p.id);
    if (isNew) await supabase.from("patients").insert([payload]);
    else       await supabase.from("patients").update(payload).eq("id",p.id);
    await fetchPatients();
    setView("dashboard"); setEditing(null);
  };

  const toggleClosed = async (patient) => {
    await supabase.from("patients").update({closed:!patient.closed,last_contact:today()}).eq("id",patient.id);
    await fetchPatients();
  };

  const openEdit  = (p) => { setEditing(p); setView("form"); };
  const newPt     = ()  => { setEditing(emptyPatient()); setView("form"); };

  const active   = patients.filter(p=>p.status!=="cold");
  const cold     = patients.filter(p=>p.status==="cold");
  const alerts   = active.filter(p=>!p.closed && daysDiff(p.last_contact)>=4);
  const filtered = active.filter(p=>
    filter===""||
    (p.name||"").toLowerCase().includes(filter.toLowerCase())||
    (p.budget_no||"").includes(filter)||
    (p.hc||"").includes(filter)
  );

  const NavBtn = ({id,label,badge}) => (
    <button onClick={()=>setView(id)}
      style={{background:"none",border:"none",color:view===id?"#c9a84c":"#666",cursor:"pointer",fontSize:13,fontWeight:view===id?700:400,borderBottom:view===id?"2px solid #c9a84c":"2px solid transparent",padding:"0 4px",height:60,display:"flex",alignItems:"center"}}>
      {label}
      {badge>0 && <span style={{background:"#e74c3c",color:"#fff",borderRadius:"50%",width:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,marginLeft:5}}>{badge}</span>}
    </button>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0a0d14",color:"#e8e6e0",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#0d1117",borderBottom:"1px solid #1e2230",padding:"0 28px",display:"flex",alignItems:"center",gap:28,height:60}}>
        <span style={{fontWeight:900,fontSize:15,letterSpacing:3,color:"#c9a84c"}}>IMPLANTDENT</span>
        <span style={{fontSize:10,color:"#3a3a4a",letterSpacing:2}}>GESTIÓN DE PACIENTES</span>
        <div style={{flex:1}}/>
        <NavBtn id="dashboard" label="Pacientes"       badge={alerts.length}/>
        <NavBtn id="cold"      label="Pacientes Fríos" badge={cold.length}/>
        <button onClick={newPt} style={s.btnGold}>+ Nuevo paciente</button>
      </div>

      <div style={{padding:"26px 28px",maxWidth:980,margin:"0 auto"}}>

        {dbLoading && <div style={{textAlign:"center",color:"#444",padding:60,fontSize:14}}>Cargando pacientes...</div>}

        {!dbLoading && view==="form" && editing && (
          <>
            <div style={{marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>{setView("dashboard");setEditing(null);}} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:22}}>←</button>
              <h2 style={{margin:0,color:"#e8e6e0",fontSize:18,fontWeight:700}}>
                {editing.name?`Editando: ${editing.name}`:"Nuevo paciente"}
              </h2>
            </div>
            <PatientForm patient={editing} onSave={savePatient} onCancel={()=>{setView("dashboard");setEditing(null);}}/>
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
                {label:"Activos",   value:active.filter(p=>!p.closed).length, color:"#c9a84c"},
                {label:"Cerrados",  value:active.filter(p=>p.closed).length,  color:"#2ecc71"},
                {label:"Alertas",   value:alerts.length,                       color:"#e74c3c"},
                {label:"Fríos",     value:cold.length,                         color:"#8e44ad"},
              ].map(st=>(
                <div key={st.label} style={{background:"#12151e",borderRadius:10,padding:"14px 18px",borderTop:`3px solid ${st.color}`}}>
                  <div style={{fontSize:28,fontWeight:800,color:st.color,lineHeight:1}}>{st.value}</div>
                  <div style={{fontSize:12,color:"#555",marginTop:4}}>{st.label}</div>
                </div>
              ))}
            </div>
            <input type="text" placeholder="Buscar por nombre, HC o Nº presupuesto..." value={filter}
              onChange={e=>setFilter(e.target.value)}
              style={{...s.input, marginBottom:14, fontSize:13}}/>
            {filtered.length===0 && (
              <div style={{textAlign:"center",color:"#333",padding:56,fontSize:14}}>Sin pacientes. Creá el primero con "+ Nuevo paciente"</div>
            )}
            {filtered.map(p=><PatientCard key={p.id} patient={p} onEdit={openEdit} onToggleClosed={toggleClosed}/>)}
          </>
        )}

        {!dbLoading && view==="cold" && (
          <>
            <div style={{fontSize:12,color:"#8e44ad",letterSpacing:2,marginBottom:16,fontWeight:700}}>❄️ PACIENTES FRÍOS</div>
            {cold.length===0
              ? <div style={{textAlign:"center",color:"#333",padding:56,fontSize:14}}>No hay pacientes fríos</div>
              : cold.map(p=><PatientCard key={p.id} patient={p} onEdit={openEdit} onToggleClosed={toggleClosed}/>)
            }
          </>
        )}
      </div>
    </div>
  );
}