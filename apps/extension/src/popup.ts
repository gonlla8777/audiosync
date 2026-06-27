console.log('Control Remoto Retro Iniciado');

const btnHost = document.getElementById('btnHost');
const btnGuest = document.getElementById('btnGuest');
const statusDiv = document.getElementById('status');
const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;

btnHost?.addEventListener('click', () => {
    if (statusDiv) statusDiv.innerText = 'INICIANDO HOST...';
    // Le avisamos al Background que queremos ser Host
    chrome.runtime.sendMessage({ type: 'POPUP_START_HOST' });
});

btnGuest?.addEventListener('click', () => {
    const code = roomCodeInput?.value.trim().toUpperCase();
    if (!code) {
        if (statusDiv) statusDiv.innerText = 'FALTA CÓDIGO';
        return;
    }
    if (statusDiv) statusDiv.innerText = `CONECTANDO A: ${code}`;
    // Le avisamos al Background que queremos ser Guest en una sala específica
    chrome.runtime.sendMessage({ type: 'POPUP_START_GUEST', roomId: code });
});


// Escuchar respuestas del Background
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'ROOM_CREATED_UPDATE_UI' && statusDiv && roomCodeInput) {
        statusDiv.innerText = 'COMPARTIENDO';
        roomCodeInput.value = message.roomId;
    }
    
    // --- NUEVO: Cambiar el texto cuando el Guest se conecta ---
    if (message.type === 'GUEST_JOINED_UPDATE_UI' && statusDiv) {
        statusDiv.innerText = 'ESCUCHANDO 🎵';
    }
});