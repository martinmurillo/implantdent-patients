"use client";
import { useState, useRef, useEffect } from "react";
import { useChat } from "../contexts/ChatContext";

export default function ChatFloat() {
  const [abierto, setAbierto] = useState(false);
  const { mensajes, grabando, hablarPaciente, hablarAsesor, pacienteActualId } = useChat();
  
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [mensajes]);

  const formatearHora = (timestamp) => {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const obtenerTextoGrande = (msg) => {
    if (msg.rol === "paciente") return msg.texto_original;
    return msg.texto_traducido || msg.texto_original;
  };

  const obtenerTextoPequeno = (msg) => {
    if (msg.rol === "paciente") return msg.texto_traducido;
    return msg.texto_original;
  };

  return (
    <>
      <button
        onClick={() => setAbierto(!abierto)}
        className="fixed bottom-4 right-4 bg-blue-600 text-white rounded-full w-14 h-14 shadow-lg hover:bg-blue-700 transition-all z-50 flex items-center justify-center text-2xl"
      >
        💬
      </button>

      {abierto && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[75vw] h-[75vh] bg-gray-900 rounded-xl shadow-2xl flex flex-col z-50 border border-gray-700 overflow-hidden">
          <div className="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
            <h3 className="font-bold text-white">
              Chat {pacienteActualId ? "con paciente" : "(sin paciente)"}
            </h3>
            <button onClick={() => setAbierto(false)} className="text-gray-400 hover:text-white text-xl">✖</button>
          </div>

          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {!pacienteActualId ? (
              <p className="text-gray-400 text-center mt-10">Selecciona o crea un paciente</p>
            ) : mensajes.length === 0 ? (
              <p className="text-gray-400 text-center mt-10">Pulsa un botón para empezar a hablar</p>
            ) : (
              mensajes.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.rol === "paciente" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg ${
                    msg.rol === "paciente" 
                      ? "bg-blue-600 text-white rounded-br-none" 
                      : "bg-gray-700 text-white rounded-bl-none"
                  }`}>
                    <p className="text-sm" style={{ fontSize: "14px" }}>
                      {obtenerTextoGrande(msg)}
                    </p>
                    {obtenerTextoPequeno(msg) && (
                      <p className="font-bold text-gray-300 mt-2" style={{ fontSize: "10px" }}>
                        ({obtenerTextoPequeno(msg)})
                      </p>
                    )}
                    <p className="text-[9px] text-gray-400 mt-2 text-right">
                      {formatearHora(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
            {grabando && (
              <div className="flex justify-center">
                <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm animate-pulse">
                  🎤 Grabando... (3s silencio = fin)
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-800 p-4 border-t border-gray-700">
            <div className="flex gap-3">
              <button 
                onClick={hablarPaciente}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-2 rounded-lg font-bold transition-all active:scale-95 text-base"
                style={{ touchAction: "manipulation", userSelect: "none" }}
              >
                🎤 Paciente (Francés)
              </button>
              <button 
                onClick={hablarAsesor}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 px-2 rounded-lg font-bold transition-all active:scale-95 text-base"
                style={{ touchAction: "manipulation", userSelect: "none" }}
              >
                👨‍⚕️ Asesor (Español)
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">
              🔴 Pulsa una vez para grabar → se detiene tras gundos de silencio
            </p>
          </div>
        </div>
      )}
    </>
  );
}