import {
  Document, Page, Text, View, Image, StyleSheet, Font,
} from '@react-pdf/renderer';
import { oPuntos } from './merge';

// Times New Roman es la tipografía de los originales escaneados.
// Mantenerla evita que el documento nuevo parezca otro documento
// distinto del que la clínica lleva años usando.
// Solo en el navegador: "/fonts/..." es una ruta servida por Vite desde
// public/. En Node se resolvería como C:/fonts y reventaría, así que allí las
// registra quien renderice, con rutas de disco. react-pdf se queda con el
// primer registro de cada familia, de modo que este no puede ser incondicional.
if (typeof window !== 'undefined') {
  Font.register({
    family: 'Tinos',
    fonts: [
      { src: '/fonts/Tinos-Regular.ttf' },
      { src: '/fonts/Tinos-Bold.ttf', fontWeight: 'bold' },
      { src: '/fonts/Tinos-Italic.ttf', fontStyle: 'italic' },
    ],
  });
}

const hoja = (e) => StyleSheet.create({
  page: {
    fontFamily: 'Tinos',
    fontSize: 9.5 * e,
    lineHeight: 1.45,
    paddingTop: 28,
    paddingBottom: 46,
    paddingHorizontal: 42,
    color: '#000',
  },
  logo: { width: 118 * e, marginBottom: 10 * e, alignSelf: 'flex-start' },
  tituloDoc: {
    fontSize: 12 * e,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 14 * e,
    textTransform: 'uppercase',
  },
  h2: { fontSize: 10 * e, fontWeight: 'bold', marginTop: 10 * e, marginBottom: 4 * e },
  parrafo: { marginBottom: 6 * e, textAlign: 'justify' },
  lista: { marginBottom: 6 * e, paddingLeft: 12 * e },
  itemFila: { flexDirection: 'row', marginBottom: 2.5 * e },
  vineta: { width: 10 * e },
  itemTexto: { flex: 1 * e, textAlign: 'justify' },
  recuadro: {
    borderWidth: 0.7 * e,
    borderColor: '#000',
    padding: 7 * e,
    marginBottom: 8 * e,
  },
  campoEtiqueta: { marginBottom: 2 * e },
  campoLinea: {
    borderBottomWidth: 0.7 * e,
    borderBottomColor: '#000',
    height: 15 * e,
    marginBottom: 3 * e,
  },
  // El bloque de firmas nunca debe partirse entre páginas.
  firmas: { flexDirection: 'row', marginTop: 34 * e, gap: 18 * e },
  firmaCol: { flex: 1 * e, alignItems: 'center' },
  firmaLinea: {
    borderTopWidth: 0.7 * e,
    borderTopColor: '#000',
    width: '100%',
    marginBottom: 4 * e,
  },
  firmaEtiqueta: { fontSize: 8.5 * e, textAlign: 'center' },
  pie: {
    position: 'absolute',
    bottom: 20,
    left: 42,
    right: 42,
    fontSize: 7 * e,
    color: '#333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5 * e,
    borderTopColor: '#999',
    paddingTop: 4,
  },
  rubrica: { fontSize: 7 * e, color: '#333' },
});

// Los tamaños se multiplican por una escala. Sirve para apretar un
// consentimiento que se pasa por poco de un número par de caras: en dúplex,
// tres páginas gastan las mismas dos hojas que cuatro pero dejan un reverso en
// blanco. Ver ajustarACaras() en caras.js.
//
// Los márgenes de página no se escalan: son requisito de impresión (A4 con
// 42 pt laterales), no una cuestión de que quepa más o menos texto.
const cacheHojas = new Map();
const estilos = (e) => {
  const k = e.toFixed(3);
  if (!cacheHojas.has(k)) cacheHojas.set(k, hoja(e));
  return cacheHojas.get(k);
};



function RenderNodo({ nodo, s }) {
  switch (nodo.tipo) {
    case 'titulo':
      return <Text style={nodo.nivel === 1 ? s.tituloDoc : s.h2}>{nodo.texto}</Text>;

    case 'parrafo':
      return <Text style={s.parrafo}>{nodo.texto}</Text>;

    case 'lista':
      return (
        <View style={s.lista}>
          {nodo.items.map((item, k) => (
            <View style={s.itemFila} key={k}>
              <Text style={s.vineta}>•</Text>
              <Text style={s.itemTexto}>{item}</Text>
            </View>
          ))}
        </View>
      );

    case 'recuadro':
      return (
        <View style={s.recuadro} wrap={false}>
          {nodo.nodos.map((n, k) => <RenderNodo nodo={n} s={s} key={k} />)}
        </View>
      );

    case 'campo_manual':
      return (
        <View wrap={false}>
          {nodo.etiqueta && <Text style={s.campoEtiqueta}>{nodo.etiqueta}</Text>}
          {Array.from({ length: nodo.lineas ?? 2 }).map((_, k) => (
            <View style={s.campoLinea} key={k} />
          ))}
        </View>
      );

    case 'bloque_representante':
      return (
        <View>
          {nodo.nodos.map((n, k) => <RenderNodo nodo={n} s={s} key={k} />)}
        </View>
      );

    case 'firmas':
      return (
        <View style={s.firmas} wrap={false}>
          {nodo.columnas.map((c, k) => (
            <View style={s.firmaCol} key={k}>
              <View style={s.firmaLinea} />
              <Text style={s.firmaEtiqueta}>{c.etiqueta}</Text>
            </View>
          ))}
        </View>
      );

    case 'salto_pagina':
      return <View break />;

    default:
      return null;
  }
}

// Una hoja de consentimiento. Va aparte del Document para poder meter varios
// en un solo PDF: el navegador bloquea el segundo window.open de un bucle, así
// que si se piden tres consentimientos se imprime un archivo con los tres.
function PaginaConsentimiento({ titulo, nodos, datos, logoUrl, escala = 1 }) {
  const s = estilos(escala);
  return (
    <Page size="A4" style={s.page}>
      {logoUrl && <Image src={logoUrl} style={s.logo} />}
      <Text style={s.tituloDoc}>{titulo}</Text>

      {nodos.map((n, k) => <RenderNodo nodo={n} s={s} key={k} />)}

      {/* Rúbrica al pie de cada página: práctica estándar para que
          no se pueda cuestionar la sustitución de una hoja suelta.
          La numeración es subPage y no page: cada consentimiento cuenta
          sus propias hojas aunque vayan varios en el mismo archivo, que es
          lo que tiene sentido en un documento que se firma por separado. */}
      <View style={s.pie} fixed>
        {/* Lo que no esté cargado sale como línea de puntos, igual que en el
            cuerpo: se escribe a mano sobre el papel. */}
        <Text>
          {datos.clinica.razon_social} · CIF {oPuntos(datos.clinica.cif, 14)} ·
          {' '}Reg. sanitario {oPuntos(datos.clinica.registro_sanitario, 14)}
        </Text>
        <Text
          render={({ subPageNumber, subPageTotalPages }) =>
            `Rúbrica ________   Pág. ${subPageNumber} de ${subPageTotalPages}`
          }
        />
      </View>
    </Page>
  );
}

// Cara en blanco de relleno, para que el consentimiento ocupe un número par y
// el siguiente no acabe impreso en su reverso. Va rotulada, como en cualquier
// documento legal: una página muda invita a pensar que falta algo.
function PaginaEnBlanco({ datos, escala = 1 }) {
  const s = estilos(escala);
  return (
    <Page size="A4" style={s.page}>
      <Text style={{ ...s.parrafo, textAlign: 'center', marginTop: 240, color: '#666' }}>
        Esta página se ha dejado en blanco intencionadamente.
      </Text>
      <View style={s.pie} fixed>
        <Text>
          {datos.clinica.razon_social} · CIF {oPuntos(datos.clinica.cif, 14)} ·
          {' '}Reg. sanitario {oPuntos(datos.clinica.registro_sanitario, 14)}
        </Text>
        <Text render={() => 'Rúbrica ________'} />
      </View>
    </Page>
  );
}

export function DocumentoPDF({ titulo, nodos, datos, logoUrl, escala = 1, relleno = false }) {
  return (
    <Document
      title={`Consentimiento ${titulo} — ${datos.paciente.nombre}`}
      author={datos.clinica.razon_social}
    >
      <PaginaConsentimiento titulo={titulo} nodos={nodos} datos={datos}
        logoUrl={logoUrl} escala={escala} />
      {relleno && <PaginaEnBlanco datos={datos} escala={escala} />}
    </Document>
  );
}

// Varios consentimientos en un solo archivo, cada uno empezando en hoja nueva.
// Es lo que se manda a la impresora: se firman por separado, pero se imprimen
// de una vez.
export function DocumentoConjunto({ docs, logoUrl }) {
  const primero = docs[0];
  return (
    <Document
      title={`Consentimientos — ${primero.datos.paciente.nombre}`}
      author={primero.datos.clinica.razon_social}
    >
      {docs.flatMap((d, k) => [
        <PaginaConsentimiento key={`c${k}`} titulo={d.titulo} nodos={d.nodos}
          datos={d.datos} logoUrl={logoUrl} escala={d.escala ?? 1} />,
        ...(d.relleno ? [<PaginaEnBlanco key={`b${k}`} datos={d.datos} escala={d.escala ?? 1} />] : []),
      ])}
    </Document>
  );
}
