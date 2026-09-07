// Escala vertical de los gráficos de la pestaña Estadísticas.
//
// Arrancar siempre en cero deja las líneas planas cuando los valores oscilan
// poco en relación a su tamaño: con el objetivo de 90.000 marcando el techo,
// pasar de 60.000 a 75.000 ocupa el 15% del alto del gráfico y no se ve.
//
// Así que el eje se ajusta a los datos cuando eso gana algo, y se queda en
// cero cuando no. El criterio: si la banda de datos ocupa menos de la mitad de
// lo que iría de cero al máximo, la línea está aplastada y merece la pena
// acercar. Si ya ocupa más de la mitad, arrancar en cero no estorba y es la
// lectura más honesta.
//
// Los meses futuros vienen como 0 y no cuentan: si contaran, el mínimo sería
// siempre cero y no se ajustaría nunca.

const ultimoConDato = (datos) => {
  for (let i = datos.length - 1; i >= 0; i--) if (datos[i]) return i;
  return -1;
};

// Los valores que de verdad se dibujan: hasta el último mes con dato, y sin
// los ceros intermedios, que son meses sin actividad y no un suelo real.
export function valoresDibujados(series) {
  const out = [];
  for (const s of series) {
    const fin = ultimoConDato(s.data || []);
    for (let i = 0; i <= fin; i++) if (s.data[i]) out.push(s.data[i]);
  }
  return out;
}

export function escalaY(series = [], objetivo = null, { lineas = 4 } = {}) {
  const vals = valoresDibujados(series);
  const conObjetivo = objetivo == null ? vals : [...vals, objetivo];

  if (!conObjetivo.length) {
    return { yMin: 0, yMax: 1, grid: [0, 1], ajustado: false };
  }

  const min = Math.min(...conObjetivo);
  const max = Math.max(...conObjetivo);

  // Un solo valor distinto: no hay oscilación que enseñar.
  if (min === max) {
    const yMax = max <= 5 ? max + 1 : Math.ceil(max * 1.15);
    return { yMin: 0, yMax, grid: reparte(0, yMax, lineas), ajustado: false };
  }

  // ¿Está aplastada? La banda de datos frente a todo lo que iría desde cero.
  const aplastada = (max - min) < max * 0.5;
  if (!aplastada) {
    const yMax = max <= 5 ? max + 1 : Math.ceil(max * 1.15);
    return { yMin: 0, yMax, grid: reparte(0, yMax, lineas), ajustado: false };
  }

  // Se acerca el eje dejando un margen para que las líneas no toquen el borde.
  const margen = (max - min) * 0.18;
  const yMin = Math.max(0, redondeaAbajo(min - margen));
  const yMax = redondeaArriba(max + margen);
  return { yMin, yMax, grid: reparte(yMin, yMax, lineas), ajustado: yMin > 0 };
}

// Redondeos a una cifra "de leer": 58.340 -> 58.000, 76.120 -> 77.000.
const paso = (v) => {
  const mag = Math.pow(10, Math.max(0, String(Math.round(Math.abs(v))).length - 2));
  return Math.max(1, mag);
};
const redondeaAbajo  = (v) => Math.floor(v / paso(v)) * paso(v);
const redondeaArriba = (v) => Math.ceil(v / paso(v)) * paso(v);

function reparte(min, max, lineas) {
  return Array.from({ length: lineas + 1 }, (_, i) =>
    Math.round(min + ((max - min) * i) / lineas));
}
