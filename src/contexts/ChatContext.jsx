import { createContext, useContext, useState } from "react";
import { reconocerVozDirecta } from "../services/speechService";
import { traducirTexto, traducirConDeteccion } from "../services/translateService";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [mensajes, setMensajes] = useState([]);
  const [pacienteActualId, setPacienteActualId] = useState(null);
  const [idiomaGlobal, setIdiomaGlobal] = useState("es");
  const [grabando, setGrabando] = useState(false);

  const hablarPaciente = async () => {
    if (grabando) return;
    setGrabando(true);
    try {
      const resultado = await reconocerVozDirecta("fr-FR");
      const { texto: textoTraducido, idiomaDetectado } = await traducirConDeteccion(resultado.texto, "es");
      setMensajes(prev => [...prev, {
        rol: "paciente",
        texto_original: resultado.texto,
        texto_traducido: textoTraducido,
        idioma_detectado: idiomaDetectado,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      if (err?.message !== "no-speech") {
        console.error("Error hablarPaciente:", err);
      }
    } finally {
      setGrabando(false);
    }
  };

  const hablarAsesor = async () => {
    if (grabando) return;
    setGrabando(true);
    try {
      const resultado = await reconocerVozDirecta("es-ES");
      const textoTraducido = await traducirTexto(resultado.texto, idiomaGlobal, "es");
      setMensajes(prev => [...prev, {
        rol: "asesor",
        texto_original: resultado.texto,
        texto_traducido: textoTraducido,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      if (err?.message !== "no-speech") {
        console.error("Error hablarAsesor:", err);
      }
    } finally {
      setGrabando(false);
    }
  };

  return (
    <ChatContext.Provider value={{
      mensajes,
      pacienteActualId,
      setPacienteActualId,
      idiomaGlobal,
      setIdiomaGlobal,
      grabando,
      hablarPaciente,
      hablarAsesor,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat debe usarse dentro de <ChatProvider>");
  return ctx;
}
