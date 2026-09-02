import { useEffect, useMemo, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../lib/supabase';
import { DocumentoPDF } from '../lib/consentimientos/DocumentoPDF';
import {
  calcularEdad, determinarFirmante, componerDocumento, fechaLarga,
} from '../lib/consentimientos/merge';
import type { Bloque, Plantilla, DatosFusion } from '../lib/consentimientos/tipos';

type Paciente = {
  id: string;
  nombre: string;
  documento: string;
  telefono: string | null;
  historia_clinica: string | null;
};

type Doctor = { id: string; nombre: string; colegiado: string };

export function BotonConsentimientos({ paciente }: { paciente: Paciente }) {
  const [abierto, setAbierto] = useState(false);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [bloques, setBloques] = useState<Map<string, Bloque>>(new Map());
  const [doctores, setDoctores] = useState<Doctor[]>([]);
  const [config, setConfig] = useState<DatosFusion['clinica'] & { logo_url: string; lugar_firma: string } | null>(null);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [doctorId, setDoctorId] = useState<string>('');
  const [piezas, setPiezas] = useState('');
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quién firma se elige aquí, no se calcula. La clínica no guarda la
  // fecha de nacimiento y el consentimiento no la imprime, así que no
  // hay de dónde deducirlo. La regla de los 16 años va en la etiqueta
  // del selector para que quien emite el documento la tenga delante.
  const [firmante, setFirmante] = useState<TipoFirmante>('paciente');

  useEffect(() => {
    if (!abierto) return;
    (async () => {
      const [p, b, d, c] = await Promise.all([
        supabase.from('consent_plantillas').select('*').eq('activa', true).order('titulo'),
        supabase.from('consent_bloques').select('*').eq('activo', true),
        supabase.from('doctores').select('id, nombre, colegiado').order('nombre'),
        supabase.from('clinica_config').select('*').single(),
      ]);
      if (p.error || b.error || d.error || c.error) {
        setError('No se han podido cargar las plantillas. Reintenta.');
        return;
      }
      setPlantillas(p.data as Plantilla[]);
      setBloques(new Map((b.data as Bloque[]).map((x) => [x.codigo, x])));
      setDoctores(d.data as Doctor[]);
      setConfig(c.data);
    })();
  }, [abierto]);

  function alternar(id: string) {
    setSeleccion((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  async function generar() {
    if (!config || seleccion.size === 0) return;
    setGenerando(true);
    setError(null);

    try {
      for (const plantillaId of seleccion) {
        const plantilla = plantillas.find((p) => p.id === plantillaId)!;

        const doctor = doctores.find((x) => x.id === doctorId);

        if (!doctor) {
          setError('Selecciona el profesional que realizará el tratamiento.');
          setGenerando(false);
          return;
        }

        const datos: DatosFusion = {
          paciente: {
            nombre: paciente.nombre,
            documento: paciente.documento,
            telefono: paciente.telefono ?? '',
          },
          profesional: { nombre: doctor.nombre, colegiado: doctor.colegiado },
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

        // Sustituye el bloque de firmas según quién firme.
        const composicion = plantilla.composicion.map((item) =>
          'ref' in item && item.ref === 'firmas_paciente' && firmante === 'representante'
            ? { ref: 'firmas_representante' }
            : item,
        );

        const nodos = componerDocumento(composicion, bloques, datos, firmante);

        const blob = await pdf(
          <DocumentoPDF
            titulo={plantilla.titulo}
            nodos={nodos}
            datos={datos}
            logoUrl={config.logo_url}
          />,
        ).toBlob();

        // Copia congelada: lo que se guarda es el árbol YA resuelto,
        // no una referencia a la plantilla. Si mañana se edita la
        // plantilla, este documento sigue diciendo lo que dijo hoy.
        const { data: doc, error: errDoc } = await supabase
          .from('consent_documentos')
          .insert({
            paciente_id: paciente.id,
            plantilla_id: plantilla.id,
            plantilla_codigo: plantilla.codigo,
            plantilla_version: plantilla.version,
            contenido_congelado: nodos,
            datos_fusion: datos,
            profesional_id: doctor.id,
            profesional_nombre: doctor.nombre,
            profesional_colegiado: doctor.colegiado,
            firmante_tipo: firmante,
            emitido_por: (await supabase.auth.getUser()).data.user?.id,
          })
          .select('id')
          .single();

        if (errDoc) throw errDoc;

        const ruta = `${paciente.id}/${doc.id}.pdf`;
        await supabase.storage.from('consentimientos').upload(ruta, blob, {
          contentType: 'application/pdf',
        });
        await supabase.from('consent_documentos')
          .update({ pdf_path: ruta })
          .eq('id', doc.id);

        window.open(URL.createObjectURL(blob), '_blank');
      }

      setAbierto(false);
      setSeleccion(new Set());
    } catch (e) {
      console.error(e);
      setError('No se ha podido generar el documento. Vuelve a intentarlo.');
    } finally {
      setGenerando(false);
    }
  }


  return (
    <>
      <button onClick={() => setAbierto(true)}>Consentimientos</button>

      {abierto && (
        <div role="dialog" aria-label="Generar consentimientos">
          <h2>Consentimientos para {paciente.nombre}</h2>

          <fieldset>
            <legend>Quién firma</legend>
            <label>
              <input type="radio" checked={firmante === 'paciente'}
                onChange={() => setFirmante('paciente')} />
              El propio paciente (adulto, o menor de 16 años o más)
            </label>
            <label>
              <input type="radio" checked={firmante === 'representante'}
                onChange={() => setFirmante('representante')} />
              Padre, madre o tutor (paciente menor de 16 años)
            </label>
          </fieldset>


          <label>
            Profesional
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Selecciona el profesional</option>
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} — col. {d.colegiado}
                </option>
              ))}
            </select>
          </label>

          <label>
            Piezas afectadas
            <input
              value={piezas}
              onChange={(e) => setPiezas(e.target.value)}
              placeholder="16, 17"
            />
          </label>

          <fieldset>
            <legend>Tratamientos</legend>
            {plantillas.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={seleccion.has(p.id)}
                  onChange={() => alternar(p.id)}
                />
                {p.titulo}
              </label>
            ))}
          </fieldset>

          {error && <p role="alert">{error}</p>}

          <button onClick={() => setAbierto(false)}>Cancelar</button>
          <button onClick={generar} disabled={generando || seleccion.size === 0}>
            {generando ? 'Generando…' : `Generar ${seleccion.size || ''}`}
          </button>
        </div>
      )}
    </>
  );
}
