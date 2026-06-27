import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'crypto';
import { SignalingMessage } from 'shared-types';

const wss = new WebSocketServer({ port: 8080 });

interface Room {
    host: WebSocket;
    guest?: WebSocket;
}

const rooms = new Map<string, Room>();

function generateRoomId(): string {
    return randomBytes(3).toString('hex').toUpperCase(); // Ej: "A1B2C3"
}

wss.on('connection', (ws: WebSocket) => {
    let currentRoomId: string | null = null;

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

                // Relay WebRTC messages (Offer, Answer, ICE candidates)
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

console.log('Signaling Server iniciado en puerto 8080');