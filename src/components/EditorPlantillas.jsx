import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { supabase } from "../supabase";
import { DocumentoPDF } from "../lib/consentimientos/DocumentoPDF";
import { componerDocumento, fechaLarga } from "../lib/consentimientos/merge";

// Editor de plantillas.
//
// Existe porque 17 de las 18 entraron por OCR y necesitan revisión. Corregir
// el texto aquí, con el PDF al lado, es mucho más rápido que editar JSON a
// ciegas. Solo se edita el bloque propio de cada plantilla: los compartidos
// se tocan en su propia pantalla, para no romperlos en dieciocho sitios.

// Paciente ficticio para la vista previa. Nunca uno real: la vista previa se
// abre muchas veces y no debe generar registros ni mover datos de salud.
const EJEMPLO_PACIENTE = {
  nombre: "Nombre Apellido Apellido", documento: "00000000X",
  fecha_nacimiento: "01/01/1980", edad: 46,
  domicilio: "Carrer Exemple 1, Girona", telefono: "600000000",
  historia_clinica: "0000",
};

const est = {
  campo: { background:"#fff", border:"1px solid #dde4ef", borderRadius:8, color:"#2c3250",
           padding:"8px 10px", fontSize:13, width:"100%", outline:"none",
           boxSizing:"border-box", fontFamily:"inherit", lineHeight:1.5, resize:"vertical" },
  label: { fontSize:10, letterSpacing:1, color:"#777", fontWeight:700,
           textTransform:"uppercase", display:"block", marginBottom:4 },
  oro:   { background:"linear-gradient(135deg,#c9a84c,#a07830)", border:"none", borderRadius:8,
           color:"#fff", padding:"9px 18px", fontSize:13.5, fontWeight:700, cursor:"pointer" },
  gris:  { background:"#fff", border:"1px solid #dde4ef", borderRadius:8, color:"#555",
           padding:"9px 16px", fontSize:13, cursor:"pointer" },
  nota:  { fontSize:12.5, lineHeight:1.45, borderRadius:8, padding:"9px 12px", marginBottom:12 },
};

export function EditorPlantillas() {
  const [plantillas, setPlantillas] = useState([]);
  const [bloques, setBloques] = useState(new Map());
  const [config, setConfig] = useState(null);
  const [activa, setActiva] = useState(null);
  const [nodos, setNodos] = useState([]);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    (async () => {
      const [p, b, c] = await Promise.all([
        supabase.from("consent_plantillas").select("*").order("titulo"),
        supabase.from("consent_bloques").select("*").eq("activo", true),
        supabase.from("clinica_config").select("*").single(),
      ]);
      setPlantillas(p.data || []);
      setBloques(new Map((b.data || []).map(x => [x.codigo, x])));
      setConfig(c.data || null);
    })();
  }, []);

  function abrir(p) {
    setActiva(p); setSucio(false); setAviso(null);
    const propio = p.composicion.find(i => "nodos" in i);
    setNodos(propio && "nodos" in propio ? structuredClone(propio.nodos) : []);
  }

  function editarTexto(i, valor) {
    setNodos(prev => {
      const n = structuredClone(prev);
      if (n[i].tipo === "parrafo" || n[i].tipo === "titulo") n[i].texto = valor;
      return n;
    });
    setSucio(true);
  }

  function editarItem(i, k, valor) {
    setNodos(prev => {
      const n = structuredClone(prev);
      if (n[i].tipo === "lista") n[i].items[k] = valor;
      return n;
    });
    setSucio(true);
  }

  function borrar(i) {
    setNodos(prev => prev.filter((_, k) => k !== i));
    setSucio(true);
  }

  // Los datos de la clínica en la vista previa son los de verdad: es la única
  // forma de comprobar que el pie con CIF y registro sanitario cabe y se lee.
  const datosEjemplo = () => ({
    paciente: EJEMPLO_PACIENTE,
    profesional: { nombre: "Dr./Dra. Ejemplo", colegiado: "0000" },
    clinica: {
      razon_social: config?.razon_social || "—",
      cif: config?.cif || "—",
      registro_sanitario: config?.registro_sanitario || "—",
      direccion: config?.direccion || "—",
      email_dpd: config?.email_dpd || "—",
    },
    tratamiento: { piezas: "16, 17" },
    lugar: config?.lugar_firma || "Girona",
    fecha: fechaLarga(),
  });

  async function vistaPrevia() {
    if (!activa) return;
    const datos = datosEjemplo();
    const composicion = activa.composicion.map(i => ("nodos" in i ? { nodos } : i));
    const resueltos = componerDocumento(composicion, bloques, datos, "paciente");
    const blob = await pdf(
      <DocumentoPDF titulo={activa.titulo} nodos={resueltos} datos={datos}
        logoUrl={config?.logo_url}/>
    ).toBlob();
    window.open(URL.createObjectURL(blob), "_blank");
  }

  async function guardar(activar) {
    if (!activa) return;
    setGuardando(true);
    const composicion = activa.composicion.map(i => ("nodos" in i ? { nodos } : i));
    const { error } = await supabase.from("consent_plantillas")
      .update({ composicion, ...(activar ? { activa: true } : {}) })
      .eq("id", activa.id);
    setGuardando(false);
    if (error) { setAviso("No se ha podido guardar. Volvé a intentarlo."); return; }
    setSucio(false);
    setAviso(activar ? "Plantilla activada. Ya aparece en la ficha del paciente." : "Cambios guardados.");
    if (activar) {
      setActiva({ ...activa, activa: true });
      setPlantillas(prev => prev.map(p => (p.id === activa.id ? { ...p, activa: true } : p)));
    }
  }

  // Marca los restos de OCR: series de puntos suspensivos, o rachas de
  // fragmentos de una o dos letras, que es como se ve el ruido.
  const sospechoso = (t) =>
    t.includes("………") || /\b[a-zA-Z]{1,2}(\s+[a-zA-Z]{1,2}){3,}\b/.test(t);

  return (
    <div>
      <div style={{fontSize:11, color:"#c9a84c", letterSpacing:2, marginBottom:16, fontWeight:700}}>
        📋 PLANTILLAS DE CONSENTIMIENTO
      </div>

      <div style={{display:"flex", gap:6, flexWrap:"wrap", marginBottom:16}}>
        {plantillas.map(p => (
          <button key={p.id} onClick={()=>abrir(p)}
            style={{fontSize:12, padding:"5px 12px", borderRadius:6, cursor:"pointer",
              background: activa?.id === p.id ? "#c9a84c22" : "#fff",
              border:`1px solid ${activa?.id === p.id ? "#c9a84c" : "#dde4ef"}`,
              color: activa?.id === p.id ? "#a07830" : "#555",
              fontWeight: activa?.id === p.id ? 700 : 400}}>
            {p.titulo}
            {!p.activa && <span style={{color:"#8e44ad"}} title="Sin revisar"> · inactiva</span>}
          </button>
        ))}
      </div>

      {!activa && (
        <div style={{textAlign:"center", color:"#888", padding:40, fontSize:13}}>
          Elegí una plantilla para revisarla.
        </div>
      )}

      {activa && (
        <div>
          <h2 style={{fontSize:17, margin:"0 0 10px"}}>{activa.titulo}</h2>

          {!activa.activa && (
            <div style={{...est.nota, background:"#fdf4e3", color:"#6e4c0c"}}>
              Sin revisar. Cotejala contra su escaneo en <code>docs/consentimientos/originales/</code>,
              corregí lo que haga falta y activala. Mientras esté inactiva no aparece en la
              ficha del paciente.
            </div>
          )}

          {nodos.map((nodo, i) => (
            <div key={i} style={{background:"#fff", border:"1px solid #e2e5ed", borderRadius:10,
              padding:"12px 14px", marginBottom:10}}>
              {(nodo.tipo === "titulo" || nodo.tipo === "parrafo") && (
                <>
                  <label style={est.label}>
                    {nodo.tipo === "titulo" ? "Título de sección" : "Párrafo"}
                  </label>
                  <textarea value={nodo.texto} rows={nodo.tipo === "titulo" ? 1 : 4}
                    onChange={e=>editarTexto(i, e.target.value)} style={est.campo}/>
                  {sospechoso(nodo.texto) && (
                    <div style={{fontSize:11.5, color:"#b3600f", marginTop:4}}>
                      ⚠ Posible resto de OCR
                    </div>
                  )}
                </>
              )}

              {nodo.tipo === "lista" && (
                <>
                  <label style={est.label}>Lista</label>
                  {nodo.items.map((item, k) => (
                    <div key={k} style={{marginBottom:6}}>
                      <textarea value={item} rows={2} style={est.campo}
                        onChange={e=>editarItem(i, k, e.target.value)}/>
                      {sospechoso(item) && (
                        <div style={{fontSize:11.5, color:"#b3600f", marginTop:4}}>
                          ⚠ Posible resto de OCR
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}

              {nodo.tipo === "campo_manual" && (
                <div style={{fontSize:12.5, color:"#777"}}>
                  Espacio para escribir a mano ({nodo.lineas ?? 2} líneas)
                </div>
              )}
              {nodo.tipo === "recuadro" && (
                <div style={{fontSize:12.5, color:"#777"}}>
                  Recuadro con {nodo.nodos.length} bloque(s) — se edita desde el JSON
                </div>
              )}
              {nodo.tipo === "firmas" && (
                <div style={{fontSize:12.5, color:"#777"}}>
                  Firmas: {nodo.columnas.map(c => c.etiqueta).join(" · ")}
                </div>
              )}

              <button onClick={()=>borrar(i)}
                style={{marginTop:8, background:"#fff0f0", border:"1px solid #e74c3c88",
                  borderRadius:6, color:"#e74c3c", padding:"4px 10px", fontSize:11.5,
                  cursor:"pointer"}}>
                Quitar este bloque
              </button>
            </div>
          ))}

          {aviso && (
            <div style={{...est.nota, background:"#eef8f1", color:"#1c7a3e"}}>{aviso}</div>
          )}

          <div style={{display:"flex", gap:8, flexWrap:"wrap", marginTop:14}}>
            <button onClick={vistaPrevia} style={est.gris}>Ver PDF de ejemplo</button>
            <button onClick={()=>guardar(false)} disabled={!sucio || guardando}
              style={{...est.gris, opacity:(!sucio || guardando) ? 0.5 : 1}}>
              Guardar cambios
            </button>
            <button onClick={()=>guardar(true)} disabled={guardando || activa.activa}
              style={{...est.oro, opacity:(guardando || activa.activa) ? 0.5 : 1}}>
              {activa.activa ? "Ya está activa" : "Guardar y activar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
