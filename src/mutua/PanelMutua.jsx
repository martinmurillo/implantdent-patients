// Sección de pacientes de mutua (Agrupació · Tomamos Impulso).
//
// Ruta propia /mutua, y no una pestaña de la aplicación principal, porque esa
// es solo del dueño y aquí entran los dos. El guard de pantalla decide qué se
// enseña; quien de verdad corta el acceso a los datos es la RLS.

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabase";
import {
  calcularEstadoPiezas, liberadasEnElMes, ultimoDiaDelMes, ETIQUETAS,
} from "./reglas.js";
import {
  normalizarFilas, resumenImportacion, avisoDeRetroceso,
  normalizarNombre, normalizarDni, claveDePaciente, HOJA_EXCEL,
} from "./importar.js";
import {
  cargarMutua, historialDe, apuntesDe, guardarApunte, borrarApunte,
  altaPacienteManual, importarPrestaciones,
} from "./datos.js";
import { addMeses } from "../planCalc.js";

const FUENTE = "'DM Sans','Segoe UI',sans-serif";
const ORO = "#c9a84c", TINTA = "#2c3250", FONDO = "#f0f2f7", BORDE = "#e2e5ed";

const COLOR = {
  disponible:      { fondo: "#eafaf1", borde: "#2ecc71", texto: "#1e8449" },
  con_historial:   { fondo: "#f4fbf7", borde: "#a9dfbf", texto: "#48856a" },
  prevista:        { fondo: "#eaf4fc", borde: "#3498db", texto: "#21618c" },
  bloqueada:       { fondo: "#fdedec", borde: "#e74c3c", texto: "#b03a2e" },
  perdida:         { fondo: "#f4f4f4", borde: "#ccc",    texto: "#999" },
  fuera_de_sector: { fondo: "#fafafa", borde: "#eee",    texto: "#c8c8c8" },
};

const hoyMadrid = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const fmtF = (iso) => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
const mesesEntre = (desde, hasta) => {
  if (!desde) return null;
  const [ay, am] = desde.split("-").map(Number), [by, bm] = hasta.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};
// Con las dos fechas ya en texto, para no llamar a un reloj mientras se pinta.
const diasEntre = (desde, hasta) => Math.round(
  (Date.parse(hasta + "T00:00:00Z") - Date.parse(desde + "T00:00:00Z")) / 86400000);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// ── Piezas en disposición FDI ────────────────────────────────────────────────
const fdi = (piezas, cuadranteArriba) => piezas.filter(p => {
  const q = Math.floor(p / 10);
  return cuadranteArriba ? (q === 1 || q === 2 || q === 5 || q === 6)
                         : (q === 3 || q === 4 || q === 7 || q === 8);
});
const ordenFila = (piezas, izquierda) => {
  const izq = piezas.filter(p => [1, 4, 5, 8].includes(Math.floor(p / 10)));
  const der = piezas.filter(p => [2, 3, 6, 7].includes(Math.floor(p / 10)));
  return izquierda ? [...izq].sort((a, b) => b - a) : [...der].sort((a, b) => a - b);
};

function Odontograma({ estado, titulo, hoy }) {
  const porPieza = new Map(estado.piezas.map(p => [p.pieza, p]));
  const universo = estado.piezas.map(p => p.pieza);
  const permanentes = universo.filter(p => p < 51);
  const temporales = universo.filter(p => p >= 51);

  const Celda = ({ pieza }) => {
    const p = porPieza.get(pieza);
    if (!p) return <div style={{ width: 30 }} />;
    const c = COLOR[p.estado] || COLOR.disponible;
    const detalle = [
      p.ultimaFecha ? `Hecha el ${fmtF(p.ultimaFecha)}` : null,
      p.ultimaFecha ? `hace ${mesesEntre(p.ultimaFecha, hoy)} meses` : null,
      p.codigo ? `código ${p.codigo}` : null,
      p.estado === "bloqueada" ? `libre el ${fmtF(p.fechaLiberacion)}` : null,
      p.estado === "perdida" ? `pieza perdida el ${fmtF(p.fechaPerdida)}` : null,
      p.previsto ? `previsto ${p.previsto.fecha_prevista ? "el " + fmtF(p.previsto.fecha_prevista) : ""}` : null,
      !p.enUniverso ? "fuera del sector: no cuenta" : null,
    ].filter(Boolean).join(" · ");
    return (
      <div title={detalle || "Sin historial en la mutua"}
        style={{
          width: 30, height: 34, borderRadius: 5, border: `1.5px solid ${c.borde}`,
          background: c.fondo, color: c.texto, fontSize: 11, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: p.estado === "perdida" ? "line-through" : "none",
          cursor: "default", position: "relative",
        }}>
        {pieza}
        {p.previsto && p.estado !== "prevista" && (
          <span style={{ position: "absolute", top: -3, right: -3, width: 7, height: 7,
            borderRadius: "50%", background: COLOR.prevista.borde }} />
        )}
      </div>
    );
  };

  const Arcada = ({ piezas }) => (
    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 4 }}>
      <div style={{ display: "flex", gap: 3 }}>
        {ordenFila(piezas, true).map(p => <Celda key={p} pieza={p} />)}
      </div>
      <div style={{ width: 1, background: BORDE }} />
      <div style={{ display: "flex", gap: 3 }}>
        {ordenFila(piezas, false).map(p => <Celda key={p} pieza={p} />)}
      </div>
    </div>
  );

  const bloque = (piezas, etiqueta) => piezas.length === 0 ? null : (
    <div style={{ marginBottom: 10 }}>
      {etiqueta && <div style={{ fontSize: 9, letterSpacing: 2, color: "#999",
        fontWeight: 700, textAlign: "center", marginBottom: 5 }}>{etiqueta}</div>}
      <Arcada piezas={fdi(piezas, true)} />
      <Arcada piezas={fdi(piezas, false)} />
    </div>
  );

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDE}`, borderRadius: 10, padding: "12px 10px" }}>
      <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 700, color: "#666",
        textTransform: "uppercase", textAlign: "center", marginBottom: 10 }}>{titulo}</div>
      {bloque(permanentes, temporales.length ? "Permanentes" : null)}
      {bloque(temporales, "Temporales")}
    </div>
  );
}

// ── Resumen en texto de lo que se puede hacer ────────────────────────────────
function PorHacer({ estado }) {
  const etiqueta = ETIQUETAS[estado.familia];
  const porFecha = new Map();
  for (const b of estado.bloqueadas) {
    if (!porFecha.has(b.fechaLiberacion)) porFecha.set(b.fechaLiberacion, []);
    porFecha.get(b.fechaLiberacion).push(b.pieza);
  }
  const lineas = [...porFecha.entries()].sort()
    .map(([fecha, piezas]) => `${piezas.join(", ")} hasta ${fmtF(fecha)}`);

  return (
    <div style={{ marginBottom: 8, fontSize: 13, lineHeight: 1.6 }}>
      <b style={{ color: TINTA }}>{etiqueta}: {estado.disponibles.length} de {estado.total} piezas disponibles.</b>
      {lineas.length > 0 && (
        <span style={{ color: COLOR.bloqueada.texto }}> Bloqueadas: {lineas.join("; ")}.</span>
      )}
      {estado.previstas.length > 0 && (
        <span style={{ color: COLOR.prevista.texto }}> Ya previstas: {estado.previstas.map(p => p.pieza).join(", ")}.</span>
      )}
      {estado.perdidas.length > 0 && (
        <span style={{ color: "#999" }}> Perdidas: {estado.perdidas.map(p => p.pieza).join(", ")}.</span>
      )}
      {lineas.length === 0 && estado.perdidas.length === 0 && estado.previstas.length === 0 && (
        <span style={{ color: COLOR.disponible.texto }}> Todas disponibles.</span>
      )}
    </div>
  );
}

// ── Ficha de un paciente ─────────────────────────────────────────────────────
// Se monta con key={paciente_key}: al cambiar de paciente React la recrea
// entera y el estado arranca limpio solo. Reiniciarlo a mano desde un efecto
// pintaba una vez la ficha nueva con los datos del paciente anterior.
function Ficha({ paciente, ultimas, perdidas, previstos, onCambio, email, hoy }) {
  const [historial, setHistorial] = useState(null);
  const [apuntes, setApuntes] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");
  const R = hoy;
  const clave = paciente.paciente_key;

  const recargarApuntes = () => apuntesDe(clave).then(setApuntes).catch(() => {});
  useEffect(() => {
    let vivo = true;
    historialDe(clave).then(h => vivo && setHistorial(h)).catch(() => vivo && setHistorial([]));
    apuntesDe(clave).then(a => vivo && setApuntes(a)).catch(() => {});
    return () => { vivo = false; };
  }, [clave]);

  const estados = useMemo(() => {
    const mios = (lista) => lista.filter(x => x.paciente_key === clave);
    const comun = {
      ultimas: mios(ultimas), perdidas: mios(perdidas), previstos: mios(previstos),
      ultimaTemporal: paciente.ultima_temporal, R,
    };
    return {
      OBTURACION: calcularEstadoPiezas({ familia: "OBTURACION", ...comun }),
      ANGULOS: calcularEstadoPiezas({ familia: "ANGULOS", ...comun }),
    };
  }, [clave, paciente.ultima_temporal, ultimas, perdidas, previstos, R]);

  const sinPieza = (historial || []).filter(h => h.pieza == null);
  const devueltas = (historial || []).filter(h => h.devuelto);

  const anotar = async () => {
    if (!form.pieza) { setMsg("Falta la pieza"); return; }
    if (form.estado === "hecho" && !form.fecha) { setMsg("Lo hecho necesita fecha"); return; }
    try {
      await guardarApunte({
        paciente_key: paciente.paciente_key, familia: form.familia,
        pieza: Number(form.pieza), estado: form.estado,
        fecha: form.fecha || null, nota: form.nota || null, creado_por: email,
      });
      setForm(null); setMsg("");
      await recargarApuntes();
      await onCambio();
    } catch (e) { setMsg(e.message || "No se pudo guardar"); }
  };

  const quitar = async (id) => {
    try { await borrarApunte(id); await recargarApuntes(); await onCambio(); }
    catch (e) { setMsg(e.message || "No se pudo borrar"); }
  };

  return (
    <div>
      <div style={{ background: "#fff", border: `1px solid ${BORDE}`, borderRadius: 10,
        padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: TINTA }}>{paciente.nombre}</div>
        <div style={{ fontSize: 12, color: "#777", marginTop: 3 }}>
          {paciente.dni || "Sin DNI"}
          {" · última visita "}{fmtF(paciente.ultima_visita)}
          {paciente.solo_manual && <span style={{ color: COLOR.prevista.texto }}> · alta manual, todavía no está en el portal</span>}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BORDE}`, borderRadius: 10,
        padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 700, color: ORO, marginBottom: 8 }}>
          POR HACER HOY
        </div>
        <PorHacer estado={estados.OBTURACION} />
        <PorHacer estado={estados.ANGULOS} />
        {(sinPieza.length > 0 || devueltas.length > 0) && (
          <div style={{ fontSize: 12, color: "#b3600f", marginTop: 8, lineHeight: 1.6 }}>
            {sinPieza.length > 0 && <div>⚠ {sinPieza.length} prestación(es) sin pieza en el archivo: no entran en el cálculo.</div>}
            {devueltas.length > 0 && <div>⚠ {devueltas.length} prestación(es) devuelta(s) por la mutua: no bloquean.</div>}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Odontograma estado={estados.OBTURACION} titulo="Obturación" hoy={hoy} />
        <Odontograma estado={estados.ANGULOS} titulo="Reconstrucción de ángulos" hoy={hoy} />
      </div>

      {/* ── Apuntes de la clínica ─────────────────────────────────────── */}
      <div style={{ background: "#fff", border: `1px solid ${BORDE}`, borderRadius: 10,
        padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 700, color: ORO }}>
            APUNTES DE LA CLÍNICA
          </div>
          <div style={{ flex: 1 }} />
          {!form && (
            <button onClick={() => setForm({ familia: "OBTURACION", pieza: "", estado: "hecho", fecha: hoyMadrid(), nota: "" })}
              style={btnOro}>+ Anotar</button>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
          Lo que se hizo o se va a hacer y todavía no está en el export del portal.
          Lo hecho bloquea la pieza 6 meses; lo previsto no bloquea, solo la saca de por hacer.
        </div>

        {form && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end",
            borderTop: `1px solid ${BORDE}`, paddingTop: 10, marginBottom: 10 }}>
            <Campo label="Tratamiento">
              <select value={form.familia} onChange={e => setForm({ ...form, familia: e.target.value })} style={input}>
                <option value="OBTURACION">Obturación</option>
                <option value="ANGULOS">Reconstrucción de ángulos</option>
                <option value="PERDIDA">Extracción o implante</option>
              </select>
            </Campo>
            <Campo label="Pieza">
              <input type="number" value={form.pieza} placeholder="16"
                onChange={e => setForm({ ...form, pieza: e.target.value })} style={{ ...input, width: 70 }} />
            </Campo>
            <Campo label="Estado">
              <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} style={input}>
                <option value="hecho">Ya hecho</option>
                <option value="previsto">Previsto</option>
              </select>
            </Campo>
            <Campo label={form.estado === "hecho" ? "Fecha" : "Fecha prevista"}>
              <input type="date" value={form.fecha || ""}
                onChange={e => setForm({ ...form, fecha: e.target.value })} style={input} />
            </Campo>
            <Campo label="Nota">
              <input type="text" value={form.nota} placeholder="opcional"
                onChange={e => setForm({ ...form, nota: e.target.value })} style={{ ...input, width: 180 }} />
            </Campo>
            <button onClick={anotar} style={btnOro}>Guardar</button>
            <button onClick={() => { setForm(null); setMsg(""); }} style={btnGris}>Cancelar</button>
          </div>
        )}
        {msg && <div style={{ color: "#e74c3c", fontSize: 12, marginBottom: 8 }}>{msg}</div>}

        {apuntes.length === 0
          ? <div style={{ fontSize: 12, color: "#aaa" }}>Sin apuntes.</div>
          : apuntes.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13,
              padding: "6px 0", borderBottom: `1px solid ${FONDO}` }}>
              <span style={{ fontWeight: 700, color: TINTA, width: 34 }}>{a.pieza}</span>
              <span style={{ color: "#555", flex: 1 }}>
                {ETIQUETAS[a.familia] || "Extracción o implante"}
                {" · "}
                <span style={{ color: a.estado === "hecho" ? COLOR.disponible.texto : COLOR.prevista.texto, fontWeight: 700 }}>
                  {a.estado === "hecho" ? "hecho" : "previsto"}
                </span>
                {a.fecha ? ` · ${fmtF(a.fecha)}` : ""}
                {a.nota ? ` · ${a.nota}` : ""}
              </span>
              <button onClick={() => quitar(a.id)} title="Borrar apunte" style={btnBorrar}>×</button>
            </div>
          ))}
      </div>

      {/* ── Historial completo ────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: `1px solid ${BORDE}`, borderRadius: 10, padding: "12px 16px" }}>
        <div onClick={() => setVerHistorial(v => !v)}
          style={{ cursor: "pointer", fontSize: 10, letterSpacing: 2, fontWeight: 700, color: ORO }}>
          {verHistorial ? "▲" : "▼"} HISTORIAL COMPLETO EN LA MUTUA
          {historial && <span style={{ color: "#aaa", fontWeight: 400, letterSpacing: 0 }}> · {historial.length} prestaciones</span>}
        </div>
        {verHistorial && (
          historial === null ? <div style={{ fontSize: 12, color: "#aaa", marginTop: 10 }}>Cargando…</div> :
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>{["Realización", "Código", "Tratamiento", "Pieza", "Facturado", ""].map(h => (
                  <th key={h} style={th}>{h}</th>))}</tr>
              </thead>
              <tbody>
                {historial.map(h => (
                  <tr key={h.id}>
                    <td style={td}>{fmtF(h.fecha_realizacion)}</td>
                    <td style={td}>{h.codigo}</td>
                    <td style={td}>{h.tratamiento}</td>
                    <td style={{ ...td, textAlign: "center" }}>{h.pieza ?? "—"}</td>
                    <td style={td}>{fmtF(h.facturado)}</td>
                    <td style={td}>{h.devuelto && (
                      <span style={{ background: COLOR.bloqueada.fondo, color: COLOR.bloqueada.texto,
                        border: `1px solid ${COLOR.bloqueada.borde}`, borderRadius: 4,
                        padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>Devuelto</span>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pestaña: por hacer del mes ───────────────────────────────────────────────
function PorHacerDelMes({ pacientes, ultimas, perdidas, previstos, busca, onAbrir, hoy }) {
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoy.slice(5, 7)));
  const [antiguedad, setAntiguedad] = useState(24);
  const [tratamiento, setTratamiento] = useState("AMBOS");

  const R = ultimoDiaDelMes(anio, mes);
  const filas = useMemo(() => {
    const porPaciente = (lista) => {
      const m = new Map();
      for (const x of lista) {
        if (!m.has(x.paciente_key)) m.set(x.paciente_key, []);
        m.get(x.paciente_key).push(x);
      }
      return m;
    };
    const mU = porPaciente(ultimas), mP = porPaciente(perdidas), mV = porPaciente(previstos);
    const corte = antiguedad ? addMeses(hoy, -antiguedad) : "0000-00-00";
    const q = normalizarNombre(busca);
    const familias = tratamiento === "AMBOS" ? ["OBTURACION", "ANGULOS"] : [tratamiento];

    const out = [];
    for (const p of pacientes) {
      if (p.ultima_visita && p.ultima_visita < corte) continue;
      if (q && !p.nombre.includes(q) && !(p.paciente_key || "").toUpperCase().includes(q)) continue;
      const comun = {
        ultimas: mU.get(p.paciente_key) || [], perdidas: mP.get(p.paciente_key) || [],
        previstos: mV.get(p.paciente_key) || [], ultimaTemporal: p.ultima_temporal, R,
      };
      const e = {};
      for (const f of familias) e[f] = calcularEstadoPiezas({ familia: f, ...comun });
      const disponibles = familias.reduce((a, f) => a + e[f].disponibles.length, 0);
      if (disponibles === 0) continue;
      const libera = familias.flatMap(f => liberadasEnElMes(e[f], anio, mes).map(x => ({ ...x, familia: f })));
      const bloqueadas = familias.reduce((a, f) => a + e[f].bloqueadas.length, 0);
      out.push({ p, e, familias, disponibles, libera, bloqueadas });
    }
    return out;
  }, [pacientes, ultimas, perdidas, previstos, anio, mes, antiguedad, tratamiento, busca, hoy, R]);

  const conLiberacion = filas.filter(f => f.libera.length > 0)
    .sort((a, b) => (b.p.ultima_visita || "").localeCompare(a.p.ultima_visita || ""));
  const resto = filas.filter(f => f.libera.length === 0)
    .sort((a, b) => (b.p.ultima_visita || "").localeCompare(a.p.ultima_visita || ""));

  const kpi = (n, etiqueta, color) => (
    <div style={{ background: "#fff", border: `1px solid ${BORDE}`, borderTop: `3px solid ${color}`,
      borderRadius: 8, padding: "12px 16px", minWidth: 130 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 10, color: "#777", marginTop: 5, letterSpacing: 1, textTransform: "uppercase" }}>{etiqueta}</div>
    </div>
  );

  const Fila = ({ f }) => (
    <div onClick={() => onAbrir(f.p)}
      style={{ background: "#fff", border: `1px solid ${BORDE}`, borderRadius: 8,
        padding: "10px 14px", marginBottom: 6, cursor: "pointer", display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr 110px", gap: 12, alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 700, color: TINTA, fontSize: 14 }}>{f.p.nombre}</div>
        <div style={{ fontSize: 11, color: "#999" }}>
          {f.p.dni || "Sin DNI"}
          {f.e.OBTURACION?.incluyeTemporales && <span style={{ color: ORO }}> · + temporales</span>}
        </div>
      </div>
      {["OBTURACION", "ANGULOS"].map(fam => {
        const e = f.e[fam];
        if (!e) return <div key={fam} style={{ color: "#ccc", fontSize: 12 }}>—</div>;
        const lib = f.libera.filter(x => x.familia === fam);
        const bl = e.bloqueadas.map(b => b.pieza);
        return (
          <div key={fam} style={{ fontSize: 12 }}>
            <b style={{ color: TINTA, fontSize: 13 }}>{e.disponibles.length}/{e.total}</b>
            {lib.length > 0 && (
              <div style={{ marginTop: 3, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {lib.map(x => (
                  <span key={x.pieza} style={{ background: COLOR.disponible.fondo,
                    border: `1px solid ${COLOR.disponible.borde}`, color: COLOR.disponible.texto,
                    borderRadius: 4, padding: "1px 5px", fontSize: 11, fontWeight: 700 }}>
                    {x.pieza} desde {fmtF(x.fechaLiberacion).slice(0, 5)}
                  </span>
                ))}
              </div>
            )}
            {bl.length > 0 && (
              <div style={{ color: COLOR.bloqueada.texto, marginTop: 3, fontSize: 11 }}>
                bloq. {bl.slice(0, 4).join(", ")}{bl.length > 4 ? "…" : ""}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 12, color: "#777" }}>{fmtF(f.p.ultima_visita)}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <Campo label="Mes">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={input}>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Campo>
        <Campo label="Año">
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ ...input, width: 90 }} />
        </Campo>
        <Campo label="Última visita">
          <select value={antiguedad} onChange={e => setAntiguedad(Number(e.target.value))} style={input}>
            <option value={12}>12 meses</option>
            <option value={24}>24 meses</option>
            <option value={36}>36 meses</option>
            <option value={0}>Todos</option>
          </select>
        </Campo>
        <Campo label="Tratamiento">
          <select value={tratamiento} onChange={e => setTratamiento(e.target.value)} style={input}>
            <option value="AMBOS">Ambos</option>
            <option value="OBTURACION">Obturación</option>
            <option value="ANGULOS">Reconstrucción de ángulos</option>
          </select>
        </Campo>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {kpi(filas.length, "Pacientes en la lista", TINTA)}
        {kpi(conLiberacion.length, `Liberan piezas en ${MESES[mes - 1]}`, "#2ecc71")}
        {kpi(filas.filter(f => f.bloqueadas === 0).length, "Todo disponible", "#3498db")}
        {kpi(filas.filter(f => f.bloqueadas > 0).length, "Con piezas bloqueadas", "#e74c3c")}
      </div>

      <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#2ecc71", marginBottom: 8 }}>
        SE LIBERAN EN {MESES[mes - 1].toUpperCase()}
      </div>
      {conLiberacion.length === 0
        ? <div style={{ color: "#999", fontSize: 13, padding: "10px 0 18px" }}>
            Ningún paciente libera piezas en {MESES[mes - 1]}.
          </div>
        : <div style={{ marginBottom: 18 }}>{conLiberacion.map(f => <Fila key={f.p.paciente_key} f={f} />)}</div>}

      <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#888", marginBottom: 8 }}>
        RESTO CON DISPONIBILIDAD · {resto.length}
      </div>
      {resto.map(f => <Fila key={f.p.paciente_key} f={f} />)}
    </div>
  );
}

// ── Cabecera con el estado de los datos y el importador ──────────────────────
function Cabecera({ importacion, onImportado, email, hoy, volverA }) {
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [alta, setAlta] = useState(null);

  // Con fechas en texto y no con Date.now(): llamar a un reloj mientras se
  // pinta da resultados distintos en cada render.
  const dias = importacion?.created_at ? diasEntre(importacion.created_at.slice(0, 10), hoy) : null;
  const viejo = dias != null && dias > 30;

  const subir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setOcupado(true); setEstado("Leyendo el archivo…");
    try {
      const buf = await archivo.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const hoja = wb.Sheets[HOJA_EXCEL] || wb.Sheets[wb.SheetNames[0]];
      const { filas, faltan, descartadas } = normalizarFilas(
        XLSX.utils.sheet_to_json(hoja, { defval: null }));
      if (faltan.length) {
        setEstado(`El archivo no tiene estas columnas: ${faltan.join(", ")}. No se importó nada.`);
        setOcupado(false); return;
      }
      const nuevo = resumenImportacion(filas);
      const actual = importacion && {
        filas: importacion.filas, fechaMin: importacion.fecha_min_realizacion,
      };
      const aviso = avisoDeRetroceso(nuevo, actual);
      if (aviso && !window.confirm(aviso)) { setEstado("Importación cancelada."); setOcupado(false); return; }

      setEstado(`Subiendo ${nuevo.filas} filas…`);
      const r = await importarPrestaciones(archivo.name, filas);
      setEstado(`Listo: ${r.filas} filas, ${r.pacientes} pacientes, hasta ${fmtF(r.fechaMax)}.` +
        (descartadas ? ` ${descartadas} filas sin fecha, descartadas.` : "") +
        (r.apuntesLimpiados ? ` ${r.apuntesLimpiados} apunte(s) ya cubierto(s) por el portal, retirado(s).` : ""));
      await onImportado();
    } catch (err) {
      setEstado(`No se pudo importar: ${err.message || err}`);
    }
    setOcupado(false);
  };

  const crear = async () => {
    const nombre = normalizarNombre(alta.nombre);
    if (!nombre) { setEstado("Falta el nombre"); return; }
    const dni = normalizarDni(alta.dni);
    try {
      await altaPacienteManual({
        paciente_key: claveDePaciente(dni, nombre), dni, nombre,
        nota: alta.nota || null, creado_por: email,
      });
      setAlta(null); setEstado(`${nombre} dado de alta.`);
      await onImportado();
    } catch (e) { setEstado(e.message || "No se pudo dar de alta"); }
  };

  return (
    <div style={{ background: "#fff", borderBottom: `1px solid ${BORDE}`, padding: "10px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* Cada uno vuelve a su casa: el jefe al portal, el dueño a la
            aplicación. Sin esto solo se sale editando la URL. */}
        <a href={volverA} style={{ color: "#888", textDecoration: "none", fontSize: 13 }}>‹ Volver</a>
        <div style={{ fontSize: 11, letterSpacing: 3, fontWeight: 700, color: ORO }}>MUTUA · AGRUPACIÓ</div>
        <div style={{ fontSize: 12, color: viejo ? "#e74c3c" : "#777", fontWeight: viejo ? 700 : 400 }}>
          {importacion
            ? <>Datos hasta {fmtF(importacion.fecha_max_realizacion)} · importado el {fmtF(importacion.created_at)}
                {importacion.importado_por ? ` por ${importacion.importado_por}` : ""}
                {viejo ? ` · hace ${dias} días` : ""}</>
            : "Todavía no se importó ningún archivo de la mutua."}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setAlta({ nombre: "", dni: "", nota: "" })} style={btnGris}>+ Paciente nuevo</button>
        <label style={{ ...btnOro, opacity: ocupado ? 0.5 : 1 }}>
          {ocupado ? "Trabajando…" : "Actualizar datos de la mutua"}
          <input type="file" accept=".xlsx,.xls" onChange={subir} disabled={ocupado} style={{ display: "none" }} />
        </label>
      </div>
      {alta && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
          <Campo label="Nombre y apellidos">
            <input value={alta.nombre} onChange={e => setAlta({ ...alta, nombre: e.target.value })}
              style={{ ...input, width: 260 }} placeholder="NOMBRE APELLIDO APELLIDO" />
          </Campo>
          <Campo label="DNI (si tiene)">
            <input value={alta.dni} onChange={e => setAlta({ ...alta, dni: e.target.value })}
              style={{ ...input, width: 130 }} placeholder="12345678Z" />
          </Campo>
          <button onClick={crear} style={btnOro}>Dar de alta</button>
          <button onClick={() => setAlta(null)} style={btnGris}>Cancelar</button>
          <div style={{ fontSize: 11, color: "#888", flexBasis: "100%" }}>
            Se identifica igual que en el export del portal, así que el día que aparezca allí
            las dos mitades se juntan solas.
          </div>
        </div>
      )}
      {estado && <div style={{ fontSize: 12, color: "#555", marginTop: 8 }}>{estado}</div>}
    </div>
  );
}

// ── Estilos sueltos ──────────────────────────────────────────────────────────
const input = { background: FONDO, border: `1px solid #dde4ef`, borderRadius: 6, color: TINTA,
  padding: "6px 8px", fontSize: 13, outline: "none", fontFamily: FUENTE };
const btnOro = { background: ORO, color: "#fff", border: "none", borderRadius: 8,
  padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FUENTE };
const btnGris = { background: "#eee", color: "#555", border: "1px solid #ddd", borderRadius: 8,
  padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: FUENTE };
const btnBorrar = { background: "#fff0f0", border: "1px solid #e74c3c55", borderRadius: 6,
  color: "#e74c3c", padding: "2px 8px", cursor: "pointer", fontSize: 13, fontWeight: 700 };
const th = { textAlign: "left", fontSize: 10, color: "#888", textTransform: "uppercase",
  letterSpacing: 1, padding: "5px 8px", borderBottom: `2px solid ${BORDE}` };
const td = { padding: "6px 8px", borderBottom: `1px solid ${FONDO}`, verticalAlign: "top" };
const Campo = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 10, letterSpacing: 1, color: "#888", fontWeight: 700, marginBottom: 3 }}>{label}</div>
    {children}
  </div>
);
const pantalla = (contenido) => (
  <div style={{ minHeight: "100vh", background: FONDO, display: "flex", alignItems: "center",
    justifyContent: "center", fontFamily: FUENTE, padding: 20, color: "#777", fontSize: 13 }}>
    {contenido}
  </div>
);

// ── Sección ──────────────────────────────────────────────────────────────────
export default function PanelMutua({ LoginForm, SinAcceso }) {
  // Una sola lectura del reloj para toda la seccion: si cada componente
  // llamara a la suya, una ficha abierta a medianoche podria calcularse con
  // dos dias distintos a la vez.
  const [hoy] = useState(hoyMadrid);
  const [sesion, setSesion] = useState(null);
  const [listo, setListo] = useState(false);
  const [rol, setRol] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [pestana, setPestana] = useState("ficha");
  const [busca, setBusca] = useState("");
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSesion(session); setListo(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => subscription.unsubscribe();
  }, []);

  const email = (sesion?.user?.email || "").toLowerCase();

  const recargar = async () => {
    try { setDatos(await cargarMutua()); setError(""); }
    catch (e) { setError(e.message || "No se pudieron cargar los datos"); }
  };

  useEffect(() => {
    if (!email) return;
    (async () => {
      const { data: u, error: errRol } = await supabase.from("plan_usuarios")
        .select("rol").eq("email", email).maybeSingle();
      // Un corte de red no es una falta de permiso: son pantallas distintas.
      if (errRol) { setRol("fallo_red"); return; }
      const r = u?.rol || "sin_acceso";
      setRol(r);
      if (r === "dueno" || r === "jefe") await recargar();
    })();
  }, [email]);

  if (!listo) return pantalla("Comprobando acceso…");
  if (!sesion) return <LoginForm onLogin={() => {}} />;
  if (rol === null) return pantalla("Comprobando acceso…");
  if (rol === "fallo_red") return pantalla(
    <div style={{ textAlign: "center" }}>
      <div>No se pudo comprobar tu acceso. No es que te falten permisos: no hubo respuesta del servidor.</div>
      <button onClick={() => window.location.reload()} style={{ ...btnOro, marginTop: 14 }}>Reintentar</button>
    </div>
  );
  // Recepción no entra: son datos de salud con DNI y no los necesita.
  if (rol !== "dueno" && rol !== "jefe") return <SinAcceso email={email} />;
  if (!datos) return pantalla(error || "Cargando datos de la mutua…");

  const q = normalizarNombre(busca);
  const encontrados = q
    ? datos.pacientes.filter(p => (p.nombre || "").includes(q) ||
        (p.paciente_key || "").toUpperCase().includes(q))
    : [];

  return (
    <div style={{ minHeight: "100vh", background: FONDO, color: TINTA, fontFamily: FUENTE }}>
      <Cabecera importacion={datos.importacion} onImportado={recargar} email={email} hoy={hoy}
        volverA={rol === "dueno" ? "/" : "/planes"} />

      <div style={{ padding: "16px 24px 40px", maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          {[["ficha", "Ficha de paciente"], ["mes", "Por hacer del mes"]].map(([id, txt]) => (
            <button key={id} onClick={() => setPestana(id)}
              style={{ ...(pestana === id ? btnOro : btnGris), padding: "8px 18px" }}>{txt}</button>
          ))}
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por DNI o nombre…"
            style={{ ...input, flex: 1, minWidth: 240, padding: "9px 12px" }} />
          {error && <span style={{ color: "#e74c3c", fontSize: 12 }}>{error}</span>}
        </div>

        {pestana === "ficha" ? (
          abierto ? (
            <div>
              <button onClick={() => setAbierto(null)} style={{ ...btnGris, marginBottom: 12 }}>‹ Volver</button>
              <Ficha key={abierto.paciente_key} paciente={abierto}
                ultimas={datos.ultimas} perdidas={datos.perdidas}
                previstos={datos.previstos} onCambio={recargar} email={email} hoy={hoy} />
            </div>
          ) : (
            <div>
              {!q && <div style={{ color: "#999", fontSize: 13 }}>
                Buscá por DNI o por nombre. {datos.pacientes.length} pacientes cargados.
              </div>}
              {q && encontrados.length === 0 && (
                <div style={{ color: "#999", fontSize: 13 }}>Nadie coincide con "{busca}".</div>
              )}
              {encontrados.slice(0, 40).map(p => (
                <div key={p.paciente_key} onClick={() => setAbierto(p)}
                  style={{ background: "#fff", border: `1px solid ${BORDE}`, borderRadius: 8,
                    padding: "10px 14px", marginBottom: 6, cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>
                      {p.dni || "Sin DNI"} · última visita {fmtF(p.ultima_visita)}
                      {p.solo_manual && <span style={{ color: COLOR.prevista.texto }}> · alta manual</span>}
                    </div>
                  </div>
                  <span style={{ color: ORO, fontSize: 20 }}>›</span>
                </div>
              ))}
            </div>
          )
        ) : (
          <PorHacerDelMes pacientes={datos.pacientes} ultimas={datos.ultimas}
            perdidas={datos.perdidas} previstos={datos.previstos} busca={busca} hoy={hoy}
            onAbrir={(p) => { setAbierto(p); setPestana("ficha"); }} />
        )}
      </div>
    </div>
  );
}
