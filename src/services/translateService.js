const API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY;
const API_URL = "https://translation.googleapis.com/language/translate/v2";

// Función auxiliar para decodificar entidades HTML como &#39; -> '
function decodeHtmlEntities(text) {
  if (!text) return text;
  return text.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  }).replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
}

export async function traducirTexto(text, targetLang, sourceLang = "") {
  if (!text || !targetLang) {
    console.error("Faltan parámetros:", { text, targetLang });
    return `[ERROR] ${text || ""}`;
  }

  if (!API_KEY) {
    console.warn("API Key no configurada");
    return `[SIMULADO] ${text}`;
  }

  try {
    const encodedText = encodeURIComponent(text);
    
    let url = `${API_URL}?key=${API_KEY}&q=${encodedText}&target=${targetLang}`;
    if (sourceLang && sourceLang !== "auto") {
      const cleanSourceLang = sourceLang.split("-")[0];
      url += `&source=${cleanSourceLang}`;
    }
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error HTTP:", response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (data.data && data.data.translations && data.data.translations[0]) {
      let translated = data.data.translations[0].translatedText;
      // Decodificar entidades HTML
      translated = decodeHtmlEntities(translated);
      return translated;
    } else {
      throw new Error("Respuesta inesperada de la API");
    }
  } catch (error) {
    console.error("Error en traducirTexto:", error);
    return `[ERROR: ${text}]`;
  }
}

export async function traducirConDeteccion(text, targetLang) {
  if (!text || !targetLang) {
    return { texto: text, idiomaDetectado: "unknown" };
  }

  if (!API_KEY) {
    return { texto: `[SIMULADO] ${text}`, idiomaDetectado: "unknown" };
  }

  try {
    const encodedText = encodeURIComponent(text);
    const url = `${API_URL}?key=${API_KEY}&q=${encodedText}&target=${targetLang}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    
    if (data.data && data.data.translations && data.data.translations[0]) {
      let translated = data.data.translations[0].translatedText;
      translated = decodeHtmlEntities(translated);
      const idiomaDetectado = data.data.translations[0].detectedSourceLanguage || "unknown";
      return {
        texto: translated,
        idiomaDetectado: idiomaDetectado
      };
    } else {
      throw new Error("Respuesta inesperada");
    }
  } catch (error) {
    console.error("Error en traducirConDeteccion:", error);
    return { texto: `[ERROR] ${text}`, idiomaDetectado: "unknown" };
  }
}