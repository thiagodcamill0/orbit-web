// ─── Chat MVP ─────────────────────────────────────────────────────────────────

const AGENT_GIF = 'assets/images/robot-idle.gif';

const MOCK_RESPONSES = [
    'Entendido. Vou processar sua solicitação.',
    'Analisando os dados disponíveis...',
    'Posso ajudar com isso. Me dê mais detalhes.',
    'Tarefa recebida. Iniciando execução.',
    'Verificando com os subagentes antes de responder.',
    'Solicitação processada com sucesso.',
    'Preciso de mais contexto para continuar.',
    'Pronto. O que mais posso fazer?',
];

const AGENTS = [
    { id: 'a1', name: 'Agente Principal',  role: 'Orquestrador',      gif: AGENT_GIF },
    { id: 'a2', name: 'Agente Analítico',  role: 'Análise de dados',   gif: AGENT_GIF },
    { id: 'a3', name: 'Agente de Suporte', role: 'Atendimento',        gif: AGENT_GIF },
];

// ─── State ────────────────────────────────────────────────────────────────────

let activeAgent  = null;
let activeItem   = null;
let msgCount     = 0;
let isTyping     = false;

// ─── Elements ─────────────────────────────────────────────────────────────────

const listBody    = document.getElementById('chatListBody');
const emptyView   = document.getElementById('chatEmptyView');
const convView    = document.getElementById('chatConvView');
const messagesEl  = document.getElementById('chatMessages');
const inputEl     = document.getElementById('chatInput');
const sendBtn     = document.getElementById('chatSendBtn');
const headerName  = document.getElementById('chatHeaderName');
const headerAvatar= document.getElementById('chatHeaderAvatar');

// ─── List ─────────────────────────────────────────────────────────────────────

function renderList() {
    listBody.innerHTML = '';
    AGENTS.forEach(agent => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.dataset.agentId = agent.id;
        item.innerHTML = `
            <div class="chat-item-avatar">
                <img src="${agent.gif}" alt="" />
            </div>
            <div class="chat-item-body">
                <div class="chat-item-name">${escapeHtml(agent.name)}</div>
                <div class="chat-item-role">${escapeHtml(agent.role)}</div>
            </div>
        `;
        item.addEventListener('click', () => openChat(agent, item));
        listBody.appendChild(item);
    });
}

// ─── Open chat ────────────────────────────────────────────────────────────────

function openChat(agent, itemEl) {
    // Active state na lista
    if (activeItem) activeItem.classList.remove('active');
    itemEl.classList.add('active');
    activeItem = itemEl;

    const isNew = !activeAgent || activeAgent.id !== agent.id;
    activeAgent = agent;

    if (isNew) {
        msgCount  = 0;
        isTyping  = false;
        messagesEl.innerHTML = '';
        inputEl.value        = '';
        inputEl.style.height = 'auto';
        sendBtn.disabled     = false;
    }

    headerName.textContent = agent.name;
    headerAvatar.src       = agent.gif;

    emptyView.classList.add('hidden');
    convView.classList.remove('hidden');

    inputEl.focus();
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function now() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(text, sender) {
    if (msgCount === 0) {
        const sep = document.createElement('div');
        sep.className = 'chat-date-sep';
        sep.innerHTML = '<span>Hoje</span>';
        messagesEl.appendChild(sep);
    }
    msgCount++;

    const row = document.createElement('div');
    row.className = `msg ${sender}`;
    row.innerHTML = `
        <div class="msg-bubble">${escapeHtml(text)}</div>
        <span class="msg-time">${now()}</span>
    `;
    messagesEl.appendChild(row);
    scrollBottom();
}

function showTyping() {
    isTyping = true;
    sendBtn.disabled = true;
    const el = document.createElement('div');
    el.className = 'msg agent';
    el.id = 'typingRow';
    el.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    messagesEl.appendChild(el);
    scrollBottom();
}

function hideTyping() {
    const el = document.getElementById('typingRow');
    if (el) el.remove();
    isTyping = false;
    sendBtn.disabled = false;
    inputEl.focus();
}

function agentReply() {
    const delay = 900 + Math.random() * 800;
    showTyping();
    setTimeout(() => {
        hideTyping();
        const text = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
        addMessage(text, 'agent');
    }, delay);
}

function send() {
    const text = inputEl.value.trim();
    if (!text || isTyping) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    addMessage(text, 'user');
    agentReply();
}

// ─── Events ───────────────────────────────────────────────────────────────────

sendBtn.addEventListener('click', send);

inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`;
});

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', renderList);

// ─── Util ─────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}
