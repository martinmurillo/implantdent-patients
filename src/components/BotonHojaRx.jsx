import { useRef, useState } from "react";
import { supabase } from "../supabase";
import { posicionPlantilla, esSuperior, agruparTratamientos, generarHojaRx } from "../lib/hojaRx";
import { separarPieza } from "../lib/consentimientos/conformidad";
import { IDIOMAS_HOJAS } from "../lib/consentimientos/hojasPaciente";
import { translateTreatment } from "../treatments";

// Botón de la ficha, junto a consentimientos: se sube la panorámica (el TIF
// que exporta Sidexis, o un JPG/PNG), la app pone sobre ella las piezas del
// presupuesto, se arrastra la que no haya caído en su diente y sale un A4 con
// logo, radiografía marcada y tratamientos. La imagen no sale del navegador:
// no se sube ni se guarda.
//
// utif y pdf-lib se cargan al usarlos, para no meterlos en el bundle de todas
// las fichas.

const tratamientosDe = (p) => Array.isArray(p.treatments) ? p.treatments : (p.treatments?.items || []);
const traductor = (idioma) => (idioma === "EN" || idioma === "FR")
  ? (n) => translateTreatment(n, idioma.toLowerCase()) : (n) => n;
const nombreDe = (t) => t?.name ?? t?.nombre ?? "";
const MAX_LADO = 3000;

// Archivo → { bytes JPEG, ancho, alto, url para verla }.
async function leerRadiografia(archivo) {
  const buf = await archivo.arrayBuffer();
  let lienzo;
  if (/\.tiff?$/i.test(archivo.name) || archivo.type === "image/tiff") {
    const UTIF = (await import("utif")).default;
    const ifds = UTIF.decode(buf);
    if (!ifds.length) throw new Error("el TIF no tiene imagen");
    // Algunos TIF llevan una miniatura además de la imagen: la más grande.
    for (const ifd of ifds) UTIF.decodeImage(buf, ifd);
    const ifd = ifds.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    const rgba = UTIF.toRGBA8(ifd);
    const c = document.createElement("canvas");
    c.width = ifd.width; c.height = ifd.height;
    c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), ifd.width, ifd.height), 0, 0);
    lienzo = c;
  } else {
    const bmp = await createImageBitmap(new Blob([buf], { type: archivo.type }));
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    lienzo = c;
  }
  // Se reduce si es enorme: a 19 cm de ancho, 3000 px ya es más de lo que se imprime.
  const f = Math.min(1, MAX_LADO / Math.max(lienzo.width, lienzo.height));
  const out = document.createElement("canvas");
  out.width = Math.round(lienzo.width * f); out.height = Math.round(lienzo.height * f);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(lienzo, 0, 0, out.width, out.height);
  const blob = await new Promise((ok, mal) => out.toBlob(b => b ? ok(b) : mal(new Error("no se pudo convertir la imagen")), "image/jpeg", 0.92));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ancho: out.width, alto: out.height, url: URL.createObjectURL(blob) };
}

const est = {
  fondo: { position:"fixed", inset:0, background:"#0009", zIndex:9999,
           display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
  caja:  { background:"#fff", borderRadius:14, padding:"22px 24px", width:"min(980px, 100%)",
           maxHeight:"92vh", overflowY:"auto", fontFamily:"'DM Sans','Segoe UI',sans-serif",
           color:"#2c3250" },
  rotulo:{ fontSize:11, letterSpacing:2, fontWeight:700, color:"#c9a84c", marginBottom:6 },
  sel:   { background:"#fff", border:"1px solid #dde4ef", borderRadius:6, color:"#2c3250",
           padding:"4px 7px", fontSize:12, outline:"none", cursor:"pointer" },
  nota:  { fontSize:12.5, lineHeight:1.45, borderRadius:8, padding:"9px 12px", marginBottom:12 },
  oro:   { background:"linear-gradient(135deg,#c9a84c,#a07830)", border:"none", borderRadius:8,
           color:"#fff", padding:"9px 18px", fontSize:13.5, fontWeight:700, cursor:"pointer" },
  gris:  { background:"none", border:"1px solid #dde4ef", borderRadius:8, color:"#555",
           padding:"9px 16px", fontSize:13, cursor:"pointer" },
};

export function BotonHojaRx({ paciente }) {
  const [abierto, setAbierto] = useState(false);
  const [rx, setRx] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  // pieza → { x, y } en fracción de la imagen
  const [marcas, setMarcas] = useState({});
  // índices de tratamientos que NO salen (ya hechos, o que no se quieren poner)
  const [fuera, setFuera] = useState(new Set());
  const [elegida, setElegida] = useState(null);
  const [arrastrando, setArrastrando] = useState(null);
  const [idioma, setIdioma] = useState("ES");
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const marco = useRef(null);

  const tratamientos = tratamientosDe(paciente);
  const incluidos = tratamientos.filter((_, i) => !fuera.has(i));
  // Piezas que se marcan: las de los tratamientos que salen y que son piezas de verdad.
  const piezas = [...new Set(incluidos.map(t => separarPieza(nombreDe(t)).pieza)
    .filter(p => p && posicionPlantilla(p)))].sort((a, b) => a - b);
  const posDe = (p) => marcas[p] || posicionPlantilla(p);

  async function elegirArchivo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setLeyendo(true); setError(null);
    try {
      const nueva = await leerRadiografia(archivo);
      if (rx) URL.revokeObjectURL(rx.url);
      setRx(nueva);
      setMarcas({});
      setResultado(null);
    } catch (err) {
      console.error(err);
      setError("No se ha podido leer la imagen: " + (err?.message || "formato no soportado"));
    } finally { setLeyendo(false); }
  }

  const fraccion = (e) => {
    const r = marco.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const mover = (e) => {
    if (!arrastrando) return;
    setMarcas(m => ({ ...m, [arrastrando]: fraccion(e) }));
  };
  const clicImagen = (e) => {
    if (!elegida || arrastrando) return;
    setMarcas(m => ({ ...m, [elegida]: fraccion(e) }));
    setElegida(null);
  };

  async function generar() {
    if (!rx) return;
    setGenerando(true); setError(null);
    try {
      const [pdfLib, conf, logo] = await Promise.all([
        import("pdf-lib"),
        supabase.from("clinica_config").select("*").single(),
        fetch("/logo.png").then(r => r.ok ? r.arrayBuffer() : null).catch(() => null),
      ]);
      const bytes = await generarHojaRx(pdfLib, {
        imagen: rx,
        marcas: piezas.map(p => ({ pieza: p, ...posDe(p) })),
        grupos: agruparTratamientos(incluidos, traductor(idioma)),
        paciente: { nombre: paciente.name, historia: paciente.hc },
        clinica: conf.data || {},
        logo,
        idioma,
      });
      if (resultado) URL.revokeObjectURL(resultado);
      // No se abre solo: ver el comentario de generar() en BotonConsentimientos.
      setResultado(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } catch (err) {
      console.error(err);
      setError("No se ha podido generar: " + (err?.message || "error desconocido"));
    } finally { setGenerando(false); }
  }

  const cerrar = () => {
    if (rx) URL.revokeObjectURL(rx.url);
    if (resultado) URL.revokeObjectURL(resultado);
    setRx(null); setMarcas({}); setFuera(new Set()); setElegida(null);
    setResultado(null); setError(null); setIdioma("ES");
    setAbierto(false);
  };

  const alternar = (i) => {
    setFuera(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
    setResultado(null);
  };

  return (
    <>
      <button onClick={()=>setAbierto(true)}
        style={{fontSize:11, padding:"4px 10px", borderRadius:6, background:"#0e3b3e18",
          border:"1px solid #0e3b3e55", color:"#0e3b3e", fontWeight:600,
          whiteSpace:"nowrap", cursor:"pointer"}}>
        hoja rx
      </button>

      {abierto && (
        <div style={est.fondo} onClick={cerrar}>
          <div style={est.caja} onClick={e=>e.stopPropagation()} role="dialog" aria-label="Hoja de radiografía">
            <div style={est.rotulo}>HOJA DE RADIOGRAFÍA</div>
            <h2 style={{fontSize:18, margin:"0 0 12px"}}>{paciente.name}</h2>

            <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:12}}>
              <label style={{...est.gris, display:"inline-block"}}>
                {leyendo ? "Leyendo..." : rx ? "Cambiar radiografía" : "Elegir radiografía (TIF, JPG o PNG)"}
                <input type="file" accept=".tif,.tiff,image/tiff,image/jpeg,image/png"
                  onChange={elegirArchivo} style={{display:"none"}}/>
              </label>
              <span style={{fontSize:12, color:"#888"}}>
                La imagen no se sube: se queda en este navegador.
              </span>
            </div>

            {rx && (
              <>
                <div style={{fontSize:12.5, color:"#555", marginBottom:8, lineHeight:1.45}}>
                  Las marcas salen donde suele estar cada pieza. <b>Arrastrá</b> la que no haya
                  caído en su diente, o tocá una pieza de la lista y después el diente.
                  {elegida && <b style={{color:"#a07830"}}> Tocá en la radiografía dónde está la {elegida}.</b>}
                </div>
                <div ref={marco}
                  onPointerMove={mover}
                  onPointerUp={()=>setArrastrando(null)}
                  onPointerLeave={()=>setArrastrando(null)}
                  onClick={clicImagen}
                  style={{position:"relative", width:"100%", aspectRatio:`${rx.ancho} / ${rx.alto}`,
                    background:"#000", borderRadius:6, overflow:"hidden", touchAction:"none",
                    cursor: elegida ? "crosshair" : "default", userSelect:"none"}}>
                  <img src={rx.url} alt="Radiografía" draggable={false}
                    style={{position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none"}}/>
                  {piezas.map(p => {
                    const { x, y } = posDe(p);
                    const arriba = esSuperior(p);
                    return (
                      <div key={p}
                        onPointerDown={e=>{ e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); setArrastrando(p); setResultado(null); }}
                        onPointerUp={e=>{ e.stopPropagation(); setArrastrando(null); }}
                        onClick={e=>e.stopPropagation()}
                        title={`Pieza ${p}: arrastrar`}
                        style={{position:"absolute", left:`${x*100}%`, top:`${y*100}%`,
                          width:"3.9%", height:"13.2%", transform:"translate(-50%,-50%)",
                          border:"2px solid #000", outline:"2px solid #fff", borderRadius:"50%",
                          cursor: arrastrando === p ? "grabbing" : "grab",
                          boxShadow: elegida === p ? "0 0 0 4px #c9a84c" : "none"}}>
                        <span style={{position:"absolute", left:"50%", [arriba ? "bottom" : "top"]:"100%",
                          transform:`translate(-50%, ${arriba ? "-4px" : "4px"})`, background:"#000",
                          color:"#fff", borderRadius:10, fontSize:11, fontWeight:700, padding:"1px 6px",
                          border:"1px solid #fff", pointerEvents:"none"}}>{p}</span>
                      </div>
                    );
                  })}
                </div>
                {Object.keys(marcas).length > 0 && (
                  <button onClick={()=>{ setMarcas({}); setResultado(null); }}
                    style={{...est.gris, fontSize:12, padding:"5px 10px", marginTop:8}}>
                    Volver a las posiciones propuestas
                  </button>
                )}
              </>
            )}

            <div style={{border:"1px solid #dde4ef", borderRadius:8, margin:"14px 0", maxHeight:220, overflowY:"auto"}}>
              {tratamientos.length === 0 ? (
                <div style={{padding:"9px 12px", fontSize:13, color:"#888"}}>El presupuesto no tiene tratamientos.</div>
              ) : tratamientos.map((t, i) => {
                const { base, pieza } = separarPieza(nombreDe(t));
                const sale = !fuera.has(i);
                const marcable = pieza && posicionPlantilla(pieza);
                return (
                  <div key={t.id || i} style={{display:"flex", alignItems:"center", gap:8, padding:"5px 10px",
                    borderTop: i ? "1px solid #f0f2f7" : "none", background: sale ? "#f7f3e6" : "transparent",
                    fontSize:13}}>
                    <label style={{display:"flex", alignItems:"center", gap:8, flex:1, cursor:"pointer"}}>
                      <input type="checkbox" checked={sale} onChange={()=>alternar(i)}/>
                      <span>{base}</span>
                    </label>
                    {pieza && (
                      <button disabled={!sale || !marcable || !rx}
                        onClick={()=>setElegida(elegida === pieza ? null : pieza)}
                        title={marcable ? "Colocar esta pieza en la radiografía" : "No es una pieza válida"}
                        style={{fontSize:12, fontWeight:700, borderRadius:10, padding:"1px 9px",
                          border:"1px solid #2c3250", cursor: sale && marcable && rx ? "pointer" : "default",
                          background: elegida === pieza ? "#c9a84c" : "#fff", color:"#2c3250",
                          opacity: sale && marcable ? 1 : 0.4}}>
                        {pieza}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{display:"flex", alignItems:"center", gap:8, fontSize:12.5, marginBottom:12}}>
              <span style={{color:"#777"}}>Idioma de la hoja:</span>
              <select value={idioma} style={est.sel} aria-label="Idioma de la hoja"
                onChange={e=>{ setIdioma(e.target.value); setResultado(null); }}>
                {IDIOMAS_HOJAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>

            {error && <div style={{...est.nota, background:"#fbeae7", color:"#8c2d16"}} role="alert">{error}</div>}

            {resultado ? (
              <>
                <a href={resultado} target="_blank" rel="noreferrer"
                  style={{...est.oro, display:"block", textAlign:"center", textDecoration:"none", marginBottom:8}}>
                  Abrir e imprimir
                </a>
                <div style={{fontSize:11.5, color:"#888", textAlign:"center", marginBottom:12}}>
                  Se abre en otra pestaña. Imprimir en A4 a tamaño real.
                </div>
                <div style={{display:"flex", justifyContent:"flex-end"}}>
                  <button onClick={cerrar} style={est.gris}>Cerrar</button>
                </div>
              </>
            ) : (
              <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
                <button onClick={cerrar} style={est.gris}>Cancelar</button>
                <button onClick={generar} disabled={!rx || generando}
                  style={{...est.oro, opacity: (!rx || generando) ? 0.5 : 1}}>
                  {generando ? "Generando..." : "Generar hoja"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
