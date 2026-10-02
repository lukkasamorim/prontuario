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
let editingPatientName = null;   // quando != null, o modal de paciente está editando
let editingSessionId = null;     // quando != null, o formulário de sessão está editando

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

// Esconde a splash com um fade curto em vez de sumir de uma vez
function hideSplash() {
  const ov = document.getElementById('loadingOverlay');
  if (!ov) return;
  ov.classList.add('is-hiding');
  setTimeout(() => ov.classList.add('hidden'), 450);
}

async function enterApp() {
  const ov = document.getElementById('loadingOverlay');
  ov.classList.remove('hidden', 'is-hiding');
  const inicio = Date.now();
  await loadAllData();
  // Garante que a marca fique visível pelo menos 900 ms, para não piscar
  const espera = Math.max(0, 900 - (Date.now() - inicio));
  setTimeout(hideSplash, espera);
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
    .select('id, patient_id, date, tipo, valor, demanda, relato, conduta, link, charge_absence, attendance_mode, sublease_value, session_number')
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
      subleaseValue: Number(s.sublease_value) || 0,
      sessionNumber: (s.session_number === null || s.session_number === undefined) ? null : Number(s.session_number)
    });
  });

  db.appointments = [];
  const { data: appts, error: aErr } = await supa
    .from('appointments')
    .select('id, patient_id, date, time, status')
    .order('date', { ascending: true });

  if (aErr) {
    showToast('⚠️ Erro ao carregar a agenda');
    console.error('Falha ao ler a tabela appointments:', aErr);
  }
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

  if (payErr) {
    showToast('⚠️ Erro ao carregar pagamentos');
    console.error('Falha ao ler a tabela payments:', payErr);
  }
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

let currentTab = 'dashboard';

function switchTab(tab) {
  currentPatient = null;
  currentTab = tab;
  setActiveNav(tab);
  updateFab(tab);

  if (tab === 'dashboard') {
    showScreen('screenDashboard');
    renderDashboard();
  } else if (tab === 'pacientes') {
    showScreen('screenIndex');
    renderIndex();
  } else if (tab === 'agenda') {
    showScreen('screenAgenda');
    agendaRefDate = new Date();
    renderAgenda();
  } else if (tab === 'financeiro') {
    showScreen('screenFinanceiro');
    const el = document.getElementById('finMonthFilter');
    if (!el.value) {
      const now = new Date();
      el.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    }
    renderFinanceiro();
  } else if (tab === 'relatorios') {
    showScreen('screenRelatorios');
    renderRelatorios();
  }
  window.scrollTo(0, 0);
}

// ── BOTÃO FLUTUANTE ─────────────────────────────────────────────────────────
// Some nas telas em que não existe uma ação de "criar" direta.
function updateFab(tab) {
  const fab = document.getElementById('fab');
  if (!fab) return;
  const semFab = (tab === 'relatorios' || tab === 'financeiro');
  fab.classList.toggle('hidden', semFab);
  const rotulos = {
    dashboard: 'Novo agendamento',
    pacientes: 'Novo paciente',
    agenda: 'Novo agendamento',
    patient: 'Registrar sessão'
  };
  fab.setAttribute('aria-label', rotulos[tab] || 'Adicionar');
}

function fabAction() {
  if (currentTab === 'patient') {
    const el = document.getElementById('fDate');
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    return;
  }
  if (currentTab === 'pacientes') { openAddPatient(); return; }
  openAddAppt();
}

// Toca num status do painel inicial e cai na lista já filtrada
function goToStatus(status) {
  switchTab('pacientes');
  setStatusFilter(status);
}

// ════════════════════════════════════════════════════════════════════════════
//  DASHBOARD E FINANCEIRO MENSAL
// ════════════════════════════════════════════════════════════════════════════
const MES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MES_LONGO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fmtBRL(v) { return 'R$ ' + (v || 0).toFixed(2).replace('.', ','); }
function iniciais(nome) {
  return String(nome).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// Próximo agendamento ainda por acontecer (ignora falta e remarcado)
function proximoAtendimento() {
  const agora = new Date();
  const hoje = toDateStr(agora);
  const candidatos = (db.appointments || [])
    .filter(a => a.status !== 'Falta' && a.status !== 'Remarcado')
    .filter(a => {
      if (a.date > hoje) return true;
      if (a.date < hoje) return false;
      const [hh, mm] = String(a.time).split(':').map(Number);
      const quando = new Date(agora); quando.setHours(hh, mm || 0, 0, 0);
      // ainda conta como "próximo" até 30 min depois do horário
      return (quando.getTime() + 30 * 60000) >= agora.getTime();
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return candidatos[0] || null;
}

// Minutos entre agora e um agendamento (negativo = já passou do horário)
function minutosAte(appt) {
  const [hh, mm] = String(appt.time).split(':').map(Number);
  const quando = parseDateStr(appt.date);
  quando.setHours(hh, mm || 0, 0, 0);
  return Math.round((quando.getTime() - Date.now()) / 60000);
}

function textoEspera(min) {
  if (min <= 0) return 'agora';
  if (min < 60) return `em ${min} min`;
  if (min < 60 * 24) {
    const h = Math.floor(min / 60);
    return `em ${h}h`;
  }
  const d = Math.round(min / (60 * 24));
  return d === 1 ? 'amanhã' : `em ${d} dias`;
}

// Sessões registradas sem nenhum campo clínico preenchido
function contaProntuariosPendentes() {
  let n = 0;
  db.patients.forEach(p => {
    (db.sessions[p.name] || []).forEach(s => {
      if (s.tipo === 'Falta') return;
      if (!s.demanda && !s.relato && !s.conduta) n++;
    });
  });
  return n;
}

// Agendamentos futuros ainda sem confirmação
function contaConfirmacoesPendentes() {
  const hoje = toDateStr(new Date());
  return (db.appointments || []).filter(a => a.status === 'Não confirmado' && a.date >= hoje).length;
}

// Soma de tudo o que está pendente de pagamento, por paciente
function totalEmAberto() {
  const linhas = [];
  let total = 0, sessoes = 0;
  db.patients.forEach(p => {
    const pag = computePaymentStatus(p.name);
    if (pag.totalPendente <= 0) return;
    const pendentes = (db.sessions[p.name] || []).filter(s => pag.statusById[s._id] === 'Pendente');
    const desde = pendentes.length ? pendentes[0].date : null;
    total += pag.totalPendente;
    sessoes += pendentes.length;
    linhas.push({ name: p.name, valor: pag.totalPendente, sessoes: pendentes.length, desde });
  });
  linhas.sort((a, b) => b.valor - a.valor);
  return { total, sessoes, pacientes: linhas.length, linhas };
}

// Pagamentos recebidos dentro de um mês (opcionalmente até um dia do mês)
function recebidoNoMes(ano, mes, ateDia) {
  let total = 0;
  Object.values(db.payments || {}).forEach(arr => {
    (arr || []).forEach(pay => {
      const [py, pm, pd] = pay.date.split('-').map(Number);
      if (py !== ano || pm !== mes) return;
      if (ateDia && pd > ateDia) return;
      total += pay.amount || 0;
    });
  });
  return total;
}

function renderDashboard() {
  const agora = new Date();
  const h = agora.getHours();
  document.getElementById('dashGreeting').textContent =
    h < 12 ? 'Bom dia,' : (h < 18 ? 'Boa tarde,' : 'Boa noite,');

  const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  document.getElementById('dashDate').textContent =
    `${DIAS[agora.getDay()]}, ${agora.getDate()} de ${MES_LONGO[agora.getMonth()].toLowerCase()}`;

  // ── Status dos pacientes ──
  document.getElementById('dashAtivos').textContent   = db.patients.filter(p => computeStatus(p) === 'Ativo').length;
  document.getElementById('dashAusentes').textContent = db.patients.filter(p => computeStatus(p) === 'Ausente').length;
  document.getElementById('dashInativos').textContent = db.patients.filter(p => computeStatus(p) === 'Inativo').length;
  document.getElementById('dashTotalPacientes').textContent = db.patients.length;

  // ── Pendências ──
  document.getElementById('dashProntuarios').textContent = contaProntuariosPendentes();
  document.getElementById('dashConfirmacoes').textContent = contaConfirmacoesPendentes();

  // ── Dinheiro ──
  const ano = agora.getFullYear(), mes = agora.getMonth() + 1, dia = agora.getDate();
  const recebido = recebidoNoMes(ano, mes);
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const recebidoAnt = recebidoNoMes(anoAnt, mesAnt, dia);

  document.getElementById('dashRecebidoLabel').textContent = 'RECEBIDO - ' + MES_CURTO[mes - 1].toUpperCase();
  document.getElementById('dashRecebido').textContent = fmtBRL(recebido);
  document.getElementById('dashRecebidoSub').textContent =
    recebidoAnt > 0 ? `${fmtBRL(recebidoAnt)} no mesmo dia em ${MES_CURTO[mesAnt - 1]}` : 'sem comparação com o mês anterior';

  const aberto = totalEmAberto();
  document.getElementById('dashAReceber').textContent = fmtBRL(aberto.total);
  document.getElementById('dashAReceberSub').textContent =
    aberto.total > 0 ? `${aberto.sessoes} ${aberto.sessoes === 1 ? 'sessão' : 'sessões'} - ${aberto.pacientes} ${aberto.pacientes === 1 ? 'paciente' : 'pacientes'}` : 'tudo em dia';

  // ── Próximo atendimento ──
  const box = document.getElementById('dashNext');
  const nx = proximoAtendimento();

  if (!nx) {
    box.innerHTML = `
      <div class="next-card">
        <div class="next-label">PRÓXIMO ATENDIMENTO</div>
        <div class="next-name" style="margin-top:10px">Nenhum agendamento</div>
        <div class="next-meta" style="font-weight:500;color:var(--muted)">Toque no + para agendar.</div>
      </div>`;
    return;
  }

  const p = getPatientObj(nx.patientName);
  const min = minutosAte(nx);
  const hoje = toDateStr(agora);
  const ehHoje = nx.date === hoje;
  const partes = [];
  if (p) {
    partes.push(`${nextSessionNumber(p.name)}ª sessão`);
    partes.push(p.capturedByIbp ? 'Captado pelo IBP' : 'Particular');
    if (p.sessionValue) partes.push(fmtBRL(p.sessionValue));
  }

  box.innerHTML = `
    <div class="next-card ${ehHoje ? 'is-now' : ''}">
      <div class="next-label">PRÓXIMO ATENDIMENTO</div>
      <div class="next-line">
        <span class="next-time">${escHtml(nx.time)}</span>
        <span class="next-in">${ehHoje ? textoEspera(min) : formatDate(nx.date)}</span>
      </div>
      <div class="next-name">${escHtml(nx.patientName)}</div>
      <div class="next-meta">${escHtml(partes.join(' - '))}</div>
      <div class="next-actions">
        <button class="btn-primary" onclick="setApptStatus('${escAttr(nx._id)}','Confirmado')">Confirmar</button>
        <button class="btn-ghost" onclick="setApptStatus('${escAttr(nx._id)}','Remarcado')">Remarcar</button>
      </div>
    </div>`;
}

// Define um status específico (o ciclo continua existindo na agenda)
async function setApptStatus(apptId, status) {
  const appt = (db.appointments || []).find(a => a._id === apptId);
  if (!appt) return;
  const { error } = await supa.from('appointments').update({ status }).eq('id', apptId);
  if (error) { showToast('⚠️ Erro ao alterar status'); console.error(error); return; }
  appt.status = status;
  showToast(status === 'Confirmado' ? '✅ Atendimento confirmado' : 'Atendimento marcado como remarcado');
  if (currentTab === 'dashboard') renderDashboard(); else renderAgenda();
}

// Setas de mês da tela financeira
function finNavigate(dir) {
  const el = document.getElementById('finMonthFilter');
  let [y, m] = (el.value || '').split('-').map(Number);
  if (!y) { const n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1; }
  m += dir;
  if (m > 12) { m = 1; y++; }
  if (m < 1) { m = 12; y--; }
  el.value = `${y}-${String(m).padStart(2, '0')}`;
  renderFinanceiro();
}

function renderFinanceiro() {
  const monthVal = document.getElementById('finMonthFilter').value;
  const content = document.getElementById('finContent');
  if (!monthVal) { content.innerHTML = ''; return; }
  const [fy, fm] = monthVal.split('-').map(Number);

  const lbl = document.getElementById('finMonthLabel');
  if (lbl) lbl.textContent = `${MES_LONGO[fm - 1]} ${fy}`;

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

  const recebidoMes = recebidoNoMes(fy, fm);
  const aberto = totalEmAberto();
  const baseBarra = recebidoMes + aberto.total;
  const pctRecebido = baseBarra > 0 ? Math.round((recebidoMes / baseBarra) * 100) : 0;

  const exportRow = `
    <button class="action-row" onclick="exportExcel()">
      <svg style="width:20px;height:20px;color:var(--terra)"><use href="#ic-download"/></svg>
      <span class="ar-label">Exportar planilha de ${MES_LONGO[fm - 1].toLowerCase()}</span>
      <svg class="row-arrow"><use href="#ic-arrow"/></svg>
    </button>`;

  if (!gSessoes) {
    content.innerHTML =
      `<div class="empty-state"><div class="empty-state-icon">💰</div>Nenhuma sessão neste mês.</div>` + exportRow;
    return;
  }

  perPatient.sort((a,b) => b.liquido - a.liquido);

  let html = `
    <div class="fin-big-card">
      <div class="fin-big-label">LÍQUIDO DO MÊS</div>
      <div class="fin-big-value">${fmt(gLiquido)}</div>
      <div class="fin-breakdown">
        <div class="fin-line"><span class="fin-line-label">Bruto (${gSessoes} ${gSessoes === 1 ? 'sessão' : 'sessões'})</span><span class="fin-line-value receita">${fmt(gBruto)}</span></div>
        ${gIbp > 0 ? `<div class="fin-line"><span class="fin-line-label">Repasse IBP</span><span class="fin-line-value desc">− ${fmt(gIbp)}</span></div>` : ''}
        ${gSublease > 0 ? `<div class="fin-line"><span class="fin-line-label">Sublocação</span><span class="fin-line-value desc">− ${fmt(gSublease)}</span></div>` : ''}
      </div>
    </div>

    <div class="duo-grid">
      <div class="duo-card">
        <div class="duo-label">RECEBIDO</div>
        <div class="duo-value">${fmt(recebidoMes)}</div>
        <div class="meter"><span class="m-green" style="width:${pctRecebido}%"></span></div>
        <div class="duo-sub">${baseBarra > 0 ? pctRecebido + '% do previsto' : 'sem valores no período'}</div>
      </div>
      <div class="duo-card">
        <div class="duo-label accent">A RECEBER</div>
        <div class="duo-value">${fmt(aberto.total)}</div>
        <div class="meter"><span class="m-terra" style="width:${100 - pctRecebido}%"></span></div>
        <div class="duo-sub">${aberto.sessoes} ${aberto.sessoes === 1 ? 'sessão' : 'sessões'} - ${aberto.pacientes} ${aberto.pacientes === 1 ? 'paciente' : 'pacientes'}</div>
      </div>
    </div>
  `;

  if (aberto.linhas.length) {
    html += `
      <div class="day-summary">
        <span class="ds-main">Em aberto</span>
        <span class="ds-meta">${aberto.pacientes} ${aberto.pacientes === 1 ? 'paciente' : 'pacientes'}</span>
      </div>
      <div class="list-card">
        ${aberto.linhas.map(l => `
          <div class="debt-row" onclick="openPatient('${escAttr(l.name)}')">
            <div class="debt-avatar">${escHtml(iniciais(l.name))}</div>
            <div class="debt-info">
              <div class="debt-name">${escHtml(l.name)}</div>
              <div class="debt-meta">${l.sessoes} ${l.sessoes === 1 ? 'sessão' : 'sessões'}${l.desde ? ' - desde ' + formatDate(l.desde) : ''}</div>
            </div>
            <span class="debt-value">${fmt(l.valor)}</span>
          </div>`).join('')}
      </div>`;
  }

  html += `<p class="section-label">Por paciente no mês</p>`;
  html += perPatient.map(pp => `
    <div class="fin-patient-card">
      <div class="fin-patient-name">${escHtml(pp.name)}</div>
      <div class="fin-patient-grid">
        <div class="fin-patient-row"><span class="lbl">Sessões</span><span class="val">${pp.count}</span></div>
        <div class="fin-patient-row"><span class="lbl">Bruto</span><span class="val">${fmt(pp.bruto)}</span></div>
        ${pp.ibp > 0 ? `<div class="fin-patient-row"><span class="lbl">Repasse IBP</span><span class="val" style="color:var(--yellow)">− ${fmt(pp.ibp)}</span></div>` : ''}
        ${pp.sublease > 0 ? `<div class="fin-patient-row"><span class="lbl">Sublocação</span><span class="val" style="color:var(--yellow)">− ${fmt(pp.sublease)}</span></div>` : ''}
        <div class="fin-patient-row total"><span class="lbl">Líquido</span><span class="val">${fmt(pp.liquido)}</span></div>
      </div>
    </div>
  `).join('');

  html += exportRow;
  content.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════════
//  RELATÓRIOS
// ════════════════════════════════════════════════════════════════════════════
let relMeses = 6;
function setRelPeriodo(n) { relMeses = n; renderRelatorios(); }

function renderRelatorios() {
  const content = document.getElementById('relContent');
  const fmt = v => 'R$ ' + v.toFixed(2).replace('.', ',');
  const agora = new Date();

  // ── Série de faturamento líquido por mês ──
  const serie = [];
  for (let i = relMeses - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    serie.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, rotulo: MES_CURTO[d.getMonth()], liquido: 0 });
  }

  let sessoesMesAtual = 0, brutoMesAtual = 0, faltasMesAtual = 0, totalMesAtual = 0;
  let porIbp = 0, porOnline = 0;

  db.patients.forEach(p => {
    (db.sessions[p.name] || []).forEach(s => {
      const [sy, sm] = s.date.split('-').map(Number);
      const entra = !(s.tipo === 'Falta' && s.chargeAbsence === false);
      const fin = computeSessionFinance(s, p);

      const alvo = serie.find(x => x.ano === sy && x.mes === sm);
      if (alvo && entra) alvo.liquido += fin.liquido;

      if (sy === agora.getFullYear() && sm === agora.getMonth() + 1) {
        totalMesAtual++;
        if (s.tipo === 'Falta') faltasMesAtual++;
        if (entra) { sessoesMesAtual++; brutoMesAtual += fin.bruto; }
        const modo = s.attendanceMode || 'Presencial no IBP';
        if (entra) { if (modo === 'Online') porOnline += fin.bruto; else porIbp += fin.bruto; }
      }
    });
  });

  const valores = serie.map(x => x.liquido);
  const maxV = Math.max(...valores, 1);
  const soma = valores.reduce((a, b) => a + b, 0);
  const media = valores.length ? soma / valores.length : 0;
  const alturaMedia = Math.min(100, (media / maxV) * 100);

  const mediaSessao = sessoesMesAtual > 0 ? brutoMesAtual / sessoesMesAtual : 0;
  const presenca = totalMesAtual > 0 ? Math.round(((totalMesAtual - faltasMesAtual) / totalMesAtual) * 100) : 100;

  const totalModal = porIbp + porOnline;
  const pctIbp = totalModal > 0 ? Math.round((porIbp / totalModal) * 100) : 0;
  const pctOnline = totalModal > 0 ? 100 - pctIbp : 0;

  const barras = serie.map((x, i) => {
    const ultimo = i === serie.length - 1;
    const alt = Math.max(2, (x.liquido / maxV) * 100);
    return `
      <div class="bar-col">
        ${ultimo && x.liquido > 0 ? `<span class="bar-value">R$ ${Math.round(x.liquido)}</span>` : ''}
        <div class="bar ${ultimo ? 'is-current' : ''}" style="height:${alt}%"></div>
      </div>`;
  }).join('');

  const eixo = serie.map((x, i) =>
    `<span class="${i === serie.length - 1 ? 'is-current' : ''}">${x.rotulo}</span>`
  ).join('');

  content.innerHTML = `
    <div class="filter-tabs">
      <button class="filter-tab ${relMeses === 6 ? 'active' : ''}" onclick="setRelPeriodo(6)">6 meses</button>
      <button class="filter-tab ${relMeses === 12 ? 'active' : ''}" onclick="setRelPeriodo(12)">12 meses</button>
    </div>

    <div class="chart-card">
      <div class="chart-head">
        <span class="chart-title">Faturamento líquido</span>
        <span class="chart-note">média ${fmt(media)}</span>
      </div>
      <div class="chart-area">
        <div class="chart-avg" style="bottom:${alturaMedia}%"></div>
        <div class="chart-bars">${barras}</div>
      </div>
      <div class="chart-axis">${eixo}</div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-num">${fmt(mediaSessao)}</div>
        <div class="kpi-lbl">média por<br>sessão</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-num">${presenca}%</div>
        <div class="kpi-lbl">taxa de<br>presença</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-num">${sessoesMesAtual}</div>
        <div class="kpi-lbl">sessões<br>no mês</div>
      </div>
    </div>

    <div class="split-card">
      <div class="split-title">Por modalidade no mês</div>
      <div class="split-row"><span class="sr-label">Presencial</span><span class="sr-value">${fmt(porIbp)}</span></div>
      <div class="split-bar"><span class="m-terra" style="width:${pctIbp}%;background:var(--terra)"></span></div>
      <div class="split-row"><span class="sr-label">Online</span><span class="sr-value">${fmt(porOnline)}</span></div>
      <div class="split-bar"><span style="width:${pctOnline}%;background:var(--terra-dim)"></span></div>
    </div>

    <button class="action-row" onclick="exportExcel()">
      <svg style="width:20px;height:20px;color:var(--terra)"><use href="#ic-download"/></svg>
      <span class="ar-label">Exportar planilha completa</span>
      <svg class="row-arrow"><use href="#ic-arrow"/></svg>
    </button>`;
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

// Mantida por compatibilidade: a tela agora é sempre "dia selecionado na semana"
function setAgendaView(view) { agendaView = view || 'day'; renderAgenda(); }

// As setas movem de semana em semana
function agendaNavigate(dir) {
  agendaRefDate.setDate(agendaRefDate.getDate() + dir * 7);
  renderAgenda();
}

// Toque num dia da faixa
function selectAgendaDay(dateStr) {
  agendaRefDate = parseDateStr(dateStr);
  renderAgenda();
}

// Semana começando na segunda-feira
function startOfWeek(d) {
  const r = new Date(d);
  const offset = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - offset);
  r.setHours(0, 0, 0, 0);
  return r;
}

function statusClass(status) {
  if (status === 'Confirmado') return 'st-confirmado';
  if (status === 'Falta') return 'st-falta';
  if (status === 'Remarcado') return 'st-remarcado';
  return 'st-naoconfirmado';
}

const DOW_CURTO = ['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];

// Rótulo curto de status na linha do tempo
function statusLabel(status) {
  if (status === 'Confirmado') return 'Confirmada';
  if (status === 'Falta') return 'Falta';
  if (status === 'Remarcado') return 'Remarcado';
  return 'A confirmar';
}

function renderAgenda() {
  const label = document.getElementById('agendaNavLabel');
  const strip = document.getElementById('agendaWeekStrip');
  const content = document.getElementById('agendaContent');
  const sumMain = document.getElementById('agendaDaySummary');
  const sumMeta = document.getElementById('agendaDayValue');

  const hoje = new Date();
  const todayStr = toDateStr(hoje);
  const selStr = toDateStr(agendaRefDate);

  // ── Faixa da semana ──
  const start = startOfWeek(agendaRefDate);
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dias.push(d);
  }
  label.textContent = `${MESES[agendaRefDate.getMonth()]} ${agendaRefDate.getFullYear()}`;

  strip.innerHTML = dias.map((d, i) => {
    const dStr = toDateStr(d);
    const temAppt = (db.appointments || []).some(a => a.date === dStr);
    const classes = [
      'week-day',
      dStr === selStr ? 'is-selected' : '',
      dStr < todayStr ? 'is-past' : '',
      temAppt ? 'has-appt' : ''
    ].filter(Boolean).join(' ');
    return `
      <button class="${classes}" onclick="selectAgendaDay('${dStr}')">
        <span class="wd-dow">${DOW_CURTO[i]}</span>
        <span class="wd-num">${d.getDate()}</span>
        <span class="wd-dot"></span>
      </button>`;
  }).join('');

  // ── Atendimentos do dia selecionado ──
  const appts = (db.appointments || [])
    .filter(a => a.date === selStr)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));

  // ── Sessões já registradas no prontuário neste mesmo dia ──
  const sessoesDia = [];
  db.patients.forEach(p => {
    (db.sessions[p.name] || []).forEach(s => { if (s.date === selStr) sessoesDia.push({ p, s }); });
  });
  const temSessao = new Set(sessoesDia.map(x => x.p.name));
  const comAgendamento = new Set(appts.map(a => a.patientName));
  // Sessões sem agendamento correspondente aparecem como linhas próprias
  const sessoesSoltas = sessoesDia.filter(x => !comAgendamento.has(x.p.name));

  // Valor do dia: a sessão registrada manda, o agendamento só entra se não houver sessão
  let valorDia = 0;
  sessoesDia.forEach(({ s }) => {
    if (!(s.tipo === 'Falta' && s.chargeAbsence === false)) valorDia += (s.valor || 0);
  });
  appts.forEach(a => {
    if (temSessao.has(a.patientName)) return;
    if (a.status === 'Falta' || a.status === 'Remarcado') return;
    const p = getPatientObj(a.patientName);
    if (p) valorDia += (p.sessionValue || 0);
  });

  const totalItens = appts.length + sessoesSoltas.length;

  sumMain.textContent = totalItens === 0
    ? 'Nenhum atendimento'
    : `${totalItens} ${totalItens === 1 ? 'atendimento' : 'atendimentos'}`;
  sumMeta.textContent = valorDia > 0 ? `${fmtBRL(valorDia)} no dia` : '';

  if (!totalItens) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🗓️</div>Nada neste dia.<br>Toque no + para agendar.</div>`;
    return;
  }

  const prox = proximoAtendimento();
  const idProx = prox ? prox._id : null;

  let html = appts.map(a => {
    const p = getPatientObj(a.patientName);
    const sc = statusClass(a.status);
    const jaRegistrada = temSessao.has(a.patientName);
    const ehAgora = !jaRegistrada && a._id === idProx && a.date === todayStr;
    const jaPassou = !ehAgora && (jaRegistrada || a.date < todayStr || a.status === 'Falta' || a.status === 'Remarcado' ||
                     (a.date === todayStr && minutosAte(a) < -30));

    const partes = [];
    if (p) {
      partes.push(p.capturedByIbp ? 'Captado pelo IBP' : 'Particular');
      if (p.sessionValue) partes.push(fmtBRL(p.sessionValue));
    }
    if (a.status === 'Falta') partes.push('falta');

    return `
      <div class="tl-row ${ehAgora ? 'is-now' : ''} ${jaPassou ? 'is-done' : ''}">
        <div class="tl-time">${escHtml(a.time)}</div>
        <div class="appt-card ${ehAgora ? 'is-now' : ''}">
          <div class="appt-top">
            <span class="appt-name">${escHtml(a.patientName)}</span>
            ${ehAgora
              ? `<span class="appt-now-pill">${textoEspera(minutosAte(a)).toUpperCase()}</span>`
              : (jaRegistrada
                  ? `<span class="appt-status-btn st-confirmado">Registrada</span>`
                  : `<button class="appt-status-btn ${sc}" onclick="cycleApptStatus('${escAttr(a._id)}')">${statusLabel(a.status)}</button>`)}
            <button class="appt-delete" onclick="deleteAppt('${escAttr(a._id)}')" title="Excluir agendamento">
              <svg><use href="#ic-trash"/></svg>
            </button>
          </div>
          <div class="appt-meta">${escHtml(partes.join(' · ')) || '&nbsp;'}</div>
          ${ehAgora ? `
          <div class="appt-actions">
            <button class="btn-primary" onclick="setApptStatus('${escAttr(a._id)}','Confirmado')">Confirmar</button>
            <button class="btn-ghost" onclick="setApptStatus('${escAttr(a._id)}','Remarcado')">Remarcar</button>
          </div>` : ''}
        </div>
      </div>`;
  }).join('');

  // Sessões registradas no prontuário que não têm agendamento no dia
  html += sessoesSoltas.map(({ p, s }) => {
    const partes = [];
    if (s.sessionNumber != null) partes.push(`${s.sessionNumber}ª sessão`);
    partes.push(s.attendanceMode || 'Presencial no IBP');
    if (s.valor) partes.push(fmtBRL(s.valor));
    const falta = s.tipo === 'Falta';
    return `
      <div class="tl-row is-done" onclick="openPatient('${escAttr(p.name)}')">
        <div class="tl-time">—</div>
        <div class="appt-card">
          <div class="appt-top">
            <span class="appt-name">${escHtml(p.name)}</span>
            <span class="appt-status-btn ${falta ? 'st-falta' : 'st-confirmado'}">${falta ? 'Falta' : 'Registrada'}</span>
          </div>
          <div class="appt-meta">${escHtml(partes.join(' · '))}</div>
        </div>
      </div>`;
  }).join('');

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
//  DUPLICADOS — detecta nomes parecidos entre pacientes
// ════════════════════════════════════════════════════════════════════════════
// Distância de Levenshtein (número de edições entre duas strings)
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Retorna pares de nomes considerados possíveis duplicados
function findDuplicates() {
  const names = db.patients.map(p => p.name);
  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = normalize(names[i]).replace(/\s+/g, ' ').trim();
      const b = normalize(names[j]).replace(/\s+/g, ' ').trim();
      if (!a || !b) continue;
      // Idênticos após normalizar (ex.: "Maria " x "maria") ou muito próximos
      const dist = levenshtein(a, b);
      const maxLen = Math.max(a.length, b.length);
      // Considera duplicado se: iguais normalizados, ou 1-2 edições em nomes de tamanho razoável,
      // ou um nome contém o outro inteiro (ex.: "Ana" x "Ana Paula" NÃO — evita falso positivo exigindo proximidade)
      const isNearIdentical = (dist === 0) || (dist <= 2 && maxLen >= 5 && dist / maxLen <= 0.2);
      if (isNearIdentical) {
        pairs.push([names[i], names[j]]);
      }
    }
  }
  return pairs;
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

  // Aviso de possíveis duplicados (só quando não há busca ativa, pra não poluir)
  let dupBanner = '';
  if (!term) {
    const dups = findDuplicates();
    if (dups.length) {
      const items = dups.map(([a, b]) =>
        `<div class="dup-pair">“${escHtml(a)}” e “${escHtml(b)}”</div>`
      ).join('');
      dupBanner = `
        <div class="dup-alert">
          <div class="dup-alert-head">
            <span class="dup-alert-title">⚠️ Possíveis pacientes duplicados</span>
          </div>
          <div class="dup-alert-body">
            ${items}
            <div class="dup-alert-hint">Revise se são a mesma pessoa. Toque em um paciente para abrir e, se precisar, exclua o repetido.</div>
          </div>
        </div>`;
    }
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
    grid.innerHTML = dupBanner + `<div class="empty-state"><div class="empty-state-icon">🔍</div>${msg}</div>`;
    return;
  }

  // Agrupa por letra inicial, como no desenho aprovado
  const grupos = [];
  matches.forEach(p => {
    const letra = (normalize(p.name).trim()[0] || '#').toUpperCase();
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.letra === letra) ultimo.itens.push(p);
    else grupos.push({ letra, itens: [p] });
  });

  grid.innerHTML = dupBanner + grupos.map(g => `
    <div class="letter-label">${escHtml(g.letra)}</div>
    <div class="letter-group">
      ${g.itens.map(p => `
        <div class="patient-card" onclick="openPatient('${escAttr(p.name)}')">
          <div class="patient-avatar">${escHtml(iniciais(p.name))}</div>
          <div class="patient-info">
            <div class="patient-name">${escHtml(p.name)}</div>
          </div>
          <svg class="row-arrow"><use href="#ic-arrow"/></svg>
        </div>`).join('')}
    </div>`).join('');
}

// ════════════════════════════════════════════════════════════════════════════
//  VISÃO DO PACIENTE (Prontuário)
// ════════════════════════════════════════════════════════════════════════════
function openPatient(name) {
  currentPatient = name;
  currentTab = 'patient';
  showScreen('screenPatient');
  setActiveNav('pacientes');
  updateFab('patient');
  document.getElementById('fPayDate').value = new Date().toISOString().split('T')[0];
  cancelEditSession(); // garante que o formulário começa em modo "novo"
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
      <button class="btn-edit-patient" onclick="openEditPatient('${escAttr(p.name)}')">Editar dados do paciente</button>
      <button class="btn-edit-patient" style="border-color:var(--red);color:var(--red)" onclick="deletePatient('${escAttr(p.name)}')">Excluir paciente</button>
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
    const numLabel = (s.sessionNumber != null) ? `<span class="session-num">Sessão ${s.sessionNumber}</span>` : '';
    return `
      <div class="session-card ${cardClass}">
        <div class="session-card-top">
          ${numLabel}
          <div class="session-date">${formatDate(s.date)}</div>
          <span class="session-badge ${badgeClass}">${escHtml(s.tipo)}</span>
          <div class="session-value">R$ ${(s.valor||0).toFixed(2).replace('.',',')}</div>
          <button class="session-edit" onclick="openEditSession('${escAttr(s._id)}')" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:middle"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
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
//  NÚMERO DA SESSÃO — próximo número automático (conta todas as sessões)
// ════════════════════════════════════════════════════════════════════════════
function nextSessionNumber(name, excludeId = null) {
  const sessions = (db.sessions[name] || []).filter(s => s._id !== excludeId);
  let maxNum = 0;
  sessions.forEach(s => {
    if (s.sessionNumber != null && s.sessionNumber > maxNum) maxNum = s.sessionNumber;
  });
  // Se nenhuma sessão tem número ainda, usa a contagem como base
  if (maxNum === 0) return sessions.length + 1;
  return maxNum + 1;
}

// ════════════════════════════════════════════════════════════════════════════
//  SALVAR / EDITAR / EXCLUIR SESSÃO
// ════════════════════════════════════════════════════════════════════════════
async function saveSession() {
  const date   = document.getElementById('fDate').value;
  const tipo   = document.getElementById('fTipo').value;
  const valor  = parseFloat(document.getElementById('fValor').value) || 0;
  const demanda = document.getElementById('fDemanda').value.trim();
  const relato = document.getElementById('fRelato').value.trim();
  const conduta = document.getElementById('fConduta').value.trim();
  const link   = document.getElementById('fLink').value.trim();
  const numRaw = document.getElementById('fSessionNumber').value;

  if (!date) { showToast('⚠️ Informe a data da sessão'); return; }
  const patientId = patientIdByName[currentPatient];
  if (!patientId) { showToast('⚠️ Paciente não encontrado'); return; }

  const chargeAbsence = (tipo === 'Falta') ? chargeAbsenceSelected : true;
  const attendanceMode = document.getElementById('fModo').value;
  const subleaseValue = (attendanceMode === 'Online') ? 0 : (parseFloat(document.getElementById('fSublease').value) || 0);
  const sessionNumber = (numRaw === '' || numRaw == null) ? null : parseInt(numRaw, 10);

  const payload = {
    patient_id: patientId, user_id: currentUser.id,
    date, tipo, valor, demanda, relato, conduta, link,
    charge_absence: chargeAbsence, attendance_mode: attendanceMode, sublease_value: subleaseValue,
    session_number: sessionNumber
  };

  showToast('💾 Salvando…');

  if (editingSessionId) {
    // ── MODO EDIÇÃO ──
    const { error } = await supa.from('sessions').update(payload).eq('id', editingSessionId);
    if (error) { showToast('⚠️ Erro ao salvar edição'); console.error(error); return; }

    const arr = db.sessions[currentPatient] || [];
    const idx = arr.findIndex(s => s._id === editingSessionId);
    if (idx > -1) {
      arr[idx] = {
        _id: editingSessionId, date, tipo, valor, demanda, relato, conduta, link,
        chargeAbsence, attendanceMode, subleaseValue, sessionNumber
      };
    }
    arr.sort((a,b) => a.date.localeCompare(b.date));
    resetSessionForm();
    showToast('✅ Sessão atualizada!');
    renderPatientView();
    return;
  }

  // ── MODO NOVO ──
  const { data, error } = await supa
    .from('sessions')
    .insert(payload)
    .select()
    .single();

  if (error) { showToast('⚠️ Erro ao salvar'); console.error(error); return; }

  db.sessions[currentPatient].push({
    _id: data.id, date, tipo, valor, demanda, relato, conduta, link,
    chargeAbsence, attendanceMode, subleaseValue, sessionNumber
  });
  db.sessions[currentPatient].sort((a,b) => a.date.localeCompare(b.date));

  resetSessionForm();

  const [sy, sm] = date.split('-');
  document.getElementById('monthFilter').value = `${sy}-${sm}`;

  showToast('✅ Sessão salva!');
  renderPatientView();
  setTimeout(() => document.getElementById('sessionList').scrollIntoView({behavior:'smooth'}), 300);
}

// Limpa o formulário de sessão e volta pro modo "novo"
function resetSessionForm() {
  document.getElementById('fValor').value = '';
  document.getElementById('fDemanda').value = '';
  document.getElementById('fRelato').value = '';
  document.getElementById('fConduta').value = '';
  document.getElementById('fLink').value = '';
  document.getElementById('fTipo').value = 'Normal';
  document.getElementById('fModo').value = 'Presencial no IBP';
  document.getElementById('fSublease').value = '';
  document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
  cancelEditSession();
  onTipoChange();
  onModoChange();
}

// Entra em modo edição de uma sessão existente
function openEditSession(sessionId) {
  const arr = db.sessions[currentPatient] || [];
  const s = arr.find(x => x._id === sessionId);
  if (!s) { showToast('⚠️ Sessão não encontrada'); return; }

  editingSessionId = sessionId;
  document.getElementById('fDate').value = s.date;
  document.getElementById('fTipo').value = s.tipo;
  document.getElementById('fValor').value = s.valor || '';
  document.getElementById('fDemanda').value = s.demanda || '';
  document.getElementById('fRelato').value = s.relato || '';
  document.getElementById('fConduta').value = s.conduta || '';
  document.getElementById('fLink').value = s.link || '';
  document.getElementById('fModo').value = s.attendanceMode || 'Presencial no IBP';
  document.getElementById('fSublease').value = s.subleaseValue || '';
  document.getElementById('fSessionNumber').value = (s.sessionNumber != null) ? s.sessionNumber : '';
  setCharge(s.chargeAbsence !== false);
  onTipoChange();
  onModoChange();

  // Muda o rótulo do card e do botão
  document.getElementById('sessionFormHeader').textContent = 'Editar sessão';
  document.getElementById('sessionSaveBtn').textContent = 'Salvar alterações';
  document.getElementById('cancelEditRow').style.display = 'block';

  document.getElementById('fDate').scrollIntoView({ behavior: 'smooth' });
}

// Sai do modo edição, volta pro modo "novo"
function cancelEditSession() {
  editingSessionId = null;
  const hdr = document.getElementById('sessionFormHeader');
  const btn = document.getElementById('sessionSaveBtn');
  const row = document.getElementById('cancelEditRow');
  const numField = document.getElementById('fSessionNumber');
  if (hdr) hdr.textContent = 'Registrar sessão';
  if (btn) btn.textContent = 'Salvar sessão';
  if (row) row.style.display = 'none';
  // Sugere o próximo número automático para uma nova sessão
  if (numField && currentPatient) numField.value = nextSessionNumber(currentPatient);
}

// Botão "cancelar edição" chamado pela interface
function cancelEditSessionClick() {
  resetSessionForm();
  showToast('Edição cancelada');
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
//  ADICIONAR / EDITAR / EXCLUIR PACIENTE
// ════════════════════════════════════════════════════════════════════════════
function openAddPatient() {
  editingPatientName = null;
  document.querySelector('#modalAdd h3').textContent = 'Novo paciente';
  document.getElementById('btnConfirmPatient').textContent = 'Adicionar';
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

// Abre o modal em modo edição, preenchido com os dados do paciente
function openEditPatient(name) {
  const p = getPatientObj(name);
  if (!p) { showToast('⚠️ Paciente não encontrado'); return; }
  editingPatientName = name;
  document.querySelector('#modalAdd h3').textContent = 'Editar paciente';
  document.getElementById('btnConfirmPatient').textContent = 'Salvar alterações';
  document.getElementById('newPatientName').value = p.name;
  document.getElementById('newPatientBirth').value = p.birthDate || '';
  document.getElementById('newPatientPhone').value = p.phone || '';
  document.getElementById('newPatientEmail').value = p.email || '';
  document.getElementById('newPatientValue').value = p.sessionValue || '';
  document.getElementById('newPatientFreq').value = p.frequency || 'Semanal';
  setIbp(!!p.capturedByIbp);
  document.getElementById('modalAdd').classList.add('open');
}

async function confirmAddPatient() {
  const name = document.getElementById('newPatientName').value.trim();
  const birthDate = document.getElementById('newPatientBirth').value || null;
  const phone = document.getElementById('newPatientPhone').value.trim();
  const email = document.getElementById('newPatientEmail').value.trim();
  const sessionValue = parseFloat(document.getElementById('newPatientValue').value) || 0;
  const frequency = document.getElementById('newPatientFreq').value;

  if (!name) { showToast('⚠️ Digite um nome'); return; }

  // ── MODO EDIÇÃO ──
  if (editingPatientName) {
    const oldName = editingPatientName;
    // Se mudou o nome, checa conflito com outro paciente
    if (name !== oldName && db.patients.some(p => p.name === name)) {
      showToast('⚠️ Já existe um paciente com esse nome'); return;
    }
    const patientId = patientIdByName[oldName];
    if (!patientId) { showToast('⚠️ Paciente não encontrado'); return; }

    const { error } = await supa.from('patients').update({
      name, birth_date: birthDate, phone, email,
      session_value: sessionValue, frequency, captured_by_ibp: ibpSelected
    }).eq('id', patientId);

    if (error) { showToast('⚠️ Erro ao salvar'); console.error(error); return; }

    // Atualiza estado local
    const p = getPatientObj(oldName);
    if (p) {
      p.name = name; p.birthDate = birthDate || ''; p.phone = phone; p.email = email;
      p.sessionValue = sessionValue; p.frequency = frequency; p.capturedByIbp = ibpSelected;
    }
    // Se o nome mudou, precisa remapear as chaves que usam o nome
    if (name !== oldName) {
      db.sessions[name] = db.sessions[oldName] || [];
      db.payments[name] = db.payments[oldName] || [];
      delete db.sessions[oldName];
      delete db.payments[oldName];
      patientIdByName[name] = patientId;
      delete patientIdByName[oldName];
      db.appointments.forEach(a => { if (a.patientName === oldName) a.patientName = name; });
      if (currentPatient === oldName) currentPatient = name;
    }
    db.patients.sort((a,b) => a.name.localeCompare(b.name));

    editingPatientName = null;
    closeAddPatient();
    showToast('✅ Dados atualizados!');
    if (currentPatient) { openPatient(currentPatient); } else { renderIndex(); }
    return;
  }

  // ── MODO NOVO ──
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

  // Se estava no prontuário desse paciente, volta pra lista
  if (currentPatient === name) { switchTab('pacientes'); }
  else { renderIndex(); }
  showToast(`🗑 ${name} excluído(a)`);
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
//  MOTOR DE PAGAMENTOS  (BUG CORRIGIDO: valor 0 nunca é "Paga")
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
    // Só marca "Paga" se há valor real (>0) E o saldo cobre. Valor 0 → sempre Pendente.
    if (valor > 0 && saldo >= valor) {
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

let chargeAbsenceSelected = true;

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
    'Paciente','Nº Sessão','Data','Mês','Tipo','Forma de Atendimento','Valor (R$)',
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
      p.name, (s.sessionNumber != null ? s.sessionNumber : ''), formatDate(s.date), `${m}/${y}`, s.tipo,
      s.attendanceMode || 'Presencial no IBP', round2(s.valor||0),
      stLabel, round2(fin.percentIbp), round2(fin.sublocacao), round2(fin.liquido),
      s.demanda||'', s.relato||'', s.conduta||'', s.link||''
    ]);
  });

  const wsDet = XLSX.utils.aoa_to_sheet(detRows);
  wsDet['!cols'] = [
    {wch:24},{wch:9},{wch:12},{wch:9},{wch:12},{wch:22},{wch:11},
    {wch:15},{wch:15},{wch:15},{wch:13},
    {wch:30},{wch:30},{wch:30},{wch:28}
  ];
  XLSX.utils.book_append_sheet(wb, wsDet, 'Sessões Detalhadas');

  // ── UMA ABA POR PACIENTE (para preencher o prontuário individual) ────────
  // Nome de aba no Excel: máx. 31 caracteres, sem : \ / ? * [ ]
  // e precisa ser único — homônimos ganham sufixo (2), (3)...
  const usedSheetNames = new Set(['Resumo por Paciente', 'Sessões Detalhadas']);
  function safeSheetName(rawName) {
    let base = String(rawName).replace(/[:\\\/\?\*\[\]]/g, '').trim() || 'Paciente';
    let name = base.slice(0, 31);
    if (!usedSheetNames.has(name)) { usedSheetNames.add(name); return name; }
    for (let i = 2; i < 100; i++) {
      const suffix = ` (${i})`;
      const candidate = base.slice(0, 31 - suffix.length) + suffix;
      if (!usedSheetNames.has(candidate)) { usedSheetNames.add(candidate); return candidate; }
    }
    return base.slice(0, 28) + '...';
  }

  db.patients.forEach(p => {
    const ss = db.sessions[p.name] || [];
    const pag = computePaymentStatus(p.name);
    const age = calcAge(p.birthDate);

    const rows = [];
    // Cabeçalho com os dados cadastrais do paciente
    rows.push([p.name]);
    rows.push(['Status', computeStatus(p)]);
    if (age !== null) rows.push(['Idade', `${age} anos`]);
    if (p.birthDate) rows.push(['Nascimento', formatDate(p.birthDate)]);
    if (p.phone) rows.push(['Telefone', p.phone]);
    if (p.email) rows.push(['E-mail', p.email]);
    if (p.frequency) rows.push(['Frequência', p.frequency]);
    if (p.sessionValue) rows.push(['Valor da sessão (R$)', round2(p.sessionValue)]);
    rows.push(['Captado pelo IBP', p.capturedByIbp ? 'Sim' : 'Não']);
    rows.push([]);

    // Tabela de sessões deste paciente
    rows.push([
      'Nº Sessão','Data','Tipo','Forma de Atendimento','Valor (R$)','Status Pagamento',
      'Desconto IBP (R$)','Sublocação (R$)','Líquido (R$)','Demanda','Relato','Conduta','Link'
    ]);

    let tBruto = 0, tIbp = 0, tSub = 0, tLiq = 0;
    let tPagas = 0, tPend = 0, tFaltas = 0, tRemarc = 0;

    ss.forEach(s => {
      const st = pag.statusById[s._id] || '';
      const stLabel = st === 'Paga' ? 'Paga' : (st === 'Pendente' ? 'Pendente' : 'Não cobrada');
      const fin = computeSessionFinance(s, p);

      if (s.tipo === 'Falta') tFaltas++;
      if (s.tipo === 'Remarcação') tRemarc++;
      if (st === 'Paga') tPagas++;
      else if (st === 'Pendente') tPend++;

      const entra = !(s.tipo === 'Falta' && s.chargeAbsence === false);
      if (entra) { tBruto += fin.bruto; tIbp += fin.percentIbp; tSub += fin.sublocacao; tLiq += fin.liquido; }

      rows.push([
        (s.sessionNumber != null ? s.sessionNumber : ''),
        formatDate(s.date), s.tipo, s.attendanceMode || 'Presencial no IBP',
        round2(s.valor||0), stLabel,
        round2(fin.percentIbp), round2(fin.sublocacao), round2(fin.liquido),
        s.demanda||'', s.relato||'', s.conduta||'', s.link||''
      ]);
    });

    if (!ss.length) rows.push(['—','Nenhuma sessão registrada ainda']);

    // Totais do paciente
    const recebido = (db.payments[p.name] || []).reduce((a,x)=>a+(x.amount||0),0);
    rows.push([]);
    rows.push(['TOTAL SESSÕES', ss.length]);
    rows.push(['Pagas', tPagas]);
    rows.push(['Pendentes', tPend]);
    rows.push(['Faltas', tFaltas]);
    rows.push(['Remarcações', tRemarc]);
    rows.push(['Valor bruto (R$)', round2(tBruto)]);
    rows.push(['Recebido (R$)', round2(recebido)]);
    rows.push(['Pago ao IBP (R$)', round2(tIbp)]);
    rows.push(['Sublocação (R$)', round2(tSub)]);
    rows.push(['LUCRO LÍQUIDO (R$)', round2(tLiq)]);

    const wsP = XLSX.utils.aoa_to_sheet(rows);
    wsP['!cols'] = [
      {wch:10},{wch:12},{wch:13},{wch:22},{wch:12},{wch:16},
      {wch:16},{wch:16},{wch:14},{wch:34},{wch:34},{wch:34},{wch:28}
    ];
    XLSX.utils.book_append_sheet(wb, wsP, safeSheetName(p.name));
  });

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  XLSX.writeFile(wb, `Ancora_backup_${stamp}.xlsx`);
  showToast('✅ Excel baixado!');
}

// ── Listeners Finais ────────────────────────────────────────────────────────
const _modalAdd = document.getElementById('modalAdd');
if (_modalAdd) _modalAdd.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAddPatient();
});
const _modalAppt = document.getElementById('modalAppt');
if (_modalAppt) _modalAppt.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAddAppt();
});
const _newPatientName = document.getElementById('newPatientName');
if (_newPatientName) _newPatientName.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmAddPatient();
});
