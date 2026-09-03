import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { supabase } from "../supabase";
import { DocumentoPDF, DocumentoConjunto } from "../lib/consentimientos/DocumentoPDF";
import { componerDocumento, fechaLarga } from "../lib/consentimientos/merge";

// Botón de la ficha del paciente: salen los consentimientos, se marcan los que
// hagan falta, y cada uno lleva su propio profesional. Sale un archivo con
// todos los marcados, cada uno en hoja nueva, listo para imprimir y firmar.
//
// El `paciente` que llega es la fila de patients tal cual, con los nombres de
// esta base (name, dni, phone). El modelo de fusión usa otros (nombre,
// documento, telefono), así que la traducción se hace aquí y en un solo sitio.
//
// El profesional va por consentimiento y no uno para todos: a un paciente le
// puede hacer la endodoncia uno y el implante otro, y el número de colegiado
// que se imprime tiene que ser el de quien realmente lo hace.

const est = {
  fondo: { position:"fixed", inset:0, background:"#0009", zIndex:9999,
           display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
  caja:  { background:"#fff", borderRadius:14, padding:"22px 24px", width:560,
           maxHeight:"88vh", overflowY:"auto", fontFamily:"'DM Sans','Segoe UI',sans-serif",
           color:"#2c3250" },
  rotulo:{ fontSize:11, letterSpacing:2, fontWeight:700, color:"#c9a84c", marginBottom:6 },
  sel:   { background:"#fff", border:"1px solid #dde4ef", borderRadius:6, color:"#2c3250",
           padding:"4px 7px", fontSize:12, outline:"none", cursor:"pointer", maxWidth:230 },
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

  // id de plantilla → id de doctor. Estar en el mapa es estar seleccionado.
  const [elegidos, setElegidos] = useState({});
  const [firmante, setFirmante] = useState("paciente");
  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  // Resultado listo para abrir. No se abre solo: ver el comentario de generar().
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!abierto) return;
    (async () => {
      const [p, b, d, c] = await Promise.all([
        supabase.from("consent_plantillas").select("*").order("titulo"),
        supabase.from("consent_bloques").select("*").eq("activo", true),
        supabase.from("doctors").select("id, name, colegiado").order("name"),
        supabase.from("clinica_config").select("*").single(),
      ]);
      if (p.error || b.error || d.error || c.error) {
        setError("No se han podido cargar los consentimientos. Reintentá.");
        return;
      }
      setPlantillas(p.data || []);
      setBloques(new Map((b.data || []).map(x => [x.codigo, x])));
      setDoctores(d.data || []);
      setConfig(c.data);
    })();
  }, [abierto]);

  const alternar = (id) => setElegidos(prev => {
    const n = { ...prev };
    if (id in n) delete n[id]; else n[id] = "";
    return n;
  });
  const ponerDoctor = (id, docId) => setElegidos(prev => ({ ...prev, [id]: docId }));

  const ids = Object.keys(elegidos);
  const faltaDoctor = ids.some(id => !elegidos[id]);

  async function generar() {
    if (!config || ids.length === 0 || faltaDoctor) return;
    setGenerando(true);
    setError(null);
    try {
      // Se juntan para imprimirlos de una sola vez.
      const paraImprimir = [];
      let hechos = 0;
      for (const plantillaId of ids) {
        setProgreso(`${++hechos} de ${ids.length}`);
        const plantilla = plantillas.find(p => p.id === plantillaId);
        const doctor = doctores.find(d => d.id === elegidos[plantillaId]);
        if (!plantilla || !doctor) continue;

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
          // Las piezas se escriben a mano sobre el papel, como en los
          // originales: el campo sale como línea de puntos.
          tratamiento: { piezas: "" },
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

        paraImprimir.push({ titulo: plantilla.titulo, nodos, datos, blob });
      }

      // Un solo archivo con todos, cada uno empezando en hoja nueva y con su
      // propia numeración. Se firman por separado, se imprimen de una vez.
      // Con uno solo se reaprovecha el que ya se generó para archivarlo, que
      // es idéntico: no hay por qué renderizarlo dos veces.
      const juntos = paraImprimir.length === 1
        ? paraImprimir[0].blob
        : await pdf(<DocumentoConjunto docs={paraImprimir} logoUrl={config.logo_url}/>).toBlob();

      // No se abre aquí. Generar el PDF lleva su tiempo —con diez, varios
      // segundos— y para cuando termina el navegador ya no considera que haya
      // un gesto del usuario detrás, así que window.open devuelve null y no
      // pasa nada. Se deja el enlace y lo abre quien pulsa, que es un gesto
      // nuevo y no se puede bloquear.
      setResultado({
        url: URL.createObjectURL(juntos),
        titulos: paraImprimir.map(d => d.titulo),
      });
    } catch (e) {
      console.error(e);
      setError("No se ha podido generar: " + (e?.message || "error desconocido"));
    } finally {
      setGenerando(false);
      setProgreso(null);
    }
  }

  const cerrar = () => {
    if (resultado) URL.revokeObjectURL(resultado.url);
    setResultado(null);
    setElegidos({});
    setAbierto(false);
  };

  return (
    <>
      <button onClick={()=>setAbierto(true)}
        style={{fontSize:11, padding:"4px 10px", borderRadius:6, background:"#0e3b3e18",
          border:"1px solid #0e3b3e55", color:"#0e3b3e", fontWeight:600,
          whiteSpace:"nowrap", cursor:"pointer"}}>
        consentimientos
      </button>

      {abierto && (
        <div style={est.fondo} onClick={cerrar}>
          <div style={est.caja} onClick={e=>e.stopPropagation()} role="dialog"
            aria-label="Generar consentimientos">
            <div style={est.rotulo}>CONSENTIMIENTOS</div>
            <h2 style={{fontSize:18, margin:"0 0 12px"}}>{paciente.name}</h2>

            {!resultado && (
            <div style={{display:"flex", gap:14, alignItems:"center", flexWrap:"wrap",
              marginBottom:12, fontSize:12.5}}>
              <span style={{color:"#777"}}>Firma:</span>
              {[["paciente","el paciente"], ["representante","padre, madre o tutor"]].map(([v, t]) => (
                <label key={v} style={{display:"flex", gap:6, alignItems:"center", cursor:"pointer"}}>
                  <input type="radio" name="firmante" checked={firmante === v}
                    onChange={()=>setFirmante(v)}/>
                  {t}
                </label>
              ))}
              <span style={{color:"#999", fontSize:11.5}}>desde los 16 firma él</span>
            </div>
            )}

            {resultado ? (
              <>
                <div style={{background:"#eef8f1", color:"#1c7a3e", borderRadius:8,
                  padding:"12px 14px", fontSize:13, lineHeight:1.5, marginBottom:14}}>
                  <b>{resultado.titulos.length === 1 ? "Consentimiento generado" :
                      `${resultado.titulos.length} consentimientos generados`} y archivados.</b>
                  <div style={{marginTop:6, color:"#2c3250"}}>
                    {resultado.titulos.join(" · ")}
                  </div>
                </div>
                <a href={resultado.url} target="_blank" rel="noreferrer"
                  style={{...est.oro, display:"block", textAlign:"center",
                    textDecoration:"none", marginBottom:10}}>
                  Abrir e imprimir
                </a>
                <div style={{fontSize:11.5, color:"#888", textAlign:"center", marginBottom:14}}>
                  Se abre en otra pestaña. Desde ahí, imprimir.
                </div>
                <div style={{display:"flex", justifyContent:"flex-end"}}>
                  <button onClick={cerrar} style={est.gris}>Cerrar</button>
                </div>
              </>
            ) : plantillas.length === 0 ? (
              <div style={{...est.nota, background:"#f7f7f5", color:"#666"}}>
                No hay consentimientos cargados.
              </div>
            ) : (
              <div style={{border:"1px solid #dde4ef", borderRadius:8, marginBottom:14,
                maxHeight:340, overflowY:"auto"}}>
                {plantillas.map((p, i) => {
                  const marcado = p.id in elegidos;
                  return (
                    <div key={p.id} style={{display:"flex", alignItems:"center", gap:8,
                      padding:"6px 10px", borderTop: i ? "1px solid #f0f2f7" : "none",
                      background: marcado ? "#f7f3e6" : "transparent", flexWrap:"wrap"}}>
                      <label style={{display:"flex", alignItems:"center", gap:8, flex:1,
                        minWidth:180, fontSize:13, cursor:"pointer"}}>
                        <input type="checkbox" checked={marcado} onChange={()=>alternar(p.id)}/>
                        <span>
                          {p.titulo}
                          {!p.activa && (
                            <span style={{color:"#b3600f", fontSize:11}}> · sin revisar</span>
                          )}
                        </span>
                      </label>
                      {marcado && (
                        <select value={elegidos[p.id]} style={est.sel}
                          onChange={e=>ponerDoctor(p.id, e.target.value)}>
                          <option value="">Doctor...</option>
                          {doctores.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.name}{d.colegiado ? ` — ${d.colegiado}` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div style={{...est.nota, background:"#fbeae7", color:"#8c2d16"}} role="alert">
                {error}
              </div>
            )}

            {!resultado && (
            <div style={{display:"flex", gap:8, justifyContent:"flex-end", alignItems:"center"}}>
              {faltaDoctor && (
                <span style={{fontSize:12, color:"#b3600f", marginRight:"auto"}}>
                  Falta elegir el doctor
                </span>
              )}
              <button onClick={cerrar} style={est.gris}>Cancelar</button>
              <button onClick={generar} disabled={generando || ids.length === 0 || faltaDoctor}
                style={{...est.oro,
                  opacity:(generando || ids.length === 0 || faltaDoctor) ? 0.5 : 1}}>
                {generando ? `Generando ${progreso || ""}...` : `Generar ${ids.length || ""}`}
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
