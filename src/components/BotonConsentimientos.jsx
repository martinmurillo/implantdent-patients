import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { supabase } from "../supabase";
import { DocumentoPDF } from "../lib/consentimientos/DocumentoPDF";
import { componerDocumento, fechaLarga } from "../lib/consentimientos/merge";

// Botón de la ficha del paciente: se marcan los consentimientos que hagan
// falta y sale un PDF por cada uno, listo para imprimir y firmar en papel.
//
// El `paciente` que llega es la fila de patients tal cual, con los nombres de
// esta base (name, dni, phone). El modelo de fusión usa otros (nombre,
// documento, telefono), así que la traducción se hace aquí y en un solo sitio.
//
// Quién firma se elige a mano. No se deduce de la edad: la ficha no guarda
// fecha de nacimiento, y una regla automática que se equivoque invalida el
// consentimiento. La norma va escrita en la propia etiqueta, para que quien
// lo marque la tenga delante.

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
  const [firmante, setFirmante] = useState("paciente");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState(null);

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
    const doctor = doctores.find(x => x.id === doctorId);
    if (!doctor) { setError("Elegí el profesional que realizará el tratamiento."); return; }

    setGenerando(true);
    setError(null);
    try {
      for (const plantillaId of seleccion) {
        const plantilla = plantillas.find(p => p.id === plantillaId);
        if (!plantilla) continue;

        const datos = {
          paciente: {
            nombre: paciente.name || "",
            documento: paciente.dni || "",
            telefono: paciente.phone || "",
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
      setError("No se ha podido generar el documento: " + (e?.message || "error desconocido"));
    } finally {
      setGenerando(false);
    }
  }

  const radio = (valor, titulo, pie) => (
    <label style={{display:"flex", gap:8, alignItems:"flex-start", padding:"7px 9px",
      borderRadius:8, cursor:"pointer", marginBottom:5,
      background: firmante === valor ? "#f7f3e6" : "#fff",
      border:`1px solid ${firmante === valor ? "#c9a84c" : "#dde4ef"}`}}>
      <input type="radio" name="firmante" checked={firmante === valor}
        onChange={()=>setFirmante(valor)} style={{marginTop:2}}/>
      <span>
        <b style={{fontSize:13}}>{titulo}</b>
        <span style={{display:"block", fontSize:11.5, color:"#777", lineHeight:1.35}}>{pie}</span>
      </span>
    </label>
  );

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

            <label style={est.label}>Quién firma</label>
            {radio("paciente", "El propio paciente",
              "Desde los 16 años firma él, aunque sea menor de edad.")}
            {radio("representante", "Padre, madre o tutor",
              "Por debajo de 16. El documento lleva espacio para escribir sus datos a mano.")}

            <div style={{display:"flex", gap:12, margin:"14px 0", flexWrap:"wrap"}}>
              <div style={{flex:2, minWidth:210}}>
                <label style={est.label}>Profesional</label>
                <select value={doctorId} onChange={e=>setDoctorId(e.target.value)}
                  style={{...est.campo, cursor:"pointer"}}>
                  <option value="">Elegir...</option>
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

            <label style={est.label}>Consentimientos a generar</label>
            {plantillas.length === 0 ? (
              <div style={{...est.nota, background:"#f7f7f5", color:"#666"}}>
                No hay ninguna plantilla activa todavía. Se activan una a una desde
                Clínica → Consentimientos, después de cotejarlas contra su escaneo.
              </div>
            ) : (
              <div style={{border:"1px solid #dde4ef", borderRadius:8, padding:"6px 10px",
                marginBottom:14, maxHeight:230, overflowY:"auto"}}>
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
              <button onClick={generar} disabled={generando || seleccion.size === 0 || !doctorId}
                style={{...est.oro,
                  opacity:(generando || seleccion.size === 0 || !doctorId) ? 0.5 : 1}}>
                {generando ? "Generando..." : `Generar ${seleccion.size || ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
