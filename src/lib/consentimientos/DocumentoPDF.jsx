import {
  Document, Page, Text, View, Image, StyleSheet, Font,
} from '@react-pdf/renderer';

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

const s = StyleSheet.create({
  page: {
    fontFamily: 'Tinos',
    fontSize: 9.5,
    lineHeight: 1.45,
    paddingTop: 28,
    paddingBottom: 46,
    paddingHorizontal: 42,
    color: '#000',
  },
  logo: { width: 118, marginBottom: 10, alignSelf: 'flex-start' },
  tituloDoc: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  h2: { fontSize: 10, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  parrafo: { marginBottom: 6, textAlign: 'justify' },
  lista: { marginBottom: 6, paddingLeft: 12 },
  itemFila: { flexDirection: 'row', marginBottom: 2.5 },
  vineta: { width: 10 },
  itemTexto: { flex: 1, textAlign: 'justify' },
  recuadro: {
    borderWidth: 0.7,
    borderColor: '#000',
    padding: 7,
    marginBottom: 8,
  },
  campoEtiqueta: { marginBottom: 2 },
  campoLinea: {
    borderBottomWidth: 0.7,
    borderBottomColor: '#000',
    height: 15,
    marginBottom: 3,
  },
  // El bloque de firmas nunca debe partirse entre páginas.
  firmas: { flexDirection: 'row', marginTop: 34, gap: 18 },
  firmaCol: { flex: 1, alignItems: 'center' },
  firmaLinea: {
    borderTopWidth: 0.7,
    borderTopColor: '#000',
    width: '100%',
    marginBottom: 4,
  },
  firmaEtiqueta: { fontSize: 8.5, textAlign: 'center' },
  pie: {
    position: 'absolute',
    bottom: 20,
    left: 42,
    right: 42,
    fontSize: 7,
    color: '#333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#999',
    paddingTop: 4,
  },
  rubrica: { fontSize: 7, color: '#333' },
});

function RenderNodo({ nodo }) {
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
          {nodo.nodos.map((n, k) => <RenderNodo nodo={n} key={k} />)}
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
          {nodo.nodos.map((n, k) => <RenderNodo nodo={n} key={k} />)}
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
function PaginaConsentimiento({ titulo, nodos, datos, logoUrl }) {
  return (
    <Page size="A4" style={s.page}>
      {logoUrl && <Image src={logoUrl} style={s.logo} />}
      <Text style={s.tituloDoc}>{titulo}</Text>

      {nodos.map((n, k) => <RenderNodo nodo={n} key={k} />)}

      {/* Rúbrica al pie de cada página: práctica estándar para que
          no se pueda cuestionar la sustitución de una hoja suelta.
          La numeración es subPage y no page: cada consentimiento cuenta
          sus propias hojas aunque vayan varios en el mismo archivo, que es
          lo que tiene sentido en un documento que se firma por separado. */}
      <View style={s.pie} fixed>
        <Text>
          {datos.clinica.razon_social} · CIF {datos.clinica.cif} · Reg. sanitario{' '}
          {datos.clinica.registro_sanitario}
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

export function DocumentoPDF({ titulo, nodos, datos, logoUrl }) {
  return (
    <Document
      title={`Consentimiento ${titulo} — ${datos.paciente.nombre}`}
      author={datos.clinica.razon_social}
    >
      <PaginaConsentimiento titulo={titulo} nodos={nodos} datos={datos} logoUrl={logoUrl} />
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
      {docs.map((d, k) => (
        <PaginaConsentimiento key={k} titulo={d.titulo} nodos={d.nodos}
          datos={d.datos} logoUrl={logoUrl} />
      ))}
    </Document>
  );
}
