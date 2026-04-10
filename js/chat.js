// ─── chat.js ─────────────────────────────────────────────────────────────────
// Etapa 5 — Conversations + Messages conectados ao Supabase.
// Mock assistant response isolada em mockAssistantResponse() para swap futuro
// por Edge Function real.
// ─────────────────────────────────────────────────────────────────────────────

(function () {

  // ─── State ──────────────────────────────────────────────────────────────────
  let workspaceId  = null;
  let activeConvId = null;
  let activeAgent  = null;
  let sending      = false;

  // ─── DOM refs ───────────────────────────────────────────────────────────────
  const listBody     = document.getElementById('chatListBody');
  const emptyView    = document.getElementById('chatEmptyView');
  const convView     = document.getElementById('chatConvView');
  const headerAvatar = document.getElementById('chatHeaderAvatar');
  const headerName   = document.getElementById('chatHeaderName');
  const messagesEl   = document.getElementById('chatMessages');
  const inputEl      = document.getElementById('chatInput');
  const sendBtn      = document.getElementById('chatSendBtn');

  // ─── Init ───────────────────────────────────────────────────────────────────
  document.addEventListener('orbitSessionReady', async () => {
    workspaceId = OrbitSession.workspaceId;
    bindInput();
    await loadAgents();
  });

  // ─── Load agents from DB ────────────────────────────────────────────────────
  async function loadAgents() {
    const { data, error } = await db
      .from('agents')
      .select('id, name, model_id')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) { console.error('chat: loadAgents error', error); return; }

    const agents = data ?? [];
    listBody.innerHTML = '';

    if (agents.length === 0) {
      listBody.innerHTML = '<div style="padding:20px 16px;font-size:12px;color:var(--text-muted)">Nenhum agente criado ainda.</div>';
      return;
    }

    agents.forEach(agent => {
      listBody.appendChild(buildAgentItem(agent));
    });
  }

  function buildAgentItem(agent) {
    const el = document.createElement('div');
    el.className = 'chat-item';
    el.dataset.agentId = agent.id;
    el.innerHTML =
      '<div class="chat-item-avatar"><img src="assets/images/robot-idle.gif" alt="" /></div>' +
      '<div class="chat-item-body">' +
        '<span class="chat-item-name">' + escHtml(agent.name) + '</span>' +
        '<span class="chat-item-role">' + escHtml(agent.model_id ?? '') + '</span>' +
      '</div>';
    el.addEventListener('click', () => openConversation(agent, el));
    return el;
  }

  // ─── Open / create conversation ─────────────────────────────────────────────
  async function openConversation(agent, itemEl) {
    listBody.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
    itemEl.classList.add('active');

    activeAgent = agent;
    headerAvatar.src = 'assets/images/robot-idle.gif';
    headerName.textContent = agent.name;

    emptyView.classList.add('hidden');
    convView.classList.remove('hidden');
    messagesEl.innerHTML = '';

    const convId = await getOrCreateConversation(agent.id);
    if (!convId) return;

    activeConvId = convId;
    await loadMessages(convId);
  }

  async function getOrCreateConversation(agentId) {
    // Load most recent active conversation for this agent
    const { data, error } = await db
      .from('conversations')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .eq('agent_id', agentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) { console.error('chat: getConversation error', error); return null; }

    // Reuse if active; create new if none or limit_reached
    if (data && data.status === 'active') return data.id;

    const { data: created, error: insertErr } = await db
      .from('conversations')
      .insert({ workspace_id: workspaceId, agent_id: agentId, status: 'active' })
      .select('id')
      .single();

    if (insertErr) { console.error('chat: createConversation error', insertErr); return null; }
    return created.id;
  }

  // ─── Load messages ───────────────────────────────────────────────────────────
  async function loadMessages(convId) {
    const { data, error } = await db
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (error) { console.error('chat: loadMessages error', error); return; }

    messagesEl.innerHTML = '';
    let lastDateLabel = null;

    (data ?? []).forEach(msg => {
      const d = new Date(msg.created_at);
      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
      if (label !== lastDateLabel) {
        messagesEl.appendChild(buildDateSep(label));
        lastDateLabel = label;
      }
      messagesEl.appendChild(buildBubble(msg.role, msg.content, d));
    });

    scrollToBottom();
  }

  // ─── Send message ────────────────────────────────────────────────────────────
  function bindInput() {
    sendBtn.addEventListener('click', handleSend);

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });
  }

  async function handleSend() {
    if (sending || !activeConvId) return;
    const content = inputEl.value.trim();
    if (!content) return;

    sending = true;
    sendBtn.disabled = true;
    inputEl.value = '';
    inputEl.style.height = 'auto';

    // Render user bubble immediately (optimistic)
    messagesEl.appendChild(buildBubble('user', content, new Date()));
    scrollToBottom();

    // Persist user message
    const { error } = await db.from('messages').insert({
      conversation_id: activeConvId,
      workspace_id:    workspaceId,
      role:            'user',
      content,
    });

    if (error) {
      console.error('chat: sendMessage error', error);
      sending = false;
      sendBtn.disabled = false;
      return;
    }

    // Assistant response (mock — swap for Edge Function call)
    await mockAssistantResponse(activeConvId, content);

    sending = false;
    sendBtn.disabled = false;
  }

  // ─── Mock assistant response ─────────────────────────────────────────────────
  // VISUAL ONLY — não persiste no banco.
  // RLS permite INSERT de 'assistant' apenas via service role / Edge Function.
  //
  // Para integrar Edge Function:
  //   1. Remover este mock
  //   2. Chamar: await callAssistantEdgeFunction(convId, workspaceId, userMessage)
  //   3. A Edge Function insere no banco com service role e retorna o conteúdo
  //   4. Renderizar aqui com buildBubble('assistant', reply, new Date())
  async function mockAssistantResponse(_convId, userMessage) {
    const typing = buildTypingIndicator();
    messagesEl.appendChild(typing);
    scrollToBottom();

    await sleep(900 + Math.random() * 600);
    typing.remove();

    const preview = userMessage.length > 80
      ? userMessage.slice(0, 80) + '...'
      : userMessage;
    const reply = 'Recebi: "' + preview + '". [Mock visual — resposta real via Edge Function em breve.]';

    // Apenas render visual; persistência de mensagens assistant é responsabilidade do backend.
    messagesEl.appendChild(buildBubble('assistant', reply, new Date()));
    scrollToBottom();
  }

  // ─── DOM builders ────────────────────────────────────────────────────────────
  function buildBubble(role, content, date) {
    const cssRole = role === 'user' ? 'user' : 'agent';
    const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'msg ' + cssRole;
    div.innerHTML =
      '<div class="msg-bubble">' + escHtml(content) + '</div>' +
      '<span class="msg-time">' + timeStr + '</span>';
    return div;
  }

  function buildDateSep(label) {
    const div = document.createElement('div');
    div.className = 'chat-date-sep';
    div.innerHTML = '<span>' + label + '</span>';
    return div;
  }

  function buildTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'msg agent';
    div.innerHTML =
      '<div class="typing-indicator">' +
        '<span class="typing-dot"></span>' +
        '<span class="typing-dot"></span>' +
        '<span class="typing-dot"></span>' +
      '</div>';
    return div;
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────
  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

})();
