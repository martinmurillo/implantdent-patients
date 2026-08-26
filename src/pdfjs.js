// Carga pdf.js desde CDN una sola vez y la reparte entre los dos lectores
// de PDF del proyecto (el import de presupuestos y el del plan de pago).
// Todo el procesamiento es en el navegador: los PDFs traen nombre, DNI y
// dirección del paciente y no deben salir del cliente.
const CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

let pending = null;

export const loadPdfJs = () => {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pending) return pending;
  pending = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = `${CDN}/pdf.min.js`;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN}/pdf.worker.min.js`;
      resolve(window.pdfjsLib);
    };
    document.head.appendChild(s);
  });
  return pending;
};
