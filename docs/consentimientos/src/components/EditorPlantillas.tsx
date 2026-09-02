import { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../lib/supabase';
import { DocumentoPDF } from '../lib/consentimientos/DocumentoPDF';
import { componerDocumento, fechaLarga } from '../lib/consentimientos/merge';
import type { Bloque, Plantilla, Nodo, DatosFusion } from '../lib/consentimientos/tipos';

// Paciente ficticio para la vista previa. Nunca uses uno real aquí:
// la vista previa se abre muchas veces y no debe generar registros ni
// mover datos de salud de nadie.
const EJEMPLO: DatosFusion = {
  paciente: {
    nombre: 'Nombre Apellido Apellido', documento: '00000000X',
    fecha_nacimiento: '01/01/1980', edad: 46,
    domicilio: 'Calle Ejemplo 1, Figueres', telefono: '600000000',
    historia_clinica: '0000',
  },
  profesional: { nombre: 'Dr./Dra. Ejemplo', colegiado: '0000' },
  clinica: {
    razon_social: '—', cif: '—', registro_sanitario: '—',
    direccion: '—', email_dpd: '—',
  },
  tratamiento: { piezas: '16, 17' },
  lugar: 'Figueres',
  fecha: fechaLarga(),
};

/**
 * Editor de plantillas.
 *
 * Existe porque 17 de las 18 plantillas entraron por OCR y necesitan
 * revisión. Corregir texto aquí, viendo el PDF al lado, es mucho más
 * rápido que editar JSON a ciegas.
 */
export function EditorPlantillas() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [bloques, setBloques] = useState<Map<string, Bloque>>(new Map());
  const [activa, setActiva] = useState<Plantilla | null>(null);
  const [nodos, setNodos] = useState<Nodo[]>([]);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [p, b] = await Promise.all([
        supabase.from('consent_plantillas').select('*').order('titulo'),
        supabase.from('consent_bloques').select('*').eq('activo', true),
      ]);
      setPlantillas((p.data ?? []) as Plantilla[]);
      setBloques(new Map(((b.data ?? []) as Bloque[]).map((x) => [x.codigo, x])));
    })();
  }, []);

  function abrir(p: Plantilla) {
    setActiva(p);
    setSucio(false);
    setAviso(null);
    // Solo se edita el bloque propio de la plantilla. Los compartidos
    // se tocan en su propia pantalla, para no romperlos en dieciocho
    // sitios a la vez.
    const propio = p.composicion.find((i) => 'nodos' in i);
    setNodos(propio && 'nodos' in propio ? structuredClone(propio.nodos) : []);
  }

  function editarTexto(i: number, valor: string) {
    setNodos((prev) => {
      const n = structuredClone(prev);
      const nodo = n[i];
      if (nodo.tipo === 'parrafo' || nodo.tipo === 'titulo') nodo.texto = valor;
      return n;
    });
    setSucio(true);
  }

  function editarItem(i: number, k: number, valor: string) {
    setNodos((prev) => {
      const n = structuredClone(prev);
      const nodo = n[i];
      if (nodo.tipo === 'lista') nodo.items[k] = valor;
      return n;
    });
    setSucio(true);
  }

  function borrar(i: number) {
    setNodos((prev) => prev.filter((_, k) => k !== i));
    setSucio(true);
  }

  async function vistaPrevia() {
    if (!activa) return;
    const composicion = activa.composicion.map((i) => ('nodos' in i ? { nodos } : i));
    const resueltos = componerDocumento(composicion, bloques, EJEMPLO, 'paciente');
    const blob = await pdf(
      <DocumentoPDF titulo={activa.titulo} nodos={resueltos} datos={EJEMPLO} />,
    ).toBlob();
    window.open(URL.createObjectURL(blob), '_blank');
  }

  async function guardar(activar: boolean) {
    if (!activa) return;
    setGuardando(true);
    const composicion = activa.composicion.map((i) => ('nodos' in i ? { nodos } : i));
    const { error } = await supabase
      .from('consent_plantillas')
      .update({ composicion, ...(activar ? { activa: true } : {}) })
      .eq('id', activa.id);
    setGuardando(false);
    if (error) {
      setAviso('No se ha podido guardar. Vuelve a intentarlo.');
      return;
    }
    setSucio(false);
    setAviso(activar ? 'Plantilla activada. Ya aparece en la ficha del paciente.' : 'Cambios guardados.');
    if (activar) {
      setActiva({ ...activa, activa: true });
      setPlantillas((prev) =>
        prev.map((p) => (p.id === activa.id ? { ...p, activa: true } : p)),
      );
    }
  }

  // Marca los restos de OCR: series de puntos suspensivos o rachas de
  // fragmentos de una o dos letras, que es como se ve el ruido.
  const sospechoso = (t: string) =>
    t.includes('………') || /\b[a-zA-Z]{1,2}(\s+[a-zA-Z]{1,2}){3,}\b/.test(t);

  return (
    <div>
      <h1>Plantillas de consentimiento</h1>

      <nav aria-label="Plantillas">
        {plantillas.map((p) => (
          <button key={p.id} onClick={() => abrir(p)} aria-current={activa?.id === p.id}>
            {p.titulo}
            {!p.activa && <span title="Sin revisar"> · inactiva</span>}
          </button>
        ))}
      </nav>

      {!activa && <p>Elige una plantilla para revisarla.</p>}

      {activa && (
        <section>
          <h2>{activa.titulo}</h2>

          {!activa.activa && (
            <p>
              Sin revisar. Cotéjala contra el escaneo original en la carpeta
              <code> originales/</code>, corrige lo que haga falta y actívala.
              Mientras esté inactiva no aparece en la ficha del paciente.
            </p>
          )}

          {nodos.map((nodo, i) => (
            <div key={i}>
              {(nodo.tipo === 'titulo' || nodo.tipo === 'parrafo') && (
                <>
                  <label>
                    {nodo.tipo === 'titulo' ? 'Título de sección' : 'Párrafo'}
                    <textarea
                      value={nodo.texto}
                      rows={nodo.tipo === 'titulo' ? 1 : 4}
                      onChange={(e) => editarTexto(i, e.target.value)}
                    />
                  </label>
                  {sospechoso(nodo.texto) && <p role="status">Posible resto de OCR</p>}
                </>
              )}

              {nodo.tipo === 'lista' && (
                <fieldset>
                  <legend>Lista</legend>
                  {nodo.items.map((item, k) => (
                    <div key={k}>
                      <textarea
                        value={item}
                        rows={2}
                        onChange={(e) => editarItem(i, k, e.target.value)}
                      />
                      {sospechoso(item) && <p role="status">Posible resto de OCR</p>}
                    </div>
                  ))}
                </fieldset>
              )}

              {nodo.tipo === 'campo_manual' && (
                <p>Espacio para escribir a mano ({nodo.lineas ?? 2} líneas)</p>
              )}

              <button onClick={() => borrar(i)}>Quitar este bloque</button>
            </div>
          ))}

          {aviso && <p role="status">{aviso}</p>}

          <button onClick={vistaPrevia}>Ver PDF de ejemplo</button>
          <button onClick={() => guardar(false)} disabled={!sucio || guardando}>
            Guardar cambios
          </button>
          <button onClick={() => guardar(true)} disabled={guardando || activa.activa}>
            Guardar y activar
          </button>
        </section>
      )}
    </div>
  );
}
