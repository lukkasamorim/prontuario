/* ════════════════════════════════════════════════════════════════════════════
   ÂNCORA PSICOLOGIA - APP.JS
   Lógica principal, Banco de Dados (Supabase) e Interações
════════════════════════════════════════════════════════════════════════════ */

// 1. CONFIGURAÇÕES DO SUPABASE
const SUPABASE_URL = 'https://fmfcylptbfxhwljhmune.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xVYJpE_q8CL3ugACHbDcsQ_TAJSyiRN';

const AUTO_LOGIN_EMAIL = 'leticiarosaa10@hotmail.com';
const AUTO_LOGIN_PASSWORD = 'Lucas123*';

// 2. ESTADOS E VARIÁVEIS GLOBAIS
let supa = null;
let currentUser = null;
let db = { patients: [], sessions: {}, appointments: [], payments: {} };
let patientIdByName = {};
let currentPatient = null;
let ibpSelected = false; 

// ════════════════════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO + LOGIN AUTOMÁTICO
// ════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  if (SUPABASE_URL.includes('COLE_AQUI') || SUPABASE_ANON_KEY.includes('COLE_AQUI')) {
    document.getElementById('loadingOverlay').innerHTML =
      '<div class="loading-text" style="max-width:300px;text-align:center;padding:20px">⚠️ Configuração do Supabase pendente.</div>';
    return;
  }
  if (AUTO_LOGIN_EMAIL.includes('COLE_AQUI') || AUTO_LOGIN_PASSWORD.includes('COLE_AQUI')) {
    document.getElementById('loadingOverlay').innerHTML =
      '<div class="loading-text" style="max-width:300px;text-align:center;padding:20px">⚠️ Preencha AUTO_LOGIN_EMAIL e AUTO_LOGIN_PASSWORD no topo do arquivo.</div>';
    return;
  }

  supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: { session } } = await supa.auth.getSession();
  if (session) {
    currentUser = session.user;
    await enterApp();
  } else {
    await doAutoLogin();
  }

  supa.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
  });
});

async function doAutoLogin() {
  const { data, error } = await supa.auth.signInWithPassword({
    email: AUTO_LOGIN_EMAIL,
    password: AUTO_LOGIN_PASSWORD
  });
  if (error) {
    document.getElementById('loadingOverlay').innerHTML =
      '<div class="loading-text" style="max-width:300px;text-align:center;padding:20px">⚠️ Não foi possível entrar automaticamente. Verifique o e-mail/senha configurados.</div>';
    console.error(error);
    return;
  }
  currentUser = data.user;
  await enterApp();
}

async function enterApp() {
  document.getElementById('loadingOverlay').classList.remove('hidden');
  await loadAllData();
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('appRoot').classList.remove('hidden');

  const now = new Date();
  document.getElementById('monthFilter').value =
    `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('fDate').value = now.toISOString().split('T')[0];

  switchTab('dashboard');
}

// ════════════════════════════════════════════════════════════════════════════
//  CARGA DE DADOS DO BANCO
// ════════════════════════════════════════════════════════════════════════════
async function loadAllData() {
  db = { patients: [], sessions: {}, appointments: [], payments: {} };
  patientIdByName = {};

  const { data: patients, error: pErr } = await supa
    .from('patients')
    .select('id, name, birth_date, phone, email, session_value, frequency, captured_by_ibp, status_override')
    .order('name', { ascending: true });

  if (pErr) { showToast('⚠️ Erro ao carregar pacientes'); console.error(pErr); return; }

  patients.forEach(p => {
    db.patients.push({
      name: p.name,
      birthDate: p.birth_date || '',
      phone: p.phone || '',
      email: p.email || '',
      sessionValue: Number(p.session_value) || 0,
      frequency: p.frequency || '',
      capturedByIbp: !!p.captured_by_ibp,
      statusOverride: p.status_override || null
    });
    db.sessions[p.name] = [];
    patientIdByName[p.name] = p.id;
  });

  const { data: sessions, error: sErr } = await supa
    .from('sessions')
    .select('id, patient_id, date, tipo, valor, demanda, relato, conduta, link, charge_absence, attendance_mode, sublease_value')
    .order('date', { ascending: true });

  if (sErr) { showToast('⚠️ Erro ao carregar sessões'); console.error(sErr); return; }

  const idToName = {};
  Object.entries(patientIdByName).forEach(([name, id]) => { idToName[id] = name; });

  sessions.forEach(s => {
    const name = idToName[s.patient_id];
    if (!name) return;
    db.sessions[name].push({
      _id: s.id,
      date: s.date,
      tipo: s.tipo,
      valor: Number(s.valor) || 0,
      demanda: s.demanda || '',
      relato: s.relato || '',
      conduta: s.conduta || '',
      link: s.link || '',
      chargeAbsence: s.charge_absence !== false,
      attendanceMode: s.attendance_mode || 'Presencial no IBP',
      subleaseValue: Number(s.sublease_value) || 0
    });
  });

  db.appointments = [];
  const { data: appts, error: aErr } = await supa
    .from('appointments')
    .select('id, patient_id, date, time, status')
    .order('date', { ascending: true });

  if (!aErr && appts) {
    appts.forEach(a => {
      const name = idToName[a.patient_id];
      db.appointments.push({
        _id: a.id,
        patientId: a.patient_id,
        patientName: name || '(paciente removido)',
        date: a.date,
        time: a.time,
        status: a.status
      });
    });
  }

  db.payments = {};
  db.patients.forEach(p => { db.payments[p.name] = []; });
  const { data: payments, error: payErr } = await supa
    .from('payments')
    .select('id, patient_id, date, amount')
    .order('date', { ascending: true });

  if (!payErr && payments) {
    payments.forEach(pay => {
      const name = idToName[pay.patient_id];
      if (!name) return;
      if (!db.payments[name]) db.payments[name] = [];
      db.payments[name].push({
        _id: pay.id,
        date: pay.date,
        amount: Number(pay.amount) || 0
      });
    });
  }
}

function getPatientObj(name) {
  return db.patients.find(p => p.name === name);
}

// ════════════════════════════════════════════════════════════════════════════
//  NAVEGAÇÃO POR ABAS (barra inferior)
// ════════════════════════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setActiveNav(tab) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

function switchTab(tab) {
  currentPatient = null;
  setActiveNav(tab);
  const topbarAction = document.getElementById('topbarAction');
  const topbarTitle = document.getElementById('topbarTitle');
  const topbarSub = document.getElementById('topbarSub');

  if (tab === 'dashboard') {
    showScreen('screenDashboard');
    topbarTitle.textContent = 'Âncora';
    topbarSub.textContent = 'Psicologia';
    topbarAction.classList.add('hidden');
    renderDashboard();
  } else if (tab === 'pacientes') {
    showScreen('screenIndex');
    topbarTitle.textContent = 'Prontuário';
    topbarSub.textContent = 'Selecione um paciente';
    topbarAction.classList.remove('hidden');
    topbarAction.textContent = '+ Paciente';
    renderIndex();
  } else if (tab === 'agenda') {
    showScreen('screenAgenda');
    topbarTitle.textContent = 'Agenda';
    topbarSub.textContent = 'Atendimentos';
    topbarAction.classList.add('hidden');
    agendaRefDate = new Date();
    setAgendaView('day');
  } else if (tab === 'financeiro') {
    showScreen('screenFinanceiro');
    topbarTitle.textContent = 'Financeiro';
    topbarSub.textContent = 'Resumo mensal';
    topbarAction.classList.add('hidden');
    const now = new Date();
    document.getElementById('finMonthFilter').value =
      `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    renderFinanceiro();
  } else if (tab === 'relatorios') {
    showScreen('screenRelatorios');
    topbarTitle.textContent = 'Relatórios';
    topbarSub.textContent = 'Backup e exportação';
    topbarAction.classList.add('hidden');
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DASHBOARD E FINANCEIRO MENSAL
// ════════════════════════════════════════════════════════════════════════════
function renderDashboard() {
  const ativos = db.patients.filter(p => computeStatus(p) === 'Ativo').length;
  const ausentes = db.patients.filter(p => computeStatus(p) === 'Ausente').length;
  const inativos = db.patients.filter(p => computeStatus(p) === 'Inativo').length;
  document.getElementById('dashAtivos').textContent = ativos;
  document.getElementById('dashAusentes').textContent = ausentes;
  document.getElementById('dashInativos').textContent = inativos;
  document.getElementById('dashTotalPacientes').textContent = db.patients.length;

  const now = new Date();
  const h = now.getHours();
  const saud = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  document.getElementById('dashGreeting').textContent = saud;
  const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  document.getElementById('dashDate').textContent =
    `${DIAS[now.getDay()]}, ${now.getDate()} de ${MES[now.getMonth()]}`;

  const todayStr = now.toISOString().split('T')[0];
  const curY = now.getFullYear(), curM = now.getMonth() + 1;
  let sessoesHoje = 0;
  let receitaMes = 0;

  db.patients.forEach(p => {
    (db.sessions[p.name] || []).forEach(s => {
      if (s.date === todayStr) sessoesHoje++;
      const [sy, sm] = s.date.split('-').map(Number);
      if (sy === curY && sm === curM) receitaMes += (s.valor || 0);
    });
  });

  document.getElementById('dashSessoesHoje').textContent = sessoesHoje;
  document.getElementById('dashReceitaMes').textContent = 'R$ ' + receitaMes.toFixed(2).replace('.', ',');
}

function renderFinanceiro() {
  const monthVal = document.getElementById('finMonthFilter').value;
  const content = document.getElementById('finContent');
  if (!monthVal) { content.innerHTML = ''; return; }
  const [fy, fm] = monthVal.split('-').map(Number);

  let gBruto = 0, gIbp = 0, gSublease = 0, gLiquido = 0, gSessoes = 0;
  const perPatient = [];

  db.patients.forEach(p => {
    const sessions = (db.sessions[p.name] || []).filter(s => {
      const [sy, sm] = s.date.split('-').map(Number);
      if (sy !== fy || sm !== fm) return false;
      if (s.tipo === 'Falta' && s.chargeAbsence === false) return false;
      return true;
    });
    if (!sessions.length) return;

    let bruto = 0, ibp = 0, sublease = 0, liquido = 0;
    sessions.forEach(s => {
      const fin = computeSessionFinance(s, p);
      bruto += fin.bruto; ibp += fin.percentIbp; sublease += fin.sublocacao; liquido += fin.liquido;
    });

    gBruto += bruto; gIbp += ibp; gSublease += sublease; gLiquido += liquido;
    gSessoes += sessions.length;
    perPatient.push({ name: p.name, count: sessions.length, bruto, ibp, sublease, liquido });
  });

  const fmt = v => 'R$ ' + v.toFixed(2).replace('.', ',');

  if (!gSessoes) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💰</div>Nenhuma sessão neste mês.</div>`;
    return;
  }

  perPatient.sort((a,b) => b.liquido - a.liquido);

  let html = `
    <div class="fin-big-card">
      <div class="fin-big-label">Lucro líquido do mês</div>
      <div class="fin-big-value">${fmt(gLiquido)}</div>
    </div>
    <div class="fin-breakdown">
      <div class="fin-line"><span class="fin-line-label">Total bruto (${gSessoes} sessões)</span><span class="fin-line-value receita">${fmt(gBruto)}</span></div>
      <div class="fin-line"><span class="fin-line-label">Pago ao IBP</span><span class="fin-line-value desc">− ${fmt(gIbp)}</span></div>
      <div class="fin-line"><span class="fin-line-label">Pago em sublocações</span><span class="fin-line-value desc">− ${fmt(gSublease)}</span></div>
      <div class="fin-line"><span class="fin-line-label">Lucro líquido</span><span class="fin-line-value lucro">${fmt(gLiquido)}</span></div>
    </div>
    <p class="section-label">Por paciente</p>
  `;

  html += perPatient.map(pp => `
    <div class="fin-patient-card patient-card" style="display:block">
      <div class="fin-patient-name">${escHtml(pp.name)}</div>
      <div class="fin-patient-grid">
        <div class="fin-patient-row"><span class="lbl">Sessões</span><span class="val">${pp.count}</span></div>
        <div class="fin-patient-row"><span class="lbl">Bruto</span><span class="val">${fmt(pp.bruto)}</span></div>
        ${pp.ibp > 0 ? `<div class="fin-patient-row"><span class="lbl">IBP</span><span class="val" style="color:var(--red)">− ${fmt(pp.ibp)}</span></div>` : ''}
        ${pp.sublease > 0 ? `<div class="fin-patient-row"><span class="lbl">Sublocação</span><span class="val" style="color:var(--red)">− ${fmt(pp.sublease)}</span></div>` : ''}
        <div class="fin-patient-row total"><span class="lbl">Líquido</span><span class="val">${fmt(pp.liquido)}</span></div>
      </div>
    </div>
  `).join('');

  content.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════════
//  AGENDA
// ════════════════════════════════════════════════════════════════════════════
let agendaView = 'day';           
let agendaRefDate = new Date();   

const DIAS_SEMANA = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseDateStr(s) { return new Date(s + 'T00:00:00'); }

function setAgendaView(view) {
  agendaView = view;
  document.getElementById('agendaViewDay').classList.toggle('active', view === 'day');
  document.getElementById('agendaViewWeek').classList.toggle('active', view === 'week');
  renderAgenda();
}

function agendaNavigate(dir) {
  const step = agendaView === 'day' ? 1 : 7;
  agendaRefDate.setDate(agendaRefDate.getDate() + dir * step);
  renderAgenda();
}

function startOfWeek(d) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function statusClass(status) {
  if (status === 'Confirmado') return 'st-confirmado';
  if (status === 'Falta') return 'st-falta';
  if (status === 'Remarcado') return 'st-remarcado';
  return 'st-naoconfirmado';
}

function renderAgenda() {
  const label = document.getElementById('agendaNavLabel');
  const content = document.getElementById('agendaContent');
  const todayStr = toDateStr(new Date());

  let days = [];
  if (agendaView === 'day') {
    days = [new Date(agendaRefDate)];
    const d = agendaRefDate;
    label.textContent = `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  } else {
    const start = startOfWeek(agendaRefDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    const end = days[6];
    label.textContent = `${start.getDate()}/${start.getMonth()+1} – ${end.getDate()}/${end.getMonth()+1}`;
  }

  let html = '';
  let totalNoPeriodo = 0;

  days.forEach(d => {
    const dStr = toDateStr(d);
    const appts = (db.appointments || [])
      .filter(a => a.date === dStr)
      .sort((a,b) => a.time.localeCompare(b.time));

    if (agendaView === 'week' && !appts.length) return;

    totalNoPeriodo += appts.length;
    const isToday = dStr === todayStr;

    html += `<div class="agenda-day-group">
      <div class="agenda-day-header ${isToday ? 'is-today' : ''}">
        ${DIAS_SEMANA[d.getDay()]}, ${d.getDate()}/${d.getMonth()+1}
        ${isToday ? '<span class="agenda-today-pill">HOJE</span>' : ''}
      </div>`;

    if (!appts.length) {
      html += `<div class="empty-state" style="padding:20px">Nenhum atendimento neste dia.</div>`;
    } else {
      appts.forEach(a => {
        const sc = statusClass(a.status);
        html += `
          <div class="appt-card ${sc}">
            <div class="appt-time">${escHtml(a.time)}</div>
            <div class="appt-info">
              <div class="appt-name">${escHtml(a.patientName)}</div>
              <button class="appt-status-btn ${sc}" onclick="cycleApptStatus('${escAttr(a._id)}')">${escHtml(a.status)}</button>
            </div>
            <button class="appt-delete" onclick="deleteAppt('${escAttr(a._id)}')" title="Excluir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:middle"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/></svg></button>
          </div>`;
      });
    }
    html += `</div>`;
  });

  if (agendaView === 'week' && totalNoPeriodo === 0) {
    html = `<div class="empty-state"><div class="empty-state-icon">🗓️</div>Nenhum atendimento nesta semana.</div>`;
  }
  content.innerHTML = html;
}

const STATUS_CYCLE = ['Não confirmado', 'Confirmado', 'Falta', 'Remarcado'];
async function cycleApptStatus(apptId) {
  const appt = db.appointments.find(a => a._id === apptId);
  if (!appt) return;
  const idx = STATUS_CYCLE.indexOf(appt.status);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

  const { error } = await supa.from('appointments').update({ status: next }).eq('id', apptId);
  if (error) { showToast('⚠️ Erro ao alterar status'); console.error(error); return; }

  appt.status = next;
  renderAgenda();
}

function openAddAppt() {
  if (!db.patients.length) { showToast('⚠️ Cadastre um paciente primeiro'); return; }
  const sel = document.getElementById('apptPatient');
  sel.innerHTML = db.patients.map(p => `<option value="${escAttr(p.name)}">${escHtml(p.name)}</option>`).join('');
  document.getElementById('apptDate').value = toDateStr(agendaRefDate);
  document.getElementById('apptTime').value = '';
  document.getElementById('modalAppt').classList.add('open');
}
function closeAddAppt() { document.getElementById('modalAppt').classList.remove('open'); }

async function confirmAddAppt() {
  const name = document.getElementById('apptPatient').value;
  const date = document.getElementById('apptDate').value;
  const time = document.getElementById('apptTime').value;

  if (!date || !time) { showToast('⚠️ Preencha data e horário'); return; }
  const patientId = patientIdByName[name];
  if (!patientId) { showToast('⚠️ Paciente não encontrado'); return; }

  const { data, error } = await supa
    .from('appointments')
    .insert({ user_id: currentUser.id, patient_id: patientId, date, time, status: 'Não confirmado' })
    .select()
    .single();

  if (error) { showToast('⚠️ Erro ao agendar'); console.error(error); return; }

  db.appointments.push({
    _id: data.id, patientId, patientName: name, date, time, status: 'Não confirmado'
  });

  closeAddAppt();
  showToast('✅ Agendamento criado!');
  agendaRefDate = parseDateStr(date);
  renderAgenda();
}

async function deleteAppt(apptId) {
  if (!confirm('Excluir este agendamento?')) return;
  const { error } = await supa.from('appointments').delete().eq('id', apptId);
  if (error) { showToast('⚠️ Erro ao excluir'); console.error(error); return; }
  db.appointments = db.appointments.filter(a => a._id !== apptId);
  showToast('🗑 Agendamento excluído');
  renderAgenda();
}

// ════════════════════════════════════════════════════════════════════════════
//  ÍNDICE (Lista de Pacientes)
// ════════════════════════════════════════════════════════════════════════════
function renderIndex() {
  const grid = document.getElementById('patientGrid');
  const searchEl = document.getElementById('patientSearch');
  const term = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const clearBtn = document.getElementById('searchClear');
  if (clearBtn) clearBtn.classList.toggle('visible', term.length > 0);

  if (!db.patients.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👤</div>Nenhum paciente ainda.<br>Toque em "+ Adicionar paciente" para começar.</div>`;
    return;
  }

  const matches = db.patients.filter(p => {
    const matchesSearch = normalize(p.name).includes(normalize(term));
    const status = computeStatus(p);
    const matchesStatus = currentStatusFilter === 'Todos' || status === currentStatusFilter;
    return matchesSearch && matchesStatus;
  });

  if (!matches.length) {
    const msg = term
      ? `Nenhum paciente encontrado para "${escHtml(searchEl.value.trim())}".`
      : `Nenhum paciente com este status.`;
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div>${msg}</div>`;
    return;
  }

  grid.innerHTML = matches.map(p => {
    const sessions = db.sessions[p.name] || [];
    const total = sessions.reduce((s,x) => s + (x.valor||0), 0);
    const lastDate = sessions.length ? sessions[sessions.length-1].date : null;
    const initials = p.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
    const age = calcAge(p.birthDate);
    const status = computeStatus(p);
    return `
      <div class="patient-card" onclick="openPatient('${escAttr(p.name)}')">
        <div class="patient-avatar">${initials}</div>
        <div class="patient-info">
          <div class="patient-name">${escHtml(p.name)}</div>
          <div class="stat-chips">
            <span class="chip ${statusChipClass(status)}">${statusEmoji(status)}${status}</span>
            <span class="chip chip-teal">${sessions.length} sessão(ões)</span>
            <span class="chip chip-green">R$ ${total.toFixed(2).replace('.',',')}</span>
            ${age !== null ? `<span class="chip chip-teal">${age} anos</span>` : ''}
            ${p.capturedByIbp ? `<span class="chip chip-teal">IBP</span>` : ''}
          </div>
          ${lastDate ? `<div class="patient-meta" style="margin-top:4px">Última: ${formatDate(lastDate)}</div>` : ''}
        </div>
        <button class="patient-delete" onclick="event.stopPropagation(); deletePatient('${escAttr(p.name)}')" title="Excluir paciente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:middle"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/></svg></button>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════════════════
//  VISÃO DO PACIENTE (Prontuário)
// ════════════════════════════════════════════════════════════════════════════
function openPatient(name) {
  currentPatient = name;
  showScreen('screenPatient');
  setActiveNav('pacientes');
  document.getElementById('topbarTitle').textContent = name.split(' ')[0];
  document.getElementById('topbarSub').textContent = 'Prontuário';
  const topbarAction = document.getElementById('topbarAction');
  topbarAction.classList.remove('hidden');
  topbarAction.textContent = '+ Sessão';
  document.getElementById('fPayDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('fTipo').value = 'Normal';
  document.getElementById('fModo').value = 'Presencial no IBP';
  onTipoChange();
  onModoChange();
  renderPatientView();
  window.scrollTo(0,0);
}

function goIndex() { switchTab('pacientes'); }

function renderPatientView() {
  const name = currentPatient;
  const p = getPatientObj(name) || {};
  const sessions = (db.sessions[name] || []).slice().reverse();
  const allSessions = db.sessions[name] || [];
  const initials = name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();

  document.getElementById('phAvatar').textContent = initials;
  document.getElementById('phName').textContent = name;

  const totalAll = allSessions.reduce((s,x) => s + (x.valor||0), 0);
  document.getElementById('phStats').innerHTML = `
    <div class="stat-block"><div class="stat-num">${allSessions.length}</div><div class="stat-lbl">Total</div></div>
    <div class="stat-block"><div class="stat-num">R$${totalAll.toFixed(0)}</div><div class="stat-lbl">Receita</div></div>
  `;

  const age = calcAge(p.birthDate);
  const status = computeStatus(p);
  const infoRows = [];
  infoRows.push(['Status', `<span class="chip ${statusChipClass(status)}">${statusEmoji(status)}${status}</span>`]);
  if (age !== null) infoRows.push(['Idade', `${age} anos`]);
  if (p.phone) infoRows.push(['Telefone', escHtml(p.phone)]);
  if (p.email) infoRows.push(['E-mail', escHtml(p.email)]);
  if (p.sessionValue) infoRows.push(['Valor da sessão', `R$ ${p.sessionValue.toFixed(2).replace('.',',')}`]);
  if (p.frequency) infoRows.push(['Frequência', escHtml(p.frequency)]);
  infoRows.push(['Captado pelo IBP', p.capturedByIbp ? `<span class="ibp-badge">Sim</span>` : 'Não']);

  const statusControlHtml = `
    <div style="margin-top:4px">
      <div class="info-row-label" style="margin-bottom:6px">Alterar status</div>
      <div class="status-toggle-group">
        <button class="status-toggle-btn ${!p.statusOverride ? 'active-auto' : ''}" onclick="setPatientStatus('${escAttr(p.name)}', null)">Automático</button>
        <button class="status-toggle-btn ${p.statusOverride === 'Ativo' ? 'active-ativo' : ''}" onclick="setPatientStatus('${escAttr(p.name)}', 'Ativo')"><span class="st-dot ativo"></span>Ativo</button>
        <button class="status-toggle-btn ${p.statusOverride === 'Ausente' ? 'active-ausente' : ''}" onclick="setPatientStatus('${escAttr(p.name)}', 'Ausente')"><span class="st-dot ausente"></span>Ausente</button>
        <button class="status-toggle-btn ${p.statusOverride === 'Inativo' ? 'active-inativo' : ''}" onclick="setPatientStatus('${escAttr(p.name)}', 'Inativo')"><span class="st-dot inativo"></span>Inativo</button>
      </div>
    </div>`;

  document.getElementById('phInfoCard').innerHTML = infoRows.map(([label, value]) => `
    <div class="info-row"><span class="info-row-label">${label}</span><span class="info-row-value">${value}</span></div>
  `).join('') + statusControlHtml;

  const monthVal = document.getElementById('monthFilter').value;
  const [fy, fm] = monthVal ? monthVal.split('-').map(Number) : [0, 0];

  const monthSessions = allSessions.filter(s => {
    if (!monthVal) return true;
    const [sy, sm] = s.date.split('-').map(Number);
    return sy === fy && sm === fm;
  });
  const monthTotal = monthSessions.reduce((s,x) => s + (x.valor||0), 0);
  document.getElementById('sumSessions').textContent = monthSessions.length;
  document.getElementById('sumValue').textContent = 'R$ ' + monthTotal.toFixed(2).replace('.',',');

  renderPayments(name);
  const payInfo = computePaymentStatus(name);

  const filtered = sessions.filter(s => {
    if (!monthVal) return true;
    const [sy, sm] = s.date.split('-').map(Number);
    return sy === fy && sm === fm;
  });

  const list = document.getElementById('sessionList');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div>Nenhuma sessão ${monthVal ? 'neste mês' : 'registrada'}.</div>`;
    return;
  }

  list.innerHTML = filtered.map((s) => {
    const isRemark = s.tipo === 'Remarcação';
    const isFalta = s.tipo === 'Falta';
    const cardClass = isRemark ? 'remarcacao' : (isFalta ? 'remarcacao' : 'normal');
    const badgeClass = isRemark ? 'badge-remark' : (isFalta ? 'badge-remark' : 'badge-normal');
    const payStatus = payInfo.statusById[s._id] || 'Pendente';
    const fin = computeSessionFinance(s, p);
    const modo = s.attendanceMode || 'Presencial no IBP';
    const showFinance = (fin.percentIbp > 0 || fin.sublocacao > 0);
    return `
      <div class="session-card ${cardClass}">
        <div class="session-card-top">
          <div class="session-date">${formatDate(s.date)}</div>
          <span class="session-badge ${badgeClass}">${escHtml(s.tipo)}</span>
          <div class="session-value">R$ ${(s.valor||0).toFixed(2).replace('.',',')}</div>
          <button class="session-delete" onclick="deleteSession('${escAttr(s._id)}')" title="Excluir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:middle"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/></svg></button>
        </div>
        <div class="session-fields">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${payBadgeHtml(payStatus)}
            <span class="mode-badge">${escHtml(modo)}</span>
          </div>
          ${s.demanda ? `<div><div class="session-field-label">Demanda</div><div class="session-field-value">${escHtml(s.demanda)}</div></div>` : ''}
          ${s.relato  ? `<div><div class="session-field-label">Relato</div><div class="session-field-value">${escHtml(s.relato)}</div></div>` : ''}
          ${s.conduta ? `<div><div class="session-field-label">Conduta</div><div class="session-field-value">${escHtml(s.conduta)}</div></div>` : ''}
          ${s.link    ? `<div><div class="session-field-label">Atendimento completo</div><a href="${escAttr(s.link)}" target="_blank" class="session-link">Abrir link</a></div>` : ''}
        </div>
        ${showFinance ? `
        <div class="session-finance">
          <div class="session-finance-row"><span class="session-finance-label">Valor bruto</span><span class="session-finance-val">R$ ${fin.bruto.toFixed(2).replace('.',',')}</span></div>
          ${fin.percentIbp > 0 ? `<div class="session-finance-row"><span class="session-finance-label">Desconto IBP</span><span class="session-finance-val desc">− R$ ${fin.percentIbp.toFixed(2).replace('.',',')}</span></div>` : ''}
          ${fin.sublocacao > 0 ? `<div class="session-finance-row"><span class="session-finance-label">Sublocação</span><span class="session-finance-val desc">− R$ ${fin.sublocacao.toFixed(2).replace('.',',')}</span></div>` : ''}
          <div class="session-finance-row total"><span class="session-finance-label">Líquido</span><span class="session-finance-val liquido">R$ ${fin.liquido.toFixed(2).replace('.',',')}</span></div>
        </div>` : ''}
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════════════════
//  SALVAR / EXCLUIR SESSÃO
// ════════════════════════════════════════════════════════════════════════════
async function saveSession() {
  const date   = document.getElementById('fDate').value;
  const tipo   = document.getElementById('fTipo').value;
  const valor  = parseFloat(document.getElementById('fValor').value) || 0;
  const demanda = document.getElementById('fDemanda').value.trim();
  const relato = document.getElementById('fRelato').value.trim();
  const conduta = document.getElementById('fConduta').value.trim();
  const link   = document.getElementById('fLink').value.trim();

  if (!date) { showToast('⚠️ Informe a data da sessão'); return; }
  const patientId = patientIdByName[currentPatient];
  if (!patientId) { showToast('⚠️ Paciente não encontrado'); return; }

  const chargeAbsence = (tipo === 'Falta') ? chargeAbsenceSelected : true;
  const attendanceMode = document.getElementById('fModo').value;
  const subleaseValue = (attendanceMode === 'Online') ? 0 : (parseFloat(document.getElementById('fSublease').value) || 0);

  showToast('💾 Salvando…');

  const { data, error } = await supa
    .from('sessions')
    .insert({
      patient_id: patientId, user_id: currentUser.id,
      date, tipo, valor, demanda, relato, conduta, link,
      charge_absence: chargeAbsence, attendance_mode: attendanceMode, sublease_value: subleaseValue
    })
    .select()
    .single();

  if (error) { showToast('⚠️ Erro ao salvar'); console.error(error); return; }

  db.sessions[currentPatient].push({
    _id: data.id, date, tipo, valor, demanda, relato, conduta, link,
    chargeAbsence, attendanceMode, subleaseValue
  });
  db.sessions[currentPatient].sort((a,b) => a.date.localeCompare(b.date));

  document.getElementById('fValor').value = '';
  document.getElementById('fDemanda').value = '';
  document.getElementById('fRelato').value = '';
  document.getElementById('fConduta').value = '';
  document.getElementById('fLink').value = '';
  document.getElementById('fTipo').value = 'Normal';
  document.getElementById('fModo').value = 'Presencial no IBP';
  document.getElementById('fSublease').value = '';
  onTipoChange();
  onModoChange();

  const [sy, sm] = date.split('-');
  document.getElementById('monthFilter').value = `${sy}-${sm}`;

  showToast('✅ Sessão salva!');
  renderPatientView();
  setTimeout(() => document.getElementById('sessionList').scrollIntoView({behavior:'smooth'}), 300);
}

async function deleteSession(sessionId) {
  if (!confirm('Excluir esta sessão?')) return;
  const { error } = await supa.from('sessions').delete().eq('id', sessionId);
  if (error) { showToast('⚠️ Erro ao excluir'); console.error(error); return; }
  const arr = db.sessions[currentPatient] || [];
  const i = arr.findIndex(s => s._id === sessionId);
  if (i > -1) arr.splice(i, 1);
  showToast('🗑 Sessão excluída');
  renderPatientView();
}

// ════════════════════════════════════════════════════════════════════════════
//  ADICIONAR / EXCLUIR PACIENTE
// ════════════════════════════════════════════════════════════════════════════
function openAddPatient() {
  document.getElementById('modalAdd').classList.add('open');
  document.getElementById('newPatientName').value = '';
  document.getElementById('newPatientBirth').value = '';
  document.getElementById('newPatientPhone').value = '';
  document.getElementById('newPatientEmail').value = '';
  document.getElementById('newPatientValue').value = '';
  document.getElementById('newPatientFreq').value = 'Semanal';
  setIbp(false);
  setTimeout(() => document.getElementById('newPatientName').focus(), 100);
}
function closeAddPatient() { document.getElementById('modalAdd').classList.remove('open'); }

function setIbp(value) {
  ibpSelected = value;
  document.getElementById('ibpYes').classList.toggle('active', value === true);
  document.getElementById('ibpNo').classList.toggle('active', value === false);
}

async function confirmAddPatient() {
  const name = document.getElementById('newPatientName').value.trim();
  const birthDate = document.getElementById('newPatientBirth').value || null;
  const phone = document.getElementById('newPatientPhone').value.trim();
  const email = document.getElementById('newPatientEmail').value.trim();
  const sessionValue = parseFloat(document.getElementById('newPatientValue').value) || 0;
  const frequency = document.getElementById('newPatientFreq').value;

  if (!name) { showToast('⚠️ Digite um nome'); return; }
  if (db.patients.some(p => p.name === name)) { showToast('⚠️ Paciente já existe'); return; }

  const { data, error } = await supa
    .from('patients')
    .insert({
      name, user_id: currentUser.id,
      birth_date: birthDate, phone, email,
      session_value: sessionValue, frequency,
      captured_by_ibp: ibpSelected
    })
    .select()
    .single();

  if (error) { showToast('⚠️ Erro ao adicionar'); console.error(error); return; }

  db.patients.push({
    name, birthDate: birthDate || '', phone, email,
    sessionValue, frequency, capturedByIbp: ibpSelected
  });
  db.patients.sort((a,b) => a.name.localeCompare(b.name));
  db.sessions[name] = [];
  db.payments[name] = [];
  patientIdByName[name] = data.id;

  closeAddPatient();
  showToast(`✅ ${name} adicionado(a)`);
  renderIndex();
}

async function deletePatient(name) {
  const sessions = db.sessions[name] || [];
  const qtd = sessions.length;
  const msg = qtd > 0
    ? `Excluir "${name}"?\n\nIsso apaga o paciente E as ${qtd} sessão(ões) dele(a). Esta ação é PERMANENTE.`
    : `Excluir "${name}"?\n\nEsta ação é permanente.`;
  
  if (!confirm(msg)) return;
  if (qtd > 0 && !confirm(`Tem certeza? Os dados de ${qtd} sessão(ões) serão perdidos.\n\nDica: exporte o backup Excel antes.`)) return;

  const patientId = patientIdByName[name];
  if (!patientId) { showToast('⚠️ Paciente não encontrado'); return; }

  showToast('🗑 Excluindo…');
  const { error } = await supa.from('patients').delete().eq('id', patientId);
  if (error) { showToast('⚠️ Erro ao excluir'); console.error(error); return; }

  db.patients = db.patients.filter(p => p.name !== name);
  delete db.sessions[name];
  delete db.payments[name];
  delete patientIdByName[name];

  showToast(`🗑 ${name} excluído(a)`);
  renderIndex();
}

// ── Funções de Helper Gerais ────────────────────────────────────────────────
function handleTopbarAction() {
  if (currentPatient) {
    document.getElementById('fDate').scrollIntoView({behavior:'smooth'});
    document.getElementById('fDate').focus();
  } else {
    openAddPatient();
  }
}

function clearSearch() {
  const el = document.getElementById('patientSearch');
  el.value = '';
  el.focus();
  renderIndex();
}
function normalize(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function calcAge(birthDate) {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - by;
  const hasHadBirthdayThisYear = (today.getMonth()+1 > bm) || (today.getMonth()+1 === bm && today.getDate() >= bd);
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

function computeStatus(p) {
  if (p.statusOverride) return p.statusOverride;
  const sessions = db.sessions[p.name] || [];
  if (!sessions.length) return 'Ativo'; 

  const lastDateStr = sessions[sessions.length - 1].date; 
  const lastDate = new Date(lastDateStr + 'T00:00:00');
  const today = new Date();
  const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

  let ausenteAt, inativoAt;
  switch (p.frequency) {
    case 'Semanal':   ausenteAt = 14; inativoAt = 28; break;
    case 'Quinzenal': ausenteAt = 28; inativoAt = 56; break;
    case 'Mensal':    ausenteAt = 45; inativoAt = 90; break;
    default:          ausenteAt = 45; inativoAt = 90; break; 
  }

  if (diffDays >= inativoAt) return 'Inativo';
  if (diffDays >= ausenteAt) return 'Ausente';
  return 'Ativo';
}

function statusChipClass(status) {
  if (status === 'Ativo') return 'chip-green';
  if (status === 'Ausente') return 'chip-yellow';
  return 'chip-red';
}
function statusEmoji(status) {
  const cls = status === 'Ativo' ? 'ativo' : (status === 'Ausente' ? 'ausente' : 'inativo');
  return `<span class="st-dot ${cls}"></span>`;
}

let currentStatusFilter = 'Todos';
function setStatusFilter(filter) {
  currentStatusFilter = filter;
  document.querySelectorAll('#statusFilterTabs .filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderIndex();
}

async function setPatientStatus(name, value) {
  const patientId = patientIdByName[name];
  if (!patientId) return;
  const { error } = await supa.from('patients').update({ status_override: value }).eq('id', patientId);
  if (error) { showToast('⚠️ Erro ao alterar status'); console.error(error); return; }
  const p = getPatientObj(name);
  if (p) p.statusOverride = value;
  showToast(value ? `Status definido: ${value}` : 'Status voltou a ser automático');
  renderPatientView();
}

// ════════════════════════════════════════════════════════════════════════════
//  MOTOR DE PAGAMENTOS
// ════════════════════════════════════════════════════════════════════════════
function computePaymentStatus(name) {
  const sessions = (db.sessions[name] || []).slice().sort((a,b) => a.date.localeCompare(b.date));
  const payments = db.payments[name] || [];
  const totalPago = payments.reduce((s, p) => s + (p.amount || 0), 0);

  let saldo = totalPago;
  let totalPendente = 0;
  const statusById = {}; 

  sessions.forEach(s => {
    const cobra = (s.tipo !== 'Falta') || (s.chargeAbsence === true);
    if (!cobra) {
      statusById[s._id] = 'NaoCobrada';
      return;
    }
    const valor = s.valor || 0;
    if (saldo >= valor) {
      saldo -= valor;
      statusById[s._id] = 'Paga';
    } else {
      totalPendente += valor;
      statusById[s._id] = 'Pendente';
    }
  });

  return { totalPago, totalPendente, saldoRestante: saldo, statusById };
}

function payBadgeHtml(statusPag) {
  if (statusPag === 'Paga') return '<span class="pay-badge paga">Paga</span>';
  if (statusPag === 'Pendente') return '<span class="pay-badge pendente">Pendente</span>';
  return '<span class="pay-badge naocobrada">Não cobrada</span>';
}

function computeSessionFinance(session, patient) {
  const bruto = session.valor || 0;
  const modo = session.attendanceMode || 'Presencial no IBP';
  const isIbp = !!(patient && patient.capturedByIbp);
  let percentIbp = 0;
  if (isIbp) {
    const rate = (modo === 'Presencial no IBP') ? 0.30 : 0.20;
    percentIbp = bruto * rate;
  }
  const sublocacao = (modo === 'Online') ? 0 : (session.subleaseValue || 0);
  const liquido = bruto - percentIbp - sublocacao;
  return { bruto, percentIbp, sublocacao, liquido };
}

function renderPayments(name) {
  const pag = computePaymentStatus(name);
  document.getElementById('paySumRecebido').textContent = 'R$ ' + pag.totalPago.toFixed(2).replace('.',',');
  document.getElementById('paySumPendente').textContent = 'R$ ' + pag.totalPendente.toFixed(2).replace('.',',');
  document.getElementById('paySumSaldo').textContent = 'R$ ' + pag.saldoRestante.toFixed(2).replace('.',',');

  const payments = (db.payments[name] || []).slice().reverse();
  const list = document.getElementById('paymentList');
  if (!payments.length) {
    list.innerHTML = `<div class="empty-state" style="padding:14px;font-size:13px">Nenhum pagamento registrado ainda.</div>`;
    return;
  }
  list.innerHTML = payments.map(p => `
    <div class="payment-item">
      <span class="payment-item-date">${formatDate(p.date)}</span>
      <span class="payment-item-amount">R$ ${p.amount.toFixed(2).replace('.',',')}</span>
      <button class="payment-item-delete" onclick="deletePayment('${escAttr(p._id)}')" title="Excluir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:middle"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/></svg></button>
    </div>`).join('');
}

async function savePayment() {
  const valor = parseFloat(document.getElementById('fPayValor').value) || 0;
  const date = document.getElementById('fPayDate').value;
  if (valor <= 0) { showToast('⚠️ Informe um valor válido'); return; }
  if (!date) { showToast('⚠️ Informe a data'); return; }

  const patientId = patientIdByName[currentPatient];
  if (!patientId) { showToast('⚠️ Paciente não encontrado'); return; }

  const { data, error } = await supa.from('payments').insert({ user_id: currentUser.id, patient_id: patientId, date, amount: valor }).select().single();
  if (error) { showToast('⚠️ Erro ao registrar pagamento'); console.error(error); return; }

  if (!db.payments[currentPatient]) db.payments[currentPatient] = [];
  db.payments[currentPatient].push({ _id: data.id, date, amount: valor });
  db.payments[currentPatient].sort((a,b) => a.date.localeCompare(b.date));

  document.getElementById('fPayValor').value = '';
  showToast('✅ Pagamento registrado!');
  renderPatientView();
}

async function deletePayment(payId) {
  if (!confirm('Excluir este pagamento?')) return;
  const { error } = await supa.from('payments').delete().eq('id', payId);
  if (error) { showToast('⚠️ Erro ao excluir'); console.error(error); return; }
  const arr = db.payments[currentPatient] || [];
  const i = arr.findIndex(p => p._id === payId);
  if (i > -1) arr.splice(i, 1);
  showToast('🗑 Pagamento excluído');
  renderPatientView();
}

// ── Comportamentos do Formulário ────────────────────────────────────────────
function onTipoChange() {
  const tipo = document.getElementById('fTipo').value;
  const row = document.getElementById('chargeAbsenceRow');
  row.style.display = (tipo === 'Falta') ? 'flex' : 'none';
  if (tipo === 'Falta') setCharge(true); 
}
function setCharge(value) {
  chargeAbsenceSelected = value;
  document.getElementById('chargeYes').classList.toggle('active', value === true);
  document.getElementById('chargeNo').classList.toggle('active', value === false);
}
function onModoChange() {
  const modo = document.getElementById('fModo').value;
  const row = document.getElementById('subleaseRow');
  row.style.display = (modo === 'Online') ? 'none' : 'flex';
  if (modo === 'Online') document.getElementById('fSublease').value = '';
}

// ── Utilitários ─────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/'/g,'\\&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  
  // Feedback tátil (vibração) para o celular! 
  if (navigator.vibrate) navigator.vibrate(50);
  
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ════════════════════════════════════════════════════════════════════════════
//  EXPORTAR EXCEL (backup)
// ════════════════════════════════════════════════════════════════════════════
function exportExcel() {
  if (!db.patients.length) { showToast('⚠️ Nenhum paciente para exportar'); return; }

  const wb = XLSX.utils.book_new();
  const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100;

  const resumoRows = [[
    'Paciente','Status','Sessões','Pagas','Pendentes','Faltas','Remarcações',
    'Valor Bruto (R$)','Recebido (R$)','Pago IBP (R$)','Sublocação (R$)','Lucro Líquido (R$)'
  ]];

  let gSessoes=0, gPagas=0, gPend=0, gFaltas=0, gRemarc=0;
  let gBruto=0, gRecebido=0, gIbp=0, gSub=0, gLiquido=0;

  db.patients.forEach(p => {
    const ss = db.sessions[p.name] || [];
    const pag = computePaymentStatus(p.name);
    const recebido = (db.payments[p.name] || []).reduce((a,x)=>a+(x.amount||0),0);
    let bruto=0, ibp=0, sub=0, liquido=0;
    let pagas=0, pend=0, faltas=0, remarc=0;

    ss.forEach(s => {
      if (s.tipo === 'Falta') faltas++;
      if (s.tipo === 'Remarcação') remarc++;
      const st = pag.statusById[s._id];
      if (st === 'Paga') pagas++;
      else if (st === 'Pendente') pend++;

      const entra = !(s.tipo === 'Falta' && s.chargeAbsence === false);
      if (entra) {
        const fin = computeSessionFinance(s, p);
        bruto += fin.bruto; ibp += fin.percentIbp; sub += fin.sublocacao; liquido += fin.liquido;
      }
    });

    const status = computeStatus(p);
    resumoRows.push([
      p.name, status, ss.length, pagas, pend, faltas, remarc,
      round2(bruto), round2(recebido), round2(ibp), round2(sub), round2(liquido)
    ]);

    gSessoes+=ss.length; gPagas+=pagas; gPend+=pend; gFaltas+=faltas; gRemarc+=remarc;
    gBruto+=bruto; gRecebido+=recebido; gIbp+=ibp; gSub+=sub; gLiquido+=liquido;
  });

  resumoRows.push([]);
  resumoRows.push([
    'TOTAL GERAL','', gSessoes, gPagas, gPend, gFaltas, gRemarc,
    round2(gBruto), round2(gRecebido), round2(gIbp), round2(gSub), round2(gLiquido)
  ]);

  const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows);
  wsResumo['!cols'] = [
    {wch:26},{wch:10},{wch:9},{wch:8},{wch:10},{wch:8},{wch:12},
    {wch:15},{wch:14},{wch:14},{wch:15},{wch:17}
  ];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo por Paciente');

  const detRows = [[
    'Paciente','Data','Mês','Tipo','Forma de Atendimento','Valor (R$)',
    'Status Pagamento','Desconto IBP (R$)','Sublocação (R$)','Líquido (R$)',
    'Demanda','Relato','Conduta','Link'
  ]];

  const todas = [];
  db.patients.forEach(p => { (db.sessions[p.name] || []).forEach(s => todas.push({ p, s })); });
  todas.sort((a,b) => a.s.date.localeCompare(b.s.date));

  todas.forEach(({p, s}) => {
    const pag = computePaymentStatus(p.name);
    const st = pag.statusById[s._id] || '';
    const stLabel = st === 'Paga' ? 'Paga' : (st === 'Pendente' ? 'Pendente' : 'Não cobrada');
    const fin = computeSessionFinance(s, p);
    const [y, m] = s.date.split('-');
    detRows.push([
      p.name, formatDate(s.date), `${m}/${y}`, s.tipo,
      s.attendanceMode || 'Presencial no IBP', round2(s.valor||0),
      stLabel, round2(fin.percentIbp), round2(fin.sublocacao), round2(fin.liquido),
      s.demanda||'', s.relato||'', s.conduta||'', s.link||''
    ]);
  });

  const wsDet = XLSX.utils.aoa_to_sheet(detRows);
  wsDet['!cols'] = [
    {wch:24},{wch:12},{wch:9},{wch:12},{wch:22},{wch:11},
    {wch:15},{wch:15},{wch:15},{wch:13},
    {wch:30},{wch:30},{wch:30},{wch:28}
  ];
  XLSX.utils.book_append_sheet(wb, wsDet, 'Sessões Detalhadas');

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  XLSX.writeFile(wb, `Ancora_backup_${stamp}.xlsx`);
  showToast('✅ Excel baixado!');
}

// ── Listeners Finais ────────────────────────────────────────────────────────
document.getElementById('modalAdd').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAddPatient();
});
document.getElementById('modalAppt').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAddAppt();
});
document.getElementById('newPatientName').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmAddPatient();
});
