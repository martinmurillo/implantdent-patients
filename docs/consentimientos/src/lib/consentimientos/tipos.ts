// Modelo de bloques de los consentimientos informados.
//
// Un consentimiento es un array de nodos. El renderizador mapea
// cada tipo de nodo a un componente de react-pdf. No hay HTML
// libre: eso mantiene la maquetación bajo control y hace que el
// contenido sea editable desde la app sin poder romper el PDF.

export type Nodo =
  | { tipo: 'titulo'; texto: string; nivel?: 1 | 2 }
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'lista'; items: string[] }
  | { tipo: 'recuadro'; nodos: Nodo[] }
  // Línea de puntos para rellenar a mano. `lineas` controla el alto.
  | { tipo: 'campo_manual'; etiqueta?: string; lineas?: number }
  // Solo se imprime si el firmante es un representante legal.
  | { tipo: 'bloque_representante'; nodos: Nodo[] }
  | { tipo: 'firmas'; columnas: { etiqueta: string }[] }
  | { tipo: 'salto_pagina' };

export type Bloque = {
  id: string;
  codigo: string;
  version: number;
  titulo: string | null;
  contenido: Nodo[];
  activo: boolean;
  notas: string | null;
};

// Una entrada de composición es o bien una referencia a un bloque
// compartido, o bien contenido propio de esta plantilla.
export type ItemComposicion =
  | { ref: string }            // código de un bloque compartido
  | { nodos: Nodo[] };

export type Plantilla = {
  id: string;
  codigo: string;
  titulo: string;
  version: number;
  idioma: string;
  composicion: ItemComposicion[];
  profesional_por_defecto: string | null;
  pide_piezas: boolean;
  activa: boolean;
};

export type DatosFusion = {
  paciente: {
    nombre: string;
    documento: string;          // DNI, NIE o pasaporte
    fecha_nacimiento: string;   // ISO
    edad: number;
    domicilio: string;
    telefono: string;
    historia_clinica: string;
  };
  profesional: {
    nombre: string;
    colegiado: string;
  };
  clinica: {
    razon_social: string;
    cif: string;
    registro_sanitario: string;
    direccion: string;
    email_dpd: string;
  };
  tratamiento: {
    piezas: string;             // '16, 17' — se escribe a mano si va vacío
  };
  lugar: string;
  fecha: string;                // '2 de septiembre de 2026'
};

export type TipoFirmante = 'paciente' | 'representante';
