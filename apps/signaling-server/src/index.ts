import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'crypto';
import { SignalingMessage } from 'shared-types';

// CAMBIO CRÍTICO: Usar el puerto que asigna Render (process.env.PORT)
const PORT = parseInt(process.env.PORT || '8080');

// CAMBIO CRÍTICO: Escuchar en '0.0.0.0' para aceptar conexiones externas
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

interface Room {
    host: WebSocket;
    guest?: WebSocket;
}

const rooms = new Map<string, Room>();

// Añadimos un pequeño Heartbeat para que Render no "duerma" la conexión
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    });
}, 30000);

function generateRoomId(): string {
    return randomBytes(3).toString('hex').toUpperCase();
}

wss.on('connection', (ws: WebSocket) => {
    let currentRoomId: string | null = null;
    console.log('✅ Cliente conectado');

    ws.on('message', (data: string) => {
        try {
            const message: SignalingMessage = JSON.parse(data);

            switch (message.type) {
                case 'create_room':
                    currentRoomId = generateRoomId();
                    rooms.set(currentRoomId, { host: ws });
                    ws.send(JSON.stringify({ type: 'room_created', roomId: currentRoomId }));
                    console.log(`Sala creada: ${currentRoomId}`);
                    break;

                case 'join_room':
                    const room = rooms.get(message.roomId);
                    if (room && !room.guest) {
                        room.guest = ws;
                        currentRoomId = message.roomId;
                        ws.send(JSON.stringify({ type: 'joined' }));
                        room.host.send(JSON.stringify({ type: 'guest_joined' }));
                        console.log(`Invitado unido a: ${currentRoomId}`);
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Sala llena o no existe' }));
                    }
                    break;

                case 'webrtc_offer':
                case 'webrtc_answer':
                case 'webrtc_ice_candidate':
                    if (currentRoomId) {
                        const targetRoom = rooms.get(currentRoomId);
                        if (targetRoom) {
                            const targetWs = ws === targetRoom.host ? targetRoom.guest : targetRoom.host;
                            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                                targetWs.send(JSON.stringify(message));
                            }
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error parseando mensaje:', error);
        }
    });

    ws.on('close', () => {
        if (currentRoomId) {
            rooms.delete(currentRoomId);
            console.log(`Sala eliminada: ${currentRoomId}`);
        }
    });
});

console.log(`Signaling Server iniciado en puerto ${PORT}`);