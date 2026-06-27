let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'START_CAPTURE') {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        captureAudio(message.streamId).catch(console.error);
    } else if (message.type === 'START_WEBRTC_OFFER') {
        createAndSendOffer().catch(console.error);
    } else if (message.type === 'FROM_WS_TO_OFFSCREEN') {
        const data = message.payload;
        if (data.type === 'webrtc_offer') {
            handleOffer(data.payload).catch(console.error);
        } else if (data.type === 'webrtc_answer' && peerConnection) {
            peerConnection.setRemoteDescription(new RTCSessionDescription(data.payload)).catch(console.error);
        } else if (data.type === 'webrtc_ice_candidate' && peerConnection) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.payload)).catch(console.error);
        }
    }
    return false;
});

async function captureAudio(streamId: string) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as any,
            video: false
        });
        console.log('🎤 Audio capturado listo para el tubo.');
        
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(audioContext.destination);
    } catch (error) {
        console.error('❌ Error capturando:', error);
    }
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection!.addTrack(track, localStream!));
    }

    peerConnection.ontrack = (event) => {
        console.log('🎵 ¡Música entrante mezclándose!');
        const audioElement = new Audio();
        audioElement.srcObject = event.streams[0];
        audioElement.play().catch(e => console.error('Error audio:', e));
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) chrome.runtime.sendMessage({ type: 'FORWARD_TO_WS', payload: { type: 'webrtc_ice_candidate', payload: event.candidate } });
    };
}

async function createAndSendOffer() {
    setupPeerConnection();
    const offer = await peerConnection!.createOffer();
    await peerConnection!.setLocalDescription(offer);
    chrome.runtime.sendMessage({ type: 'FORWARD_TO_WS', payload: { type: 'webrtc_offer', payload: peerConnection!.localDescription } });
}

async function handleOffer(offer: RTCSessionDescriptionInit) {
    setupPeerConnection();
    await peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection!.createAnswer();
    await peerConnection!.setLocalDescription(answer);
    chrome.runtime.sendMessage({ type: 'FORWARD_TO_WS', payload: { type: 'webrtc_answer', payload: peerConnection!.localDescription } });
}