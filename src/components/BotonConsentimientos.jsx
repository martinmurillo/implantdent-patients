import { useEffect, useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { supabase } from "../supabase";
import { DocumentoPDF } from "../lib/consentimientos/DocumentoPDF";
import {
  calcularEdad, determinarFirmante, componerDocumento, fechaLarga,
} from "../lib/consentimientos/merge";

// Botón de la ficha del paciente: elegir tratamientos y sacar el PDF.
//
// El `paciente` que llega es la fila de patients tal cual, con los nombres de
// esta base (name, dni, hc, phone). El modelo de fusión usa otros
// (nombre, documento, historia_clinica), así que la traducción se hace aquí y
// en un solo sitio.

const est = {
  fondo: { position:"fixed", inset:0, background:"#0009", zIndex:9999,
           display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
  caja:  { background:"#fff", borderRadius:14, padding:"24px 26px", width:520,
           maxHeight:"88vh", overflowY:"auto", fontFamily:"'DM Sans','Segoe UI',sans-serif",
           color:"#2c3250" },
  rotulo:{ fontSize:11, letterSpacing:2, fontWeight:700, color:"#c9a84c", marginBottom:6 },
  campo: { background:"#fff", border:"1px solid #dde4ef", borderRadius:8, color:"#2c3250",
           padding:"8px 10px", fontSize:13, width:"100%", outline:"none", boxSizing:"border-box" },
  label: { fontSize:10, letterSpacing:1, color:"#777", fontWeight:700,
           textTransform:"uppercase", display:"block", marginBottom:4 },
  nota:  { fontSize:12.5, lineHeight:1.45, borderRadius:8, padding:"9px 12px", marginBottom:12 },
  oro:   { background:"linear-gradient(135deg,#c9a84c,#a07830)", border:"none", borderRadius:8,
           color:"#fff", padding:"9px 18px", fontSize:13.5, fontWeight:700, cursor:"pointer" },
  gris:  { background:"none", border:"1px solid #dde4ef", borderRadius:8, color:"#555",
           padding:"9px 16px", fontSize:13, cursor:"pointer" },
};

export function BotonConsentimientos({ paciente }) {
  const [abierto, setAbierto] = useState(false);
  const [plantillas, setPlantillas] = useState([]);
  const [bloques, setBloques] = useState(new Map());
  const [doctores, setDoctores] = useState([]);
  const [config, setConfig] = useState(null);

  const [seleccion, setSeleccion] = useState(new Set());
  const [doctorId, setDoctorId] = useState("");
  const [piezas, setPiezas] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState(null);

  // La mayoría de las fichas antiguas no tienen fecha de nacimiento: el Excel
  // del que vienen nunca la usó. En vez de bloquear el módulo hasta que
  // alguien rellene miles de fichas, se pide aquí la primera vez y se guarda.
  // El dato se va completando solo, a medida que se emiten consentimientos.
  const [nacimientoManual, setNacimientoManual] = useState("");
  const [guardarEnFicha, setGuardarEnFicha] = useState(true);

  const nacimiento = paciente.fecha_nacimiento || nacimientoManual;
  const edad = useMemo(() => (nacimiento ? calcularEdad(nacimiento) : null), [nacimiento]);
  const firmante = edad === null ? null : determinarFirmante(edad);

  useEffect(() => {
    if (!abierto) return;
    (async () => {
      const [p, b, d, c] = await Promise.all([
        supabase.from("consent_plantillas").select("*").eq("activa", true).order("titulo"),
        supabase.from("consent_bloques").select("*").eq("activo", true),
        supabase.from("doctors").select("id, name, colegiado").order("name"),
        supabase.from("clinica_config").select("*").single(),
      ]);
      if (p.error || b.error || d.error || c.error) {
        setError("No se han podido cargar las plantillas. Reintentá.");
        return;
      }
      setPlantillas(p.data || []);
      setBloques(new Map((b.data || []).map(x => [x.codigo, x])));
      setDoctores(d.data || []);
      setConfig(c.data);
    })();
  }, [abierto]);

  const alternar = (id) => setSeleccion(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  async function generar() {
    if (!config || seleccion.size === 0) return;
    if (edad === null || firmante === null) {
      setError("Indicá la fecha de nacimiento: determina quién debe firmar.");
      return;
    }
    setGenerando(true);
    setError(null);

    try {
      if (!paciente.fecha_nacimiento && nacimientoManual && guardarEnFicha) {
        await supabase.from("patients")
          .update({ fecha_nacimiento: nacimientoManual })
          .eq("id", paciente.id);
      }

      for (const plantillaId of seleccion) {
        const plantilla = plantillas.find(p => p.id === plantillaId);
        if (!plantilla) continue;

        // El profesional por defecto de la plantilla manda (implantes siempre
        // Sergio), pero si el usuario eligió otro, gana el elegido: hace falta
        // el día que el titular esté de baja.
        const doctor = doctores.find(x => x.id === doctorId)
          || doctores.find(x => x.id === plantilla.profesional_por_defecto);
        if (!doctor) {
          setError("Elegí el profesional que realizará el tratamiento.");
          setGenerando(false);
          return;
        }

        const datos = {
          paciente: {
            nombre: paciente.name || "",
            documento: paciente.dni || "",
            // la fecha que vale es la que hay, venga de la ficha o de este modal
            fecha_nacimiento: new Date(nacimiento).toLocaleDateString("es-ES"),
            edad,
            domicilio: paciente.domicilio || "",
            telefono: paciente.phone || "",
            historia_clinica: paciente.hc || "",
          },
          profesional: { nombre: doctor.name, colegiado: doctor.colegiado || "" },
          clinica: {
            razon_social: config.razon_social,
            cif: config.cif,
            registro_sanitario: config.registro_sanitario,
            direccion: config.direccion,
            email_dpd: config.email_dpd,
          },
          tratamiento: { piezas },
          lugar: config.lugar_firma,
          fecha: fechaLarga(),
        };

        // El bloque de firmas cambia según quién firme.
        const composicion = plantilla.composicion.map(item =>
          ("ref" in item && item.ref === "firmas_paciente" && firmante === "representante")
            ? { ref: "firmas_representante" }
            : item);

        const nodos = componerDocumento(composicion, bloques, datos, firmante);

        const blob = await pdf(
          <DocumentoPDF titulo={plantilla.titulo} nodos={nodos} datos={datos}
            logoUrl={config.logo_url}/>
        ).toBlob();

        // Copia congelada: se guarda el árbol YA resuelto, no una referencia a
        // la plantilla. Si mañana se edita la plantilla, este documento sigue
        // diciendo lo que dijo hoy.
        const { data: doc, error: errDoc } = await supabase
          .from("consent_documentos")
          .insert({
            paciente_id: paciente.id,
            plantilla_id: plantilla.id,
            plantilla_codigo: plantilla.codigo,
            plantilla_version: plantilla.version,
            contenido_congelado: nodos,
            datos_fusion: datos,
            profesional_id: doctor.id,
            profesional_nombre: doctor.name,
            profesional_colegiado: doctor.colegiado || "",
            firmante_tipo: firmante,
            edad_al_emitir: edad,
            emitido_por: (await supabase.auth.getUser()).data.user?.id,
          })
          .select("id")
          .single();
        if (errDoc) throw errDoc;

        const ruta = `${paciente.id}/${doc.id}.pdf`;
        await supabase.storage.from("consentimientos").upload(ruta, blob, {
          contentType: "application/pdf",
        });
        await supabase.from("consent_documentos").update({ pdf_path: ruta }).eq("id", doc.id);

        window.open(URL.createObjectURL(blob), "_blank");
      }

      setAbierto(false);
      setSeleccion(new Set());
    } catch (e) {
      console.error(e);
      setError("No se ha podido generar el documento. Volvé a intentarlo.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <button onClick={()=>setAbierto(true)}
        style={{background:"#fff", border:"1px solid #dde4ef", borderRadius:6, color:"#555",
          padding:"4px 12px", fontSize:12, cursor:"pointer", whiteSpace:"nowrap"}}>
        📋 Consentimientos
      </button>

      {abierto && (
        <div style={est.fondo} onClick={()=>setAbierto(false)}>
          <div style={est.caja} onClick={e=>e.stopPropagation()} role="dialog"
            aria-label="Generar consentimientos">
            <div style={est.rotulo}>CONSENTIMIENTOS</div>
            <h2 style={{fontSize:18, margin:"0 0 14px"}}>{paciente.name}</h2>

            {edad === null ? (
              <div style={{...est.nota, background:"#fdf4e3", color:"#6e4c0c"}}>
                <p style={{margin:"0 0 10px"}}>
                  Esta ficha no tiene fecha de nacimiento. Hace falta para saber quién
                  firma: a partir de los 16 firma el propio paciente, por debajo firma
                  el padre, la madre o el tutor.
                </p>
                <label style={est.label}>Fecha de nacimiento</label>
                <input type="date" value={nacimientoManual} style={{...est.campo, maxWidth:190}}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e=>setNacimientoManual(e.target.value)}/>
                <label style={{display:"flex", alignItems:"center", gap:7, marginTop:9, fontSize:12.5}}>
                  <input type="checkbox" checked={guardarEnFicha}
                    onChange={e=>setGuardarEnFicha(e.target.checked)}/>
                  Guardarla en la ficha del paciente
                </label>
              </div>
            ) : (
              <div style={{...est.nota, background:"#eef3f2", color:"#0e3b3e"}}>
                <b>{edad} años.</b>{" "}
                {firmante === "representante"
                  ? "Firma el padre, la madre o el tutor. El documento llevará espacio para escribir sus datos a mano."
                  : "Firma el propio paciente."}
              </div>
            )}

            {!paciente.domicilio && (
              <div style={{...est.nota, background:"#f7f7f5", color:"#666"}}>
                Sin domicilio en la ficha: el documento dejará una línea para escribirlo a mano.
              </div>
            )}

            <div style={{display:"flex", gap:12, marginBottom:14, flexWrap:"wrap"}}>
              <div style={{flex:2, minWidth:210}}>
                <label style={est.label}>Profesional</label>
                <select value={doctorId} onChange={e=>setDoctorId(e.target.value)}
                  style={{...est.campo, cursor:"pointer"}}>
                  <option value="">Por defecto según el tratamiento</option>
                  {doctores.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}{d.colegiado ? ` — col. ${d.colegiado}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{flex:1, minWidth:120}}>
                <label style={est.label}>Piezas</label>
                <input value={piezas} onChange={e=>setPiezas(e.target.value)}
                  placeholder="16, 17" style={est.campo}/>
              </div>
            </div>

            <label style={est.label}>Tratamientos</label>
            {plantillas.length === 0 ? (
              <div style={{...est.nota, background:"#f7f7f5", color:"#666"}}>
                No hay ninguna plantilla activa todavía. Se activan una a una desde
                Clínica → Consentimientos, después de cotejarlas contra su escaneo.
              </div>
            ) : (
              <div style={{border:"1px solid #dde4ef", borderRadius:8, padding:"6px 10px",
                marginBottom:14, maxHeight:210, overflowY:"auto"}}>
                {plantillas.map(p => (
                  <label key={p.id} style={{display:"flex", alignItems:"center", gap:8,
                    padding:"5px 0", fontSize:13, cursor:"pointer"}}>
                    <input type="checkbox" checked={seleccion.has(p.id)}
                      onChange={()=>alternar(p.id)}/>
                    {p.titulo}
                  </label>
                ))}
              </div>
            )}

            {error && (
              <div style={{...est.nota, background:"#fbeae7", color:"#8c2d16"}} role="alert">
                {error}
              </div>
            )}

            <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
              <button onClick={()=>setAbierto(false)} style={est.gris}>Cancelar</button>
              <button onClick={generar} disabled={generando || seleccion.size === 0}
                style={{...est.oro, opacity:(generando || seleccion.size === 0) ? 0.5 : 1}}>
                {generando ? "Generando..." : `Generar ${seleccion.size || ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
