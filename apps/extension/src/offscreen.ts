/**
 * offscreen.ts - Motor de audio y WebRTC (Optimizado y Limpio)
 */

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let iceQueue: RTCIceCandidateInit[] = [];

let remoteAudioElement: HTMLAudioElement | null = null;
let localAudioContext: AudioContext | null = null;

chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
        case 'START_CAPTURE':
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            captureAudio(message.streamId).catch(console.error);
            break;

        case 'START_WEBRTC_OFFER':
            createAndSendOffer().catch(console.error);
            break;

        case 'FROM_WS_TO_OFFSCREEN':
            handleSignaling(message.payload).catch(console.error);
            break;
            
        case 'RESET_AUDIO':
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            if (peerConnection) {
                peerConnection.getSenders().forEach(sender => peerConnection!.removeTrack(sender));
                peerConnection.close();
                peerConnection = null;
            }
            if (remoteAudioElement) {
                remoteAudioElement.pause();
                remoteAudioElement.srcObject = null;
                remoteAudioElement.remove(); 
            }
            iceQueue = [];
            console.log('🧹 Motor de audio reseteado limpiamente.');
            break;
    }
    return false;
});

async function captureAudio(streamId: string) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            } as any,
            video: false
        });
        
        localStream.getTracks().forEach(track => { track.enabled = true; });

        localAudioContext = new AudioContext();
        const localSource = localAudioContext.createMediaStreamSource(localStream);
        localSource.connect(localAudioContext.destination);
        console.log('🎤 Audio capturado y devuelto a los altavoces locales.');
        
    } catch (error) {
        console.error('❌ Error capturando:', error);
    }
}

function setupPeerConnection() {
    if (peerConnection) {
        peerConnection.getSenders().forEach(s => peerConnection!.removeTrack(s));
        peerConnection.close();
    }
    iceQueue = []; 

    peerConnection = new RTCPeerConnection({ 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ] 
    });

    // Añadimos solo la pista real, sin transceivers fantasmas
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection!.addTrack(track, localStream!);
        });
        console.log('✅ Pistas de audio inyectadas en WebRTC.');
    }

    peerConnection.ontrack = (event) => {
        console.log('🎵 ¡Audio remoto recibido! Ensamblando reproductor...');
        
        remoteAudioElement = document.createElement('audio');
        remoteAudioElement.srcObject = event.streams[0];
        remoteAudioElement.autoplay = true;
        document.body.appendChild(remoteAudioElement); 
        
        remoteAudioElement.play().then(() => {
            console.log('🔊 Reproducción remota iniciada con éxito en HTML5.');
        }).catch(e => {
            console.error('⚠️ Bloqueo HTML5 detectado. Intentando Web Audio API...', e);
            const audioCtx = new AudioContext();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const source = audioCtx.createMediaStreamSource(event.streams[0]);
            source.connect(audioCtx.destination);
            console.log('🔊 Web Audio API conectado.');
        });
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('📦 Enviando coordenada de red (ICE Candidate)');
            chrome.runtime.sendMessage({ 
                type: 'FORWARD_TO_WS', 
                payload: { type: 'webrtc_ice_candidate', payload: event.candidate } 
            });
        }
    };
}

async function createAndSendOffer() {
    setupPeerConnection();
    
    const offer = await peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
    });
    
    await peerConnection!.setLocalDescription(offer);
    console.log('🚀 Oferta WebRTC creada y enviada.');
    
    chrome.runtime.sendMessage({ 
        type: 'FORWARD_TO_WS', 
        payload: { type: 'webrtc_offer', payload: peerConnection!.localDescription } 
    });
}

async function handleSignaling(data: any) {
    console.log(`📡 Señal WebRTC recibida del servidor: ${data.type}`);
    
    if (!peerConnection) setupPeerConnection();

    switch (data.type) {
        case 'webrtc_offer':
            await peerConnection!.setRemoteDescription(new RTCSessionDescription(data.payload));
            const answer = await peerConnection!.createAnswer();
            await peerConnection!.setLocalDescription(answer);
            chrome.runtime.sendMessage({ 
                type: 'FORWARD_TO_WS', 
                payload: { type: 'webrtc_answer', payload: peerConnection!.localDescription } 
            });
            console.log('📨 Respuesta WebRTC (Answer) enviada.');
            procesarColaIce();
            break;

        case 'webrtc_answer':
            await peerConnection!.setRemoteDescription(new RTCSessionDescription(data.payload));
            console.log('🤝 Conexión WebRTC establecida con la respuesta.');
            procesarColaIce();
            break;

        case 'webrtc_ice_candidate':
            if (peerConnection!.remoteDescription) {
                await peerConnection!.addIceCandidate(new RTCIceCandidate(data.payload)).catch(console.error);
            } else {
                iceQueue.push(data.payload);
            }
            break;
    }
}

function procesarColaIce() {
    while (iceQueue.length > 0) {
        const candidate = iceQueue.shift();
        if (candidate) {
            peerConnection!.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
        }
    }
}