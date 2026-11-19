import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { generarHojaRx, nombreDoctor, tablaTonos, filasDelPresupuesto, simbolosIniciales,
  agruparFilas, medidasImagenMm, piezasDeParte, eligePiezas, barrasDe, trazosDeUnion } from "../lib/hojaRx";
import { dibujo, medidas, superior, PIEZAS_SUPERIOR, PIEZAS_INFERIOR } from "../lib/hojaRxDibujos";
import { IDIOMAS_HOJAS } from "../lib/consentimientos/hojasPaciente";
import { translateTreatment } from "../treatments";

// Botón de la ficha, junto a consentimientos: se sube la panorámica (el TIF
// que exporta Sidexis, o un JPG/PNG), la app dibuja sobre ella lo que pide el
// presupuesto (implantes, coronas, prótesis, endodoncias, pernos, exodoncias,
// letras para reconstrucciones y empastes), cada dibujo se arrastra y se
// agranda por separado, y sale un A4 con logo, radiografía y tratamientos. La
// imagen no sale del navegador: no se sube ni se guarda.
//
// utif y pdf-lib se cargan al usarlos, para no meterlos en el bundle de todas
// las fichas.

const tratamientosDe = (p) => Array.isArray(p.treatments) ? p.treatments : (p.treatments?.items || []);
const traductor = (idioma) => (idioma === "EN" || idioma === "FR")
  ? (n) => translateTreatment(n, idioma.toLowerCase()) : (n) => n;
const MAX_LADO = 3000;
const NOMBRE_TIPO = { implante: "Implante", corona: "Corona", protesis: "Prótesis", endo: "Endodoncia",
  perno: "Perno", x: "Exodoncia", letra: "Letra" };

// Archivo → lienzo con la imagen tal cual, reducida si es enorme.
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
  return out;
}

// Lienzo original + aclarar/invertir → { bytes JPEG, ancho, alto, url }.
async function procesar(original, aclarar, invertir) {
  const c = document.createElement("canvas");
  c.width = original.width; c.height = original.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(original, 0, 0);
  if (aclarar > 0 || invertir) {
    const datos = ctx.getImageData(0, 0, c.width, c.height);
    const t = tablaTonos(aclarar, invertir), d = datos.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = t[d[i]]; d[i + 1] = t[d[i + 1]]; d[i + 2] = t[d[i + 2]]; }
    ctx.putImageData(datos, 0, 0);
  }
  const blob = await new Promise((ok, mal) => c.toBlob(b => b ? ok(b) : mal(new Error("no se pudo convertir la imagen")), "image/jpeg", 0.92));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ancho: c.width, alto: c.height, url: URL.createObjectURL(blob) };
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


// Un símbolo en SVG, con las mismas rutas que el PDF: trazo ancho blanco y
// fino negro encima. `activo` lo pinta en dorado.
function Simbolo({ s, x, y, escala, activo }) {
  const dib = dibujo(s, x, y, escala, s.giro);
  const color = activo ? "#c9a84c" : "#000";
  return (
    <>
      {dib.trazos.map((t, k) => {
        const fino = t.fino ?? (s.tipo === "x" ? 0.38 : 0.28);
        return (
          <g key={k}>
            <path d={t.d} fill="none" stroke="#fff" strokeWidth={fino + 0.47} strokeLinecap="round"/>
            <path d={t.d} fill={t.relleno ? color : "none"} stroke={color} strokeWidth={fino} strokeLinecap="round"/>
          </g>
        );
      })}
      {dib.texto && (
        <text x={dib.texto.x} y={dib.texto.y} fontSize={dib.texto.tam * 1.15} fontWeight="700"
          fontFamily="Helvetica, Arial, sans-serif" textAnchor="middle" dominantBaseline="central"
          fill={color} stroke="#fff" strokeWidth={0.5} paintOrder="stroke">{dib.texto.letra}</text>
      )}
    </>
  );
}

export function BotonHojaRx({ paciente }) {
  const [abierto, setAbierto] = useState(false);
  const [rx, setRx] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  // id de símbolo → { x?, y?, escala? } lo que se ha movido o agrandado a mano
  const [ajustes, setAjustes] = useState({});
  // fila → piezas elegidas a mano (prótesis que vienen sin pieza)
  const [elegidas, setElegidas] = useState({});
  const [eligiendoPiezas, setEligiendoPiezas] = useState(null);
  const [escalaGlobal, setEscalaGlobal] = useState(1);
  // filas del presupuesto que NO salen (ya hechas, o que no se quieren poner)
  const [fuera, setFuera] = useState(new Set());
  const [seleccion, setSeleccion] = useState(null);
  const [colocando, setColocando] = useState(null);
  const arrastre = useRef(null);
  const [arrastrando, setArrastrando] = useState(null);
  const [idioma, setIdioma] = useState("ES");
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const marco = useRef(null);
  const [original, setOriginal] = useState(null);
  const [aclarar, setAclarar] = useState(0.35);
  const [invertir, setInvertir] = useState(false);
  const [doctores, setDoctores] = useState([]);
  const [doctorId, setDoctorId] = useState("");

  // Los doctores, al abrir. Sale puesto el que firmó el presupuesto, por su
  // nº de colegiado, como en los consentimientos.
  useEffect(() => {
    if (!abierto) return;
    (async () => {
      const { data } = await supabase.from("doctors").select("id, name, colegiado, tratamiento")
        .eq("activo", true).order("name");
      const docs = data || [];
      setDoctores(docs);
      const delPresu = docs.find(d => d.colegiado && d.colegiado === paciente.doctor_colegiado);
      setDoctorId(delPresu?.id || "");
    })();
  }, [abierto, paciente.doctor_colegiado]);

  const filas = filasDelPresupuesto(tratamientosDe(paciente));
  const incluidas = filas.filter(f => !fuera.has(f.i));
  const simbolos = simbolosIniciales(incluidas, elegidas).map(s => ({ ...s, ...ajustes[s.id] }));
  const mm = rx ? medidasImagenMm(rx.ancho, rx.alto) : { w: 186, h: 98 };
  const barras = barrasDe(incluidas, simbolos);
  const sel = simbolos.find(s => s.id === seleccion);
  const cambia = () => setResultado(null);

  // Cada cambio de aclarar/invertir rehace la imagen, con un respiro para no
  // repetirlo en cada paso del deslizador.
  useEffect(() => {
    if (!original) return;
    let vale = true;
    const t = setTimeout(async () => {
      try {
        const nueva = await procesar(original, aclarar, invertir);
        if (!vale) { URL.revokeObjectURL(nueva.url); return; }
        setRx(prev => { if (prev) URL.revokeObjectURL(prev.url); return nueva; });
        setResultado(null);
      } catch (err) {
        console.error(err);
        setError("No se ha podido preparar la imagen: " + (err?.message || "error desconocido"));
      }
    }, 120);
    return () => { vale = false; clearTimeout(t); };
  }, [original, aclarar, invertir]);

  async function elegirArchivo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setLeyendo(true); setError(null);
    try {
      setOriginal(await leerRadiografia(archivo));
      setAjustes({});
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
  const ajustar = (id, cambio) => { setAjustes(a => ({ ...a, [id]: { ...a[id], ...cambio } })); cambia(); };

  // Arrastre: se guarda dónde se agarró el símbolo para que no salte al
  // puntero.
  const empezar = (e, s) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const f = fraccion(e);
    arrastre.current = { id: s.id, dx: f.x - s.x, dy: f.y - s.y };
    setArrastrando(s.id);
    setSeleccion(s.id);
    setColocando(null);
  };
  const mover = (e) => {
    const a = arrastre.current;
    if (!a) return;
    const f = fraccion(e);
    ajustar(a.id, { x: Math.min(1, Math.max(0, f.x - a.dx)), y: Math.min(1, Math.max(0, f.y - a.dy)) });
  };
  const soltar = () => { arrastre.current = null; setArrastrando(null); };
  const clicImagen = (e) => {
    if (colocando) { ajustar(colocando, fraccion(e)); setSeleccion(colocando); setColocando(null); }
    else setSeleccion(null);
  };

  const alternarFila = (i) => {
    setFuera(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
    cambia();
  };
  // Se parte de las piezas que tiene ahora la parte (las de por defecto, si
  // no se tocó), así una arcada de 12 se corrige quitando o poniendo una.
  const alternarPieza = (f, p, pieza) => {
    const k = `${f.i}:${p.k}`;
    setElegidas(prev => {
      const actual = piezasDeParte(f, p, prev);
      const nuevas = actual.includes(pieza) ? actual.filter(x => x !== pieza) : [...actual, pieza];
      return { ...prev, [k]: nuevas.sort((a, b) => a - b) };
    });
    cambia();
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
        simbolos,
        barras,
        escalaGlobal,
        grupos: agruparFilas(incluidas, elegidas, traductor(idioma)),
        paciente: { nombre: paciente.name, historia: paciente.hc },
        clinica: conf.data || {},
        logo,
        idioma,
        doctor: nombreDoctor(doctores.find(d => d.id === doctorId)),
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
    setRx(null); setOriginal(null); setAjustes({}); setElegidas({}); setFuera(new Set());
    setSeleccion(null); setColocando(null); setEligiendoPiezas(null);
    setResultado(null); setError(null); setIdioma("ES");
    setAbierto(false);
  };

  // Uniones de las prótesis y barras entre implantes, igual que en el PDF.
  const uniones = trazosDeUnion(simbolos, barras, mm, escalaGlobal);

  const chip = (activo, apagado) => ({
    fontSize:11.5, fontWeight:700, borderRadius:10, padding:"1px 8px", border:"1px solid #2c3250",
    background: activo ? "#c9a84c" : "#fff", color:"#2c3250", cursor: apagado ? "default" : "pointer",
    opacity: apagado ? 0.4 : 1,
  });

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
                  Cada dibujo sale donde suele estar esa pieza. <b>Arrastrá</b> el que no haya caído
                  en su sitio; tocándolo se puede cambiar su tamaño y girarlo.
                  {colocando && <b style={{color:"#a07830"}}> Tocá en la radiografía dónde va.</b>}
                </div>
                <div ref={marco} onClick={clicImagen}
                  style={{position:"relative", width:"100%", aspectRatio:`${rx.ancho} / ${rx.alto}`,
                    background:"#000", borderRadius:6, overflow:"hidden", touchAction:"none",
                    cursor: colocando ? "crosshair" : "default", userSelect:"none"}}>
                  <img src={rx.url} alt="Radiografía" draggable={false}
                    style={{position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none"}}/>
                  <svg viewBox={`0 0 ${mm.w} ${mm.h}`} preserveAspectRatio="none"
                    onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
                    style={{position:"absolute", inset:0, width:"100%", height:"100%"}}>
                    {uniones.map((d, k) => (
                      <g key={k} pointerEvents="none">
                        <path d={d.d} fill="none" stroke="#fff" strokeWidth={d.fino + 0.47} strokeLinecap="round"/>
                        <path d={d.d} fill="none" stroke="#000" strokeWidth={d.fino} strokeLinecap="round"/>
                      </g>
                    ))}
                    {simbolos.map(s => {
                      const x = s.x * mm.w, y = s.y * mm.h, e = (s.escala || 1) * escalaGlobal;
                      const { w, h } = medidas(s, e);
                      const activo = s.id === seleccion || s.id === colocando;
                      return (
                        <g key={s.id} onPointerDown={ev=>empezar(ev, s)} onClick={ev=>ev.stopPropagation()}
                          style={{cursor: arrastrando === s.id ? "grabbing" : "grab"}}>
                          <rect x={x - w / 2 - 1} y={y - h / 2 - 1} width={w + 2} height={h + 2}
                            fill="transparent" stroke={activo ? "#c9a84c" : "none"} strokeWidth={0.25}
                            strokeDasharray="0.8 0.6"/>
                          <Simbolo s={s} x={x} y={y} escala={e} activo={activo}/>
                          <text x={x + w / 2 + 0.6} y={superior(s.pieza) ? y - h / 2 : y + h / 2}
                            fontSize={2.4} fill="#fff" stroke="#000" strokeWidth={0.35} paintOrder="stroke"
                            fontFamily="Helvetica, Arial, sans-serif" fontWeight="700"
                            dominantBaseline="central" pointerEvents="none">{s.pieza}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div style={{display:"flex", alignItems:"center", gap:14, flexWrap:"wrap", marginTop:8, fontSize:12.5}}>
                  <label style={{display:"flex", alignItems:"center", gap:8}}>
                    <span style={{color:"#777"}}>Aclarar</span>
                    <input type="range" min="0" max="1" step="0.05" value={aclarar}
                      onChange={e=>setAclarar(Number(e.target.value))} style={{width:130}}/>
                    <span style={{width:34, color:"#555"}}>{Math.round(aclarar * 100)}%</span>
                  </label>
                  <label style={{display:"flex", alignItems:"center", gap:6, cursor:"pointer"}}>
                    <input type="checkbox" checked={invertir} onChange={()=>setInvertir(!invertir)}/>
                    Invertir
                  </label>
                  <label style={{display:"flex", alignItems:"center", gap:8}}>
                    <span style={{color:"#777"}}>Tamaño de los dibujos</span>
                    <input type="range" min="0.5" max="2" step="0.05" value={escalaGlobal}
                      onChange={e=>{ setEscalaGlobal(Number(e.target.value)); cambia(); }} style={{width:130}}/>
                    <span style={{width:40, color:"#555"}}>{Math.round(escalaGlobal * 100)}%</span>
                  </label>
                  {Object.keys(ajustes).length > 0 && (
                    <button onClick={()=>{ setAjustes({}); setSeleccion(null); cambia(); }}
                      style={{...est.gris, fontSize:12, padding:"5px 10px", marginLeft:"auto"}}>
                      Volver a las posiciones propuestas
                    </button>
                  )}
                </div>

                {sel && (
                  <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginTop:8,
                    padding:"7px 10px", background:"#f7f3e6", borderRadius:8, fontSize:12.5}}>
                    <b>{NOMBRE_TIPO[sel.tipo]}{sel.tipo === "letra" ? ` ${sel.letra}` : ""} · {sel.pieza}</b>
                    <span style={{color:"#777", marginLeft:8}}>Tamaño</span>
                    <button style={{...est.gris, padding:"2px 10px"}}
                      onClick={()=>ajustar(sel.id, { escala: Math.max(0.3, (sel.escala || 1) - 0.1) })}>–</button>
                    <span style={{width:40, textAlign:"center"}}>{Math.round((sel.escala || 1) * 100)}%</span>
                    <button style={{...est.gris, padding:"2px 10px"}}
                      onClick={()=>ajustar(sel.id, { escala: Math.min(3, (sel.escala || 1) + 0.1) })}>+</button>
                    {sel.tipo !== "letra" && (
                      <>
                        <span style={{color:"#777", marginLeft:8}}>Girar</span>
                        <button style={{...est.gris, padding:"2px 9px"}} title="Girar a la izquierda"
                          onClick={()=>ajustar(sel.id, { giro: Math.max(-90, (sel.giro || 0) - 5) })}>⟲</button>
                        <input type="range" min="-90" max="90" step="1" value={sel.giro || 0} aria-label="Giro"
                          onChange={e=>ajustar(sel.id, { giro: Number(e.target.value) })} style={{width:110}}/>
                        <button style={{...est.gris, padding:"2px 9px"}} title="Girar a la derecha"
                          onClick={()=>ajustar(sel.id, { giro: Math.min(90, (sel.giro || 0) + 5) })}>⟳</button>
                        <span style={{width:34, textAlign:"center"}}>{Math.round(sel.giro || 0)}°</span>
                      </>
                    )}
                    {ajustes[sel.id] && (
                      <button style={{...est.gris, padding:"2px 10px", fontSize:12}}
                        onClick={()=>{ setAjustes(a => { const n = { ...a }; delete n[sel.id]; return n; }); cambia(); }}>
                        Restablecer
                      </button>
                    )}
                    <button style={{...est.gris, padding:"2px 10px", fontSize:12, marginLeft:"auto"}}
                      onClick={()=>setSeleccion(null)}>Listo</button>
                  </div>
                )}
              </>
            )}

            <div style={{border:"1px solid #dde4ef", borderRadius:8, margin:"14px 0", maxHeight:260, overflowY:"auto"}}>
              {filas.length === 0 ? (
                <div style={{padding:"9px 12px", fontSize:13, color:"#888"}}>El presupuesto no tiene tratamientos.</div>
              ) : filas.map((f, k) => {
                const sale = !fuera.has(f.i);
                // Los controles de una parte: sus piezas (para colocarlas en la
                // radiografía) y, si no vienen en el nombre, el botón para elegirlas.
                const controles = (p) => {
                  if (!p.simbolo) return null;
                  const clave = `${f.i}:${p.k}`;
                  const piezas = p.simbolo.tipo === "barra" ? [] : piezasDeParte(f, p, elegidas);
                  return (
                    <>
                      {p.simbolo.tipo === "barra" && (
                        <span style={{fontSize:11.5, color:"#888"}}>une los implantes de su arcada</span>
                      )}
                      {piezas.map(x => {
                        const id = `${clave}:${x}`;
                        return (
                          <button key={x} disabled={!sale || !rx} title="Colocar en la radiografía"
                            onClick={()=>{ setColocando(colocando === id ? null : id); setSeleccion(id); }}
                            style={chip(colocando === id || seleccion === id, !sale || !rx)}>{x}</button>
                        );
                      })}
                      {eligePiezas(f, p) && (
                        <button disabled={!sale} onClick={()=>setEligiendoPiezas(eligiendoPiezas === clave ? null : clave)}
                          style={{...est.gris, padding:"2px 9px", fontSize:11.5, opacity: sale ? 1 : 0.4}}>
                          {eligiendoPiezas === clave ? "Listo" : piezas.length ? "Cambiar piezas" : "Elegir piezas"}
                        </button>
                      )}
                    </>
                  );
                };
                const selector = (p) => {
                  if (eligiendoPiezas !== `${f.i}:${p.k}` || !sale) return null;
                  const piezas = piezasDeParte(f, p, elegidas);
                  const arcadas = p.arcada === "superior" ? [PIEZAS_SUPERIOR]
                    : p.arcada === "inferior" ? [PIEZAS_INFERIOR] : [PIEZAS_SUPERIOR, PIEZAS_INFERIOR];
                  return (
                    <div style={{padding:"2px 10px 8px 34px"}}>
                      {arcadas.map((fila, a) => (
                        <div key={a} style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:4}}>
                          {fila.map((x, j) => (
                            <button key={x} onClick={()=>alternarPieza(f, p, x)}
                              style={{...chip(piezas.includes(x), false), marginLeft: j === 8 ? 10 : 0}}>{x}</button>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                };
                return (
                  <div key={f.i} style={{borderTop: k ? "1px solid #f0f2f7" : "none",
                    background: sale ? "#f7f3e6" : "transparent"}}>
                    <div style={{display:"flex", alignItems:"center", gap:6, padding:"5px 10px", fontSize:13, flexWrap:"wrap"}}>
                      <label style={{display:"flex", alignItems:"center", gap:8, flex:1, minWidth:200, cursor:"pointer"}}>
                        <input type="checkbox" checked={sale} onChange={()=>alternarFila(f.i)}/>
                        <span>{f.base}</span>
                        {f.pack && <span style={{fontSize:11, color:"#888"}}>· pack</span>}
                      </label>
                      {!f.pack && controles(f.partes[0])}
                    </div>
                    {!f.pack && selector(f.partes[0])}
                    {f.pack && f.partes.map(p => (
                      <div key={p.k}>
                        <div style={{display:"flex", alignItems:"center", gap:6, padding:"3px 10px 3px 34px",
                          fontSize:12.5, flexWrap:"wrap", opacity: sale ? 1 : 0.5}}>
                          <span style={{flex:1, minWidth:180, color:"#555"}}>↳ {p.nombre}</span>
                          {controles(p)}
                        </div>
                        {selector(p)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div style={{display:"flex", alignItems:"center", gap:8, fontSize:12.5, marginBottom:12, flexWrap:"wrap"}}>
              <span style={{color:"#777"}}>Doctor:</span>
              <select value={doctorId} style={est.sel} aria-label="Doctor"
                onChange={e=>{ setDoctorId(e.target.value); cambia(); }}>
                <option value="">Sin doctor</option>
                {doctores.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <span style={{color:"#777", marginLeft:10}}>Idioma de la hoja:</span>
              <select value={idioma} style={est.sel} aria-label="Idioma de la hoja"
                onChange={e=>{ setIdioma(e.target.value); cambia(); }}>
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
