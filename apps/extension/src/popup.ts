console.log('Control Remoto Retro Iniciado');

const btnHost = document.getElementById('btnHost') as HTMLButtonElement;
const btnGuest = document.getElementById('btnGuest') as HTMLButtonElement;
const statusDiv = document.getElementById('status');
const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;
const btnRestart = document.getElementById('btnRestart');

btnHost?.addEventListener('click', () => {
    btnHost.disabled = true; // Botón de pánico: bloquea clics dobles
    if (statusDiv) statusDiv.innerText = 'INICIANDO HOST...';
    chrome.runtime.sendMessage({ type: 'POPUP_START_HOST' });
});

btnGuest?.addEventListener('click', () => {
    const code = roomCodeInput?.value.trim().toUpperCase();
    if (!code) {
        if (statusDiv) statusDiv.innerText = 'FALTA CÓDIGO';
        return;
    }
    btnGuest.disabled = true; // Botón de pánico
    if (statusDiv) statusDiv.innerText = `CONECTANDO A: ${code}`;
    chrome.runtime.sendMessage({ type: 'POPUP_START_GUEST', roomId: code });
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'ROOM_CREATED_UPDATE_UI' && statusDiv && roomCodeInput) {
        statusDiv.innerText = 'COMPARTIENDO';
        roomCodeInput.value = message.roomId;
    }
    
    if (message.type === 'GUEST_JOINED_UPDATE_UI' && statusDiv) {
        statusDiv.innerText = 'ESCUCHANDO 🎵';
    }
});



btnRestart?.addEventListener('click', () => {
    statusDiv!.innerText = 'REINICIANDO...';
    // Enviamos la orden al background
    chrome.runtime.sendMessage({ type: 'POPUP_RESTART' });
    
    // Pequeña espera para que reconecte
    setTimeout(() => {
        statusDiv!.innerText = 'LISTO PARA HOST';
        (btnHost as HTMLButtonElement).disabled = false;
    }, 2000);
});