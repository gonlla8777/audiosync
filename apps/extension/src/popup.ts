console.log('Control Remoto Retro Iniciado');

const btnHost = document.getElementById('btnHost') as HTMLButtonElement;
const btnGuest = document.getElementById('btnGuest') as HTMLButtonElement;
const statusDiv = document.getElementById('status');
const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;
const btnRestart = document.getElementById('btnRestart');

// --- NUEVO: Recuperación de estado al abrir el popup ---
chrome.runtime.sendMessage({ type: 'GET_APP_STATE' }, (state) => {
    if (state && state.mode !== 'IDLE') {
        if (state.mode === 'HOSTING') {
            if (statusDiv) statusDiv.innerText = 'COMPARTIENDO';
        } else if (state.mode === 'GUESTING') {
            if (statusDiv) statusDiv.innerText = 'ESCUCHANDO 🎵';
        }
        
        // Bloqueamos los botones para evitar dobles conexiones
        if (roomCodeInput) roomCodeInput.value = state.roomId;
        if (btnHost) btnHost.disabled = true;
        if (btnGuest) btnGuest.disabled = true;
    }
});
// --------------------------------------------------------

btnHost?.addEventListener('click', () => {
    btnHost.disabled = true;
    if (btnGuest) btnGuest.disabled = true;
    if (statusDiv) statusDiv.innerText = 'INICIANDO HOST...';
    chrome.runtime.sendMessage({ type: 'POPUP_START_HOST' });
});

btnGuest?.addEventListener('click', () => {
    const code = roomCodeInput?.value.trim().toUpperCase();
    if (!code) {
        if (statusDiv) statusDiv.innerText = 'FALTA CÓDIGO';
        return;
    }
    btnGuest.disabled = true;
    if (btnHost) btnHost.disabled = true;
    if (statusDiv) statusDiv.innerText = `CONECTANDO A: ${code}`;
    chrome.runtime.sendMessage({ type: 'POPUP_START_GUEST', roomId: code });
});

btnRestart?.addEventListener('click', () => {
    if (statusDiv) statusDiv.innerText = 'REINICIANDO...';
    chrome.runtime.sendMessage({ type: 'POPUP_RESTART' });
    
    setTimeout(() => {
        if (statusDiv) statusDiv.innerText = 'LISTO PARA CONECTAR';
        if (btnHost) btnHost.disabled = false;
        if (btnGuest) btnGuest.disabled = false;
        if (roomCodeInput) roomCodeInput.value = '';
    }, 2000);
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