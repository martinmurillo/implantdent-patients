let stream = null;

export async function pedirPermisoMicrofono() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch (error) {
    console.error("Error al acceder al micrófono:", error);
    return false;
  }
}

export function reconocerVozDirecta(idioma = "") {
  return new Promise((resolve, reject) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      reject(new Error("Este navegador no soporta reconocimiento de voz"));
      return;
    }

    const rec = new SpeechRecognition();
    // continuous = false: el reconocimiento para solo una vez, sin acumulación de resultados
    // interimResults = false: solo resultados finales, sin parciales
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = idioma;

    let settled = false;
    let timeoutId = null;

    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(value);
    };

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    };

    rec.onresult = (event) => {
      // Usar event.resultIndex para procesar solo los resultados NUEVOS
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript.trim()) {
        resolveOnce({
          texto: transcript.trim(),
          idioma: idioma.split("-")[0] || "es"
        });
      }
    };

    rec.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        rejectOnce(new Error("no-speech"));
      } else {
        rejectOnce(new Error(`Error: ${event.error}`));
      }
    };

    rec.onend = () => {
      // Si terminó sin haber resuelto, no había voz detectada
      rejectOnce(new Error("no-speech"));
    };

    // Timeout de seguridad: 12 segundos máximo por si el reconocimiento se queda colgado
    timeoutId = setTimeout(() => {
      try { rec.stop(); } catch (e) {}
      rejectOnce(new Error("no-speech"));
    }, 12000);

    try {
      rec.start();
    } catch (e) {
      rejectOnce(e);
    }
  });
}
