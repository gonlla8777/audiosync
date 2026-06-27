import { useState, useEffect, useRef } from 'react';
import type { SignalingMessage } from 'shared-types';


export default function App() {
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState('Desconectado');
  const ws = useRef<WebSocket | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

useEffect(() => {
    // Evitar múltiples conexiones por el Strict Mode de React
    if (ws.current) return;

    // 1. Conectar al servidor de señalización
    const socket = new WebSocket('ws://localhost:8080');
    ws.current = socket;
    
    socket.onopen = () => setStatus('Conectado al servidor. Esperando unirse a una sala...');
    
    socket.onmessage = async (event) => {
      const message: SignalingMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'joined':
          setStatus('¡Unido a la sala! Esperando audio del Host...');
          break;
          
        case 'webrtc_offer':
          setStatus('Recibiendo flujo de audio...');
          
          // Crear la conexión WebRTC
          peerConnection.current = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });

          // Cuando llegue el audio, reproducirlo
          peerConnection.current.ontrack = (event) => {
            if (audioRef.current && event.streams[0]) {
              audioRef.current.srcObject = event.streams[0];
              setStatus('¡Escuchando audio en tiempo real!');
            }
          };

          // Enviar nuestros propios ICE candidates al Host
          peerConnection.current.onicecandidate = (event) => {
            if (event.candidate && ws.current && ws.current.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({
                type: 'webrtc_ice_candidate',
                payload: event.candidate
              }));
            }
          };

          // Procesar la Oferta del Host y responder
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.payload));
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({
                type: 'webrtc_answer',
                payload: peerConnection.current.localDescription
              }));
          }
          break;

        case 'webrtc_ice_candidate':
          if (peerConnection.current) {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(message.payload));
          }
          break;
      }
    };

    // No cerramos la conexión inmediatamente en cleanup para evitar problemas con Strict Mode
    return () => {
       // Opcionalmente, puedes manejar el cierre aquí si es estrictamente necesario, 
       // pero para este MVP en desarrollo, dejarlo abierto evita el error.
    };
  }, []);

  const joinRoom = () => {
    if (ws.current && roomId) {
      ws.current.send(JSON.stringify({ type: 'join_room', roomId }));
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>AudioSync - Invitado</h1>
      <p><strong>Estado:</strong> {status}</p>
      
      <div style={{ marginTop: '1rem' }}>
        <input 
          type="text" 
          placeholder="Código de la sala" 
          value={roomId} 
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          style={{ padding: '0.5rem', marginRight: '0.5rem' }}
        />
        <button onClick={joinRoom} style={{ padding: '0.5rem 1rem' }}>
          Unirse a la sala
        </button>
      </div>

      {/* Reproductor de audio (invisible pero activo) */}
      <audio ref={audioRef} autoPlay />
    </div>
  );
}