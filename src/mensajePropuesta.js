// ─── Mensaje de WhatsApp para presentar un plan de pago ──────────────────────
// Acompaña al PDF del plan cuando todavía es un borrador: el paciente recibe la
// hoja con el calendario y este texto explicándole de qué va.
//
// El encuadre importa tanto como los números. Esto NO es la oferta de catálogo:
// lo normal es financiar el tratamiento entero con una financiera y pagar
// intereses sobre el total. Lo que se le ofrece aquí es una excepción pedida
// para él, que le deja pagar sin financiar nada o financiando sólo la entrega.
// Si el mensaje suena a producto estándar, el paciente no percibe la
// diferencia y la compara con cualquier otra oferta.
//
// Aparte de eso, hay tres cosas que se confunden siempre y tienen que quedar
// dichas con todas las letras:
//   1. No es financiar el tratamiento entero: se reparte en etapas y se cobra
//      en clínica sin intereses.
//   2. La entrega puede pagarla de su bolsillo o financiar SÓLO esa parte con
//      Frakmenta. Si no se separa, entiende que le metemos una financiera para
//      todo.
//   3. Cada tratamiento se hace cuando su parte está pagada. De ahí que el
//      calendario diga qué se hace cada mes.
//
// Es una función pura para poder probarla sin navegador. El formato es el de
// WhatsApp: *negrita* con asteriscos y saltos de línea normales.

// Formato español a mano y no con toLocaleString: el mensaje se va a un
// paciente y tiene que salir igual siempre, sin depender del ICU que traiga
// Node o el navegador (en Node, sin ICU completo, "2000,00" se queda sin punto).
const eur = (n) => {
  const [ent, dec] = Math.abs(Math.round(Number(n || 0) * 100) / 100)
    .toFixed(2).split(".");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${Number(n) < 0 ? "-" : ""}${miles},${dec} €`;
};

// "MARÍA JOSÉ GARCÍA" → "María": saludar con el nombre entero suena a carta
export function nombreDePila(nombre) {
  const primero = String(nombre || "").trim().split(/\s+/)[0] || "";
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
}

export function mensajePropuesta({ paciente, plan, der, clinica = "Implantdent" }) {
  const nombre = nombreDePila(paciente?.name || plan?.patient_name);
  const total   = der?.calc?.totalTratamiento || 0;
  const entrega = der?.entrega || 0;
  const nCuotas = der?.nCuotas || 0;
  const cuota   = der?.cuota || 0;
  const resto   = Math.round((total - entrega) * 100) / 100;
  const frag    = der?.frag || null;

  const p = [];

  p.push(`Hola ${nombre}, ¿qué tal?`);
  p.push(`Te escribo de *Clínica Dental ${clinica}*. Te paso en el PDF adjunto la propuesta que te comentaba para tu tratamiento.`);

  // El "por qué" va antes que el "qué": si no, lo lee como una oferta más
  p.push(`*POR QUÉ TE LA PASO*\nLo habitual, cuando un tratamiento no se puede pagar de una vez, es financiarlo entero con una financiera${total > 0 ? ` y pagar intereses sobre los ${eur(total)}` : ""}. He pedido que en tu caso lo podamos hacer de otra manera y me lo han aceptado, así que esto no es nuestra condición de siempre: es una excepción para vos.`);

  p.push(`*EN QUÉ CONSISTE*\nRepartimos tu tratamiento en etapas a lo largo de los meses y lo vas pagando en la clínica según avanza, *sin intereses y sin financiera de por medio*. La que espera el dinero es la clínica.`);

  const pasos = [
    entrega > 0 ? `1. Una entrega inicial de *${eur(entrega)}*.` : null,
    nCuotas > 0
      ? `${entrega > 0 ? "2" : "1"}. El resto, ${eur(resto)}, en *${nCuotas} cuotas de ${eur(cuota)}* al mes, sin intereses ni recargos.`
      : null,
    `${entrega > 0 && nCuotas > 0 ? "3" : "2"}. Cada tratamiento se hace cuando su parte ya está pagada. Por eso en el PDF ves *qué se hace cada mes*: no hay sorpresas ni letra pequeña, está el calendario entero.`,
  ].filter(Boolean);
  p.push(`*CÓMO QUEDA*\n${pasos.join("\n")}`);

  if (entrega > 0) {
    const opciones = [
      `• *Con tu dinero*, y entonces no pagas nada de más: ${eur(total)} y ya está.`,
    ];
    if (frag) {
      opciones.push(
        `• *Financiando sólo la entrega* con Frakmenta: ${frag.plazo} cuotas`
        + (frag.plazo > 1
          ? ` (la primera de ${eur(frag.primera)} y el resto de ${eur(frag.base)})`
          : ` de ${eur(frag.primera)}`)
        + `, con una comisión única de *${eur(frag.comision)}*. Nada más.`
      );
      opciones.push(`Fíjate en el detalle: esos ${eur(frag.comision)} son por financiar la entrega, no el tratamiento. Ahí está la diferencia con financiar los ${eur(total)} enteros.`);
    } else {
      opciones.push(`• *Financiando sólo la entrega* con Frakmenta, que es muy económica y cubre nada más que esa parte, no el tratamiento. Si te interesa te paso las cuotas exactas.`);
    }
    p.push(`*LA ENTREGA, COMO TE VENGA MEJOR*\n${opciones.join("\n")}`);
  }

  p.push(`Échale un vistazo con calma y me dices. Si hace falta movemos el reparto de los meses o el importe de las cuotas hasta que te encaje.`);
  p.push(`Un saludo, ${nombre}.`);

  return p.join("\n\n");
}
