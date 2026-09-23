const API = '../backend/api.php';

const state = {
  user: null,
  config: {},
  dashboard: null,
  vehicles: [],
  passages: [],
  notifications: [],
  profile: null,
  language: localStorage.getItem('roadpass_language') || 'tr',
  currentPage: 'dashboard',
  historyTrash: false,
  historyFiltered: [],
  currentJourney: null,
  selectedJourneyIndex: 0,
  addresses: [],
  vehicleExpenses: [],
  vehicleReminders: [],
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function t(path, fallback = path) {
  const dictionary = window.ROADPASS_TRANSLATIONS?.[state.language] || window.ROADPASS_TRANSLATIONS?.tr || {};
  const value = path.split('.').reduce((current, key) => current?.[key], dictionary);
  return value ?? fallback;
}

function applyTranslations(root = document) {
  document.documentElement.lang = state.language;
  $$('[data-i18n]', root).forEach(el => { el.textContent = t(el.dataset.i18n, el.textContent); });
  $$('[data-i18n-placeholder]', root).forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder, el.placeholder); });
  document.title = `RoadPass — ${t('slogan')}`;
}

function setLanguage(language) {
  state.language = language === 'en' ? 'en' : 'tr';
  localStorage.setItem('roadpass_language', state.language);
  applyTranslations();
  updateHeaderMembership();
}

async function api(action, options = {}) {
  const config = { credentials: 'same-origin', ...options };
  const query = config.query || '';
  delete config.query;
  if (config.body && typeof config.body !== 'string' && !(config.body instanceof FormData)) {
    config.headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(`${API}?action=${encodeURIComponent(action)}${query}`, config);
  let data;
  try { data = await response.json(); } catch { data = { success: false, message: 'Invalid server response.' }; }
  if (!response.ok || !data.success) throw new Error(data.message || 'Operation failed.');
  return data;
}

function formatMoney(value, currency = 'TRY') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return t('route.unknownToll');
  return new Intl.NumberFormat(state.language === 'en' ? 'en-US' : 'tr-TR', { style: 'currency', currency }).format(Number(value || 0));
}

function formatDate(value, includeTime = true) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  return new Intl.DateTimeFormat(state.language === 'en' ? 'en-GB' : 'tr-TR', includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

function formatDuration(seconds) {
  const totalMinutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} ${state.language === 'en' ? 'h' : 'sa'} ${minutes} ${state.language === 'en' ? 'min' : 'dk'}` : `${minutes} ${state.language === 'en' ? 'min' : 'dk'}`;
}

function formatDistance(meters) {
  return `${(Number(meters || 0) / 1000).toLocaleString(state.language === 'en' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 1 })} km`;
}

function initials(name = 'Road Pass') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(item => item[0]).join('').toUpperCase();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function toastAction(message, label, action, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type} toast-with-action`;
  el.innerHTML = `<span>${escapeHtml(message)}</span><button type="button">${escapeHtml(label)}</button>`;
  const timer = setTimeout(() => el.remove(), 6500);
  $('button', el).addEventListener('click', async () => {
    clearTimeout(timer);
    try { await action(); el.remove(); } catch (error) { toast(error.message, 'error'); }
  });
  $('#toastContainer').appendChild(el);
}

function setButtonLoading(button, loading, text = '') {
  if (!button) return;
  if (loading) {
    button.dataset.oldHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="loading"></span>${text ? ` ${escapeHtml(text)}` : ''}`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.oldHtml || button.innerHTML;
  }
}

function showAuth() {
  document.body.classList.remove('premium-active', 'standard-active');
  $('#authView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
  applyTranslations($('#authView'));
}

function applyUserExperience() {
  document.body.classList.toggle('simple-mode', Number(state.user?.simple_mode || 0) === 1);
  document.body.classList.toggle('large-text', Number(state.user?.large_text || 0) === 1);
  ['aurora','mint','midnight'].forEach(theme => document.body.classList.toggle(`accent-${theme}`, (state.user?.accent_theme || 'aurora') === theme));
}

function updateHeaderMembership() {
  const premium = state.user?.membership === 'premium';
  $('#headerMembership').textContent = premium ? t('membership.premium') : t('membership.standard');
  $('#headerMembership').classList.toggle('premium-text', premium);
  const premiumTheme = premium && Number(state.user?.premium_theme_enabled ?? 1) === 1;
  document.body.classList.toggle('premium-active', premiumTheme);
  document.body.classList.toggle('standard-active', !premiumTheme);
  applyUserExperience();
}

function pageGuideContent(page = state.currentPage) {
  const guides = state.language === 'en' ? {
    dashboard:['Your vehicle readiness centre','See what needs attention today, your readiness score, balance risk, and the next 30-day estimated cost.'],
    wallet:['HGS balance centre','RoadPass stores demo balance only. Use the official PTT button for real HGS transactions.'],
    vehicles:['Vehicle life centre','Add a vehicle with only plate, brand, and model. Expenses, inspection, insurance, and maintenance reminders are optional.'],
    history:['Passage history','Filter HGS records, export them, or move unwanted records to Trash.'],
    route:['Journey budget','Compare known HGS cost, fuel or charging need, and parking. Unknown tolls are never invented.'],
    assistant:['RoadPass guide','Ask about your balance, vehicle costs, reminders, or how to use the application.'],
    notifications:['Important updates','Low-balance, passage, subscription, and reminder updates appear here.'],
    premium:['RoadPass Premium','Premium focuses on better forecasts, readiness intelligence, reports, and personal appearance—not just extra vehicles.'],
    help:['Application guide','Learn each section, open official services, and create a support request.'],
    profile:['Accessibility and preferences','Change language, large text, simple mode, notifications, and your visual theme.'],
  } : {
    dashboard:['Araç hazırlık merkeziniz','Bugün ilgilenmeniz gerekenleri, hazırlık puanını, bakiye riskini ve önümüzdeki 30 günlük tahmini gideri gösterir.'],
    wallet:['HGS bakiye merkezi','RoadPass yalnızca demo bakiye tutar. Gerçek HGS işlemi için resmî PTT düğmesini kullanın.'],
    vehicles:['Araç yaşam merkezi','Aracı yalnızca plaka, marka ve modelle ekleyebilirsiniz. Giderler ile muayene, sigorta ve bakım hatırlatmaları isteğe bağlıdır.'],
    history:['Geçiş geçmişi','HGS kayıtlarını filtreleyebilir, dışa aktarabilir veya çöp kutusuna taşıyabilirsiniz.'],
    route:['Yolculuk bütçesi','Doğrulanabilen HGS maliyetini, yakıt/şarj ihtiyacını ve otoparkı birlikte gösterir. Bilinmeyen ücretler uydurulmaz.'],
    assistant:['RoadPass rehberi','Bakiyeniz, araç giderleriniz, hatırlatmalar veya uygulamanın kullanımı hakkında soru sorabilirsiniz.'],
    notifications:['Önemli güncellemeler','Düşük bakiye, geçiş, abonelik ve hatırlatma bildirimleri burada görünür.'],
    premium:['RoadPass Premium','Premium yalnızca araç limitini değil; daha iyi öngörü, hazırlık analizi, raporlar ve kişisel görünüm sunar.'],
    help:['Uygulama rehberi','Her bölümün görevini öğrenebilir, resmî servislere gidebilir ve destek talebi açabilirsiniz.'],
    profile:['Erişilebilirlik ve tercihler','Dil, büyük yazı, sade görünüm, bildirimler ve görsel temayı buradan değiştirebilirsiniz.'],
  };
  return guides[page] || guides.dashboard;
}

function showPageGuide(page = state.currentPage) {
  const [title, text] = pageGuideContent(page);
  openModal(`<div class="guide-modal"><span class="guide-icon">?</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><button id="guideClose" class="primary-btn wide">${t('common.close')}</button></div>`);
  $('#guideClose').addEventListener('click', closeModal);
}

function showOnboarding() {
  const key = `roadpass_onboarding_v4_${state.user?.id || 'guest'}`;
  if (localStorage.getItem(key)) return;
  const slides = state.language === 'en' ? [
    ['Everything important, one screen','RoadPass tells you what needs attention today instead of making you search through different services.'],
    ['Add your car in seconds','Plate, brand, and model are enough. Technical details are optional and can be completed later.'],
    ['Use official services safely','RoadPass guides you to PTT, e-Government, and TÜVTÜRK for real transactions.'],
  ] : [
    ['Önemli olan her şey tek ekranda','RoadPass farklı servislerde aramak yerine bugün ilgilenmeniz gereken işi söyler.'],
    ['Aracınızı saniyeler içinde ekleyin','Plaka, marka ve model yeterlidir. Teknik bilgiler isteğe bağlıdır ve sonra tamamlanabilir.'],
    ['Resmî işlemlere güvenle geçin','Gerçek işlemler için PTT, e-Devlet ve TÜVTÜRK gibi resmî servislere yönlendirilirsiniz.'],
  ];
  let index = 0;
  const draw = () => {
    const [title,text] = slides[index];
    openModal(`<div class="onboarding-card"><div class="onboarding-progress">${slides.map((_,i)=>`<span class="${i===index?'active':''}"></span>`).join('')}</div><div class="onboarding-visual">${['◎','🚗','↗'][index]}</div><span class="eyebrow">ROADPASS ${index+1}/${slides.length}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><div class="modal-actions"><button id="skipOnboarding" class="ghost-btn">${state.language==='en'?'Skip':'Geç'}</button><button id="nextOnboarding" class="primary-btn">${index===slides.length-1?(state.language==='en'?'Start':'Başla'):(state.language==='en'?'Next':'Devam')}</button></div></div>`);
    $('#skipOnboarding').addEventListener('click',()=>{localStorage.setItem(key,'1');closeModal();});
    $('#nextOnboarding').addEventListener('click',()=>{if(index<slides.length-1){index++;draw();}else{localStorage.setItem(key,'1');closeModal();}});
  };
  draw();
}

function showApp() {
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#headerUserName').textContent = state.user.full_name || state.user.name;
  $('#avatarInitials').textContent = initials(state.user.full_name || state.user.name);
  updateHeaderMembership();
  applyTranslations($('#appView'));
  setTimeout(showOnboarding, 450);
}

async function bootstrap() {
  applyTranslations();
  bindStaticEvents();
  try {
    const cfg = await api('config');
    state.config = cfg.config;
  } catch { state.config = {}; }
  try {
    const data = await api('me');
    state.user = data.user;
    setLanguage(data.user.language || state.language);
    showApp();
    await loadPage('dashboard');
  } catch {
    showAuth();
  }
}

function bindStaticEvents() {
  $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.auth-tab').forEach(item => item.classList.toggle('active', item === tab));
    $$('.auth-form').forEach(form => form.classList.toggle('active', form.id === `${tab.dataset.authTab}Form`));
  }));
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#registerForm').addEventListener('submit', handleRegister);
  $('#logoutBtn').addEventListener('click', handleLogout);
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#explainPageBtn').addEventListener('click', () => showPageGuide());
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', event => { if (event.target.id === 'modal') closeModal(); });
  $$('[data-page]').forEach(btn => btn.addEventListener('click', () => loadPage(btn.dataset.page)));
  $$('[data-page-shortcut]').forEach(btn => btn.addEventListener('click', () => loadPage(btn.dataset.pageShortcut)));
}

async function handleLogin(event) {
  event.preventDefault();
  const button = event.submitter;
  setButtonLoading(button, true, t('common.loading'));
  try {
    const data = await api('login', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) });
    state.user = data.user;
    setLanguage(data.user.language || state.language);
    const me = await api('me');
    state.user = me.user;
    showApp();
    await loadPage('dashboard');
    toast(t('toast.login'));
  } catch (error) { toast(error.message, 'error'); }
  finally { setButtonLoading(button, false); }
}

async function handleRegister(event) {
  event.preventDefault();
  const button = event.submitter;
  setButtonLoading(button, true, t('common.loading'));
  try {
    await api('register', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) });
    const me = await api('me');
    state.user = me.user;
    setLanguage(me.user.language || 'tr');
    showApp();
    await loadPage('dashboard');
    toast(t('toast.registered'));
  } catch (error) { toast(error.message, 'error'); }
  finally { setButtonLoading(button, false); }
}

async function handleLogout() {
  try { await api('logout', { method: 'POST' }); } catch {}
  state.user = null;
  showAuth();
  toast(t('toast.logout'));
}

function pageMeta(page) {
  return t(`page.${page}`, t('page.dashboard'));
}

async function loadPage(page) {
  state.currentPage = page;
  const [eyebrow, title] = pageMeta(page);
  $('#pageEyebrow').textContent = eyebrow;
  $('#pageTitle').textContent = title;
  $$('.nav-item[data-page]').forEach(item => item.classList.toggle('active', item.dataset.page === page));
  $('.premium-box')?.classList.toggle('active', page === 'premium');
  $('#sidebar').classList.remove('open');
  $('#pageContent').innerHTML = `<div class="skeleton-grid"><div class="skeleton-card tall"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>`;
  try {
    if (page === 'dashboard') await renderDashboard();
    else if (page === 'wallet') await renderWallet();
    else if (page === 'vehicles') await renderVehicles();
    else if (page === 'history') await renderHistory();
    else if (page === 'route') await renderRoute();
    else if (page === 'assistant') await renderAssistant();
    else if (page === 'notifications') await renderNotifications();
    else if (page === 'premium') await renderPremium();
    else if (page === 'help') await renderHelp();
    else if (page === 'profile') await renderProfile();
  } catch (error) {
    if (error.message.toLowerCase().includes('giriş') || error.message.toLowerCase().includes('sign in')) {
      showAuth();
      return;
    }
    $('#pageContent').innerHTML = `<div class="empty-state"><span>!</span><h3>Content could not be loaded</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

async function refreshUser() {
  const data = await api('me');
  state.user = data.user;
  $('#headerUserName').textContent = state.user.full_name;
  $('#avatarInitials').textContent = initials(state.user.full_name);
  updateHeaderMembership();
}

async function refreshNotificationBadges() {
  try {
    const data = await api('notifications');
    state.notifications = data.notifications;
    const count = state.notifications.filter(item => !Number(item.is_read)).length;
    $('#topNotificationBadge').textContent = count;
    $('#navNotificationBadge').textContent = count;
  } catch {}
}

function metricCard(label, value, icon, foot = '') {
  return `<article class="metric-card"><div class="metric-head"><span>${escapeHtml(label)}</span><span class="metric-icon">${icon}</span></div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-foot">${escapeHtml(foot)}</div></article>`;
}


const TURKEY_PROVINCES = ['Adana','Adıyaman','Afyonkarahisar','Ağrı','Amasya','Ankara','Antalya','Artvin','Aydın','Balıkesir','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkâri','Hatay','Isparta','Mersin','İstanbul','İzmir','Kars','Kastamonu','Kayseri','Kırklareli','Kırşehir','Kocaeli','Konya','Kütahya','Malatya','Manisa','Kahramanmaraş','Mardin','Muğla','Muş','Nevşehir','Niğde','Ordu','Rize','Sakarya','Samsun','Siirt','Sinop','Sivas','Tekirdağ','Tokat','Trabzon','Tunceli','Şanlıurfa','Uşak','Van','Yozgat','Zonguldak','Aksaray','Bayburt','Karaman','Kırıkkale','Batman','Şırnak','Bartın','Ardahan','Iğdır','Yalova','Karabük','Kilis','Osmaniye','Düzce'];
const DISTRICT_HINTS = { 'İstanbul':['Adalar','Arnavutköy','Ataşehir','Avcılar','Bağcılar','Bahçelievler','Bakırköy','Başakşehir','Bayrampaşa','Beşiktaş','Beykoz','Beylikdüzü','Beyoğlu','Büyükçekmece','Çekmeköy','Esenler','Esenyurt','Eyüpsultan','Fatih','Gaziosmanpaşa','Güngören','Kadıköy','Kağıthane','Kartal','Küçükçekmece','Maltepe','Pendik','Sancaktepe','Sarıyer','Silivri','Şile','Şişli','Sultanbeyli','Tuzla','Ümraniye','Üsküdar','Zeytinburnu'], 'Ankara':['Altındağ','Çankaya','Etimesgut','Gölbaşı','Keçiören','Mamak','Pursaklar','Sincan','Yenimahalle'], 'İzmir':['Balçova','Bayraklı','Bornova','Buca','Çiğli','Gaziemir','Karabağlar','Karşıyaka','Konak','Narlıdere'], 'Bursa':['Gemlik','Gürsu','İnegöl','Kestel','Mudanya','Nilüfer','Osmangazi','Yıldırım'], 'Antalya':['Aksu','Alanya','Döşemealtı','Kepez','Konyaaltı','Kumluca','Manavgat','Muratpaşa','Serik'] };
function provinceOptions(selected=''){ return TURKEY_PROVINCES.map(name=>`<option value="${escapeHtml(name)}" ${name===selected?'selected':''}>${escapeHtml(name)}</option>`).join(''); }
function fuelLabel(type){ return ({gasoline:t('vehicles.gasoline'),diesel:t('vehicles.diesel'),lpg:'LPG',hybrid:t('vehicles.hybrid'),electric:t('vehicles.electric'),other:t('vehicles.otherFuel')})[type]||type||'—'; }
function categoryLabel(category){ return t(`expenses.categories.${category}`,category); }
function reminderLabel(type){ return t(`reminders.types.${type}`,type); }
function reminderOfficialLink(type){ return ({inspection:'https://www.turkiye.gov.tr/muayene-randevu-kayit',insurance:'https://www.turkiye.gov.tr/trafik-police-ve-hasar-bilgileri-sorgulama',tax:'https://ivd.gib.gov.tr/',maintenance:'https://www.google.com/maps/search/oto+servisi/',tire:'https://www.google.com/maps/search/lastik+servisi/',other:'https://www.turkiye.gov.tr/'})[type] || 'https://www.turkiye.gov.tr/'; }
function reminderActionLabel(type){ if(type==='inspection')return state.language==='en'?'Book appointment':'Randevu Al'; if(type==='maintenance')return state.language==='en'?'Find service':'Servis Bul'; return state.language==='en'?'Open service':'İşleme Git'; }
function composeStructuredAddress(prefix, form){ const parts=[form.elements[`${prefix}_street`]?.value,form.elements[`${prefix}_building_no`]?.value?`No:${form.elements[`${prefix}_building_no`].value}`:'',form.elements[`${prefix}_neighborhood`]?.value,form.elements[`${prefix}_district`]?.value,form.elements[`${prefix}_province`]?.value].map(x=>(x||'').trim()).filter(Boolean); return parts.join(', '); }

async function renderDashboard() {
  const data = await api('dashboard');
  state.dashboard = data;
  if (state.user) state.user.membership = data.membership;
  updateHeaderMembership();
  $('#headerBalance').textContent = formatMoney(data.metrics.balance);
  await refreshNotificationBadges();

  const firstName = (state.user.full_name || state.user.name || 'RoadPass').split(' ')[0];
  const premium = data.membership === 'premium';
  const readiness = data.readiness || { score: 0, status: 'attention', label: '' , actions: [] };
  const forecast = data.forecast || { hgs:0, vehicle_expenses:0, total:0, categories:[] };
  const analysis = data.balance_analysis || {};
  const scoreClass = readiness.status === 'ready' ? 'safe' : readiness.status === 'attention' ? 'warning' : 'danger';
  const actionIcon = type => ({vehicle:'🚗',wallet:'₺',reminder:'◷',ready:'✓'})[type] || '•';
  const todayActions = (readiness.actions || []).map((item,index) => `<article class="today-action ${item.type}"><span>${actionIcon(item.type)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail || '')}</small></div><div class="today-action-buttons">${item.external_url?`<a href="${escapeHtml(item.external_url)}" target="_blank" rel="noopener" class="text-link">${escapeHtml(item.external_label || (state.language==='en'?'Official service':'Resmî servis'))} ↗</a>`:''}<button class="ghost-btn compact-btn" data-action="${escapeHtml(item.action || 'dashboard')}">${state.language==='en'?'Open':'Aç'}</button></div></article>`).join('');
  const forecastRows = [
    {label: state.language==='en'?'Estimated HGS':'Tahminî HGS', value:forecast.hgs, icon:'↺'},
    {label: state.language==='en'?'Vehicle expenses':'Araç giderleri', value:forecast.vehicle_expenses, icon:'🚗'},
  ].concat((forecast.categories || []).slice(0,3).map(item=>({label:categoryLabel(item.category),value:item.monthly_average,icon:'•'})));
  const forecastHtml = forecastRows.map(row=>`<div class="forecast-line"><span><i>${row.icon}</i>${escapeHtml(row.label)}</span><strong>${formatMoney(row.value)}</strong></div>`).join('');
  const recent = (data.recent_passages || []).length ? data.recent_passages.slice(0,4).map(item=>`<button class="movement-row" data-action="history"><span class="movement-icon">↺</span><span><strong>${escapeHtml(item.location)}</strong><small>${escapeHtml(item.plate || '—')} · ${formatDate(item.passed_at)}</small></span><b>-${formatMoney(item.amount)}</b></button>`).join('') : `<div class="empty-state compact"><span>↺</span><h3>${t('dashboard.noPassages')}</h3><p>${t('dashboard.noPassagesHelp')}</p></div>`;
  const premiumHero = premium ? `<section class="aurora-pro-hero"><div><span class="eyebrow">ROADPASS AURORA</span><h2>${state.language==='en'?`Welcome back, ${escapeHtml(firstName)}`:`Tekrar hoş geldin, ${escapeHtml(firstName)}`}</h2><p>${state.language==='en'?'Your readiness intelligence, forecasts, and official actions are personalised for you.':'Hazırlık analizi, gider öngörüleri ve resmî işlem adımları sizin için kişiselleştirildi.'}</p></div><div class="aurora-pro-orb"><span>PRO</span><b>${readiness.score}</b></div></section>` : '';

  $('#pageContent').innerHTML = `${premiumHero}
    <section class="dashboard-welcome refined-welcome"><div><span class="eyebrow">${state.language==='en'?'VEHICLE READINESS CENTRE':'SÜRÜŞE HAZIRLIK MERKEZİ'}</span><h2>${t('dashboard.hello')}, ${escapeHtml(firstName)}</h2><p>${state.language==='en'?'See what needs attention today and prepare for upcoming vehicle costs.':'Bugün ilgilenmeniz gerekenleri görün, yaklaşan araç masraflarına hazırlanın.'}</p></div><button id="dashboardGuide" class="secondary-btn">? ${state.language==='en'?'How it works':'Nasıl çalışır?'}</button></section>
    <div class="readiness-layout">
      <section class="readiness-card ${scoreClass}">
        <div class="readiness-ring" style="--score:${Math.max(0,Math.min(100,Number(readiness.score||0)))*3.6}deg"><div><strong>${readiness.score}</strong><small>/100</small></div></div>
        <div class="readiness-copy"><span>${state.language==='en'?'ROADPASS READINESS SCORE':'ROADPASS HAZIRLIK PUANI'}</span><h2>${escapeHtml(readiness.label)}</h2><p>${state.language==='en'?'The score combines HGS balance risk, upcoming reminders, and whether a vehicle is registered.':'Puan; HGS bakiye riski, yaklaşan hatırlatmalar ve araç kaydı durumunu birlikte değerlendirir.'}</p><button class="primary-btn" data-action="route">${state.language==='en'?'Plan a journey':'Yolculuk Planla'} →</button></div>
      </section>
      <section class="panel today-panel"><div class="panel-head"><div><h3>${state.language==='en'?'What should I do today?':'Bugün ne yapmalıyım?'}</h3><p>${state.language==='en'?'Clear actions instead of complicated menus.':'Karmaşık menüler yerine net işlem önerileri.'}</p></div></div><div class="today-actions">${todayActions}</div></section>
    </div>
    <div class="dashboard-main-grid">
      <section class="panel forecast-card ${premium?'pro-forecast':''}">
        <div class="panel-head"><div><span class="eyebrow">${premium?'PRO FORECAST':'30 GÜN'}</span><h3>${state.language==='en'?'Next 30-day vehicle cost':'Önümüzdeki 30 günlük araç gideri'}</h3><p>${state.language==='en'?'Based on your recent 90-day records; unknown future bills are not invented.':'Son 90 günlük kayıtlarınıza dayanır; bilinmeyen gelecek masrafları uydurulmaz.'}</p></div>${premium?'<span class="pro-chip">PRO</span>':''}</div>
        <div class="forecast-total"><small>${state.language==='en'?'Estimated known total':'Tahminî bilinen toplam'}</small><strong>${formatMoney(forecast.total)}</strong></div>
        <div class="forecast-lines">${forecastHtml}</div>
        ${premium?`<div class="premium-forecast-extra"><div><small>${state.language==='en'?'90-day outlook':'90 günlük görünüm'}</small><strong>${formatMoney(Number(forecast.total||0)*3)}</strong></div><div><small>${state.language==='en'?'Data window':'Veri dönemi'}</small><strong>${forecast.based_on_days||90} ${state.language==='en'?'days':'gün'}</strong></div></div>`:`<button class="premium-soft-cta" data-action="premium">✦ ${state.language==='en'?'Unlock 90-day outlook and detailed reports':'90 günlük öngörü ve ayrıntılı raporları aç'}</button>`}
      </section>
      <section class="panel balance-mini-centre"><div class="panel-head"><div><h3>${t('dashboard.totalBalance')}</h3><p>${escapeHtml(analysis.message || '')}</p></div><span class="balance-status ${analysis.risk==='high'?'danger':analysis.risk==='medium'?'warning':'safe'}">${t(`dashboard.risk.${analysis.risk||'normal'}`)}</span></div><div class="huge-balance">${formatMoney(data.metrics.balance)}</div><div class="balance-predictions"><div><small>${t('dashboard.estimatedDuration')}</small><b>${analysis.estimated_days===null?t('dashboard.notEnoughData'):`${analysis.estimated_days} ${t('dashboard.days')}`}</b></div><div><small>${t('dashboard.monthProjection')}</small><b>${formatMoney(analysis.projected_month_spend||0)}</b></div></div><div class="balance-actions"><button class="primary-btn" data-action="wallet">₺ ${t('dashboard.topup')}</button><a class="secondary-btn button-link" href="https://hgsmusteri.ptt.gov.tr/" target="_blank" rel="noopener">${state.language==='en'?'Official HGS':'Resmî HGS'} ↗</a></div></section>
    </div>
    <div class="dashboard-lower-grid simplified-dashboard"><section class="panel"><div class="panel-head"><div><h3>${t('dashboard.recent')}</h3><p>${state.language==='en'?'Your latest demo passage records.':'Son demo geçiş kayıtlarınız.'}</p></div><button class="text-link" data-action="history">${t('dashboard.viewAll')} →</button></div><div class="movement-list">${recent}</div></section><section class="panel"><div class="panel-head"><div><h3>${t('dashboard.quickActions')}</h3><p>${state.language==='en'?'The three tasks most users need.':'Çoğu kullanıcının ihtiyaç duyduğu üç işlem.'}</p></div></div><div class="quick-actions vertical"><button class="quick-action" data-action="wallet"><span>₺</span><strong>${t('dashboard.topup')}</strong><small>${state.language==='en'?'Demo balance and official PTT access':'Demo bakiye ve resmî PTT erişimi'}</small></button><button class="quick-action" data-action="vehicles"><span>🚗</span><strong>${state.language==='en'?'My vehicle':'Aracım'}</strong><small>${state.language==='en'?'Expenses and reminders':'Giderler ve hatırlatmalar'}</small></button><button class="quick-action" data-action="route"><span>◎</span><strong>${t('dashboard.planJourney')}</strong><small>${state.language==='en'?'Known costs and fuel sufficiency':'Bilinen maliyetler ve yakıt yeterliliği'}</small></button></div></section></div>`;

  $$('[data-action]', $('#pageContent')).forEach(btn => btn.addEventListener('click', () => loadPage(btn.dataset.action)));
  $('#dashboardGuide').addEventListener('click', () => showPageGuide('dashboard'));
}
async function renderWallet() {
  const data = await api('wallet');
  $('#headerBalance').textContent = formatMoney(data.account?.balance || 0);
  const transactions = data.transactions.length ? data.transactions.map(tx => `<tr><td>${formatDate(tx.created_at)}</td><td><strong>${escapeHtml(tx.description || tx.transaction_type)}</strong><br><span class="muted">${escapeHtml(tx.reference_code || '')}</span></td><td>${escapeHtml(tx.payment_method || '—')}</td><td><span class="status-pill">${escapeHtml(tx.status)}</span></td><td class="amount positive-amount">+${formatMoney(tx.amount)}</td></tr>`).join('') : `<tr><td colspan="5">${t('wallet.noTransactions')}</td></tr>`;
  $('#pageContent').innerHTML = `
    <div class="page-toolbar"><div><h2>${t('wallet.title')}</h2><p>${t('wallet.subtitle')}</p></div><a class="secondary-btn button-link" href="${escapeHtml(data.official_topup_url)}" target="_blank" rel="noopener">${t('wallet.official')} ↗</a></div>
    <div class="wallet-grid">
      <section class="panel wallet-balance-card"><small>${t('wallet.currentBalance')}</small><strong>${formatMoney(data.account?.balance || 0)}</strong><p>${escapeHtml(data.notice)}</p><div class="amount-chips">${[100,250,500,1000].map(amount => `<button class="amount-chip" data-amount="${amount}">${formatMoney(amount)}</button>`).join('')}</div><form id="topupForm" class="inline-form"><label>${t('wallet.customAmount')}<input type="number" name="amount" min="50" max="5000" step="10" value="250" required></label><button class="primary-btn" type="submit">${t('wallet.topup')}</button></form><div class="secure-note"><span>🔒</span><div><strong>${t('wallet.secureDemo')}</strong><small>${t('wallet.demoNotice')}</small></div></div></section>
      <section class="panel"><div class="panel-head"><div><h3>${t('wallet.autoTopup')}</h3><p>${t('wallet.autoTopupHelp')}</p></div></div><form id="walletSettingsForm" class="settings-form"><div class="switch-row"><div><strong>${t('wallet.autoTopup')}</strong><small>${t('wallet.lowLimit')}</small></div><label class="switch"><input type="checkbox" name="auto_topup" value="1" ${Number(data.account?.auto_topup) ? 'checked' : ''}><span class="slider"></span></label></div><div class="form-grid"><label>${t('wallet.autoAmount')}<input type="number" name="auto_topup_amount" min="50" max="5000" value="${Number(data.account?.auto_topup_amount || 500)}"></label><label>${t('wallet.lowLimit')}<input type="number" name="low_balance_limit" min="0" max="5000" value="${Number(data.account?.low_balance_limit || 250)}"></label></div><button class="primary-btn" type="submit">${t('wallet.saveSettings')}</button></form></section>
    </div>
    <section class="panel top-gap"><div class="panel-head"><div><h3>${t('wallet.transactions')}</h3><p>${t('wallet.transactionHelp')}</p></div></div><div class="table-wrap"><table><thead><tr><th>${t('common.date')}</th><th>${t('common.actions')}</th><th>${t('wallet.paymentMethod')}</th><th>${t('common.status')}</th><th>${t('common.amount')}</th></tr></thead><tbody>${transactions}</tbody></table></div></section>`;
  const suggested = sessionStorage.getItem('roadpass_topup_amount');
  if (suggested) { $('#topupForm [name="amount"]').value = Math.ceil(Number(suggested) / 10) * 10; sessionStorage.removeItem('roadpass_topup_amount'); }
  $$('.amount-chip').forEach(btn => btn.addEventListener('click', () => { $('#topupForm [name="amount"]').value = btn.dataset.amount; }));
  $('#topupForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; setButtonLoading(button, true, t('common.loading'));
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget)); body.operation = 'topup';
      const result = await api('wallet', { method:'POST', body });
      openModal(`<div class="success-state"><span>✓</span><h2>${t('wallet.topupSuccess')}</h2><p>${t('wallet.topupSuccessText')}</p><div class="success-receipt"><div><small>${t('wallet.loaded')}</small><strong>${formatMoney(body.amount)}</strong></div><div><small>${t('wallet.newBalance')}</small><strong>${formatMoney(result.new_balance)}</strong></div><div><small>${t('wallet.reference')}</small><strong>${escapeHtml(result.reference)}</strong></div></div><button class="primary-btn wide" data-close>${t('common.close')}</button></div>`);
      $('[data-close]').addEventListener('click', async () => { closeModal(); await renderWallet(); });
      await refreshNotificationBadges();
    } catch (error) { toast(error.message, 'error'); } finally { setButtonLoading(button, false); }
  });
  $('#walletSettingsForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; setButtonLoading(button, true, t('common.loading'));
    try { const form = new FormData(event.currentTarget); const body = Object.fromEntries(form); body.operation='settings'; body.auto_topup=form.has('auto_topup')?1:0; await api('wallet',{method:'POST',body}); toast(t('toast.saved')); await renderWallet(); }
    catch(error){ toast(error.message,'error'); } finally { setButtonLoading(button,false); }
  });
}
function vehicleIcon(code) {
  return ({ motorcycle:'🏍', truck:'🚛', bus:'🚌', minibus:'🚐', light_commercial:'🚚' })[code] || '🚗';
}

async function renderVehicles() {
  const [vehicleData,expenseData,reminderData,suggestionData]=await Promise.all([api('vehicles'),api('vehicle_expenses'),api('vehicle_reminders'),api('vehicle_model_suggestions')]);
  state.vehicles=vehicleData.vehicles||[];state.vehicleExpenses=expenseData.expenses||[];state.vehicleReminders=reminderData.reminders||[];
  const cards=state.vehicles.length?state.vehicles.map(v=>{
    const optional=[v.manufacture_year,v.body_type,fuelLabel(v.fuel_type)].filter(Boolean);
    return `<article class="vehicle-card simple-vehicle-card"><div class="vehicle-top"><div class="vehicle-icon">${vehicleIcon(v.vehicle_type_code)}</div>${Number(v.is_default)?`<span class="default-badge">${t('vehicles.defaultBadge')}</span>`:''}</div><h3>${escapeHtml(v.brand)} ${escapeHtml(v.model)}</h3><div class="plate">${escapeHtml(v.plate)}</div><p class="vehicle-optional-summary">${escapeHtml(optional.join(' · ') || (state.language==='en'?'Technical details can be added later.':'Teknik bilgiler daha sonra eklenebilir.'))}</p><div class="vehicle-meta">${escapeHtml(state.language==='en'?(v.vehicle_type_en||v.vehicle_type):v.vehicle_type)}${v.hgs_tag?` · HGS ${escapeHtml(v.hgs_tag)}`:''}</div><div class="card-actions">${Number(v.is_default)?'':`<button class="secondary-btn" data-default-id="${v.id}">${t('vehicles.makeDefault')}</button>`}<button class="danger-btn" data-delete-id="${v.id}">${t('common.delete')}</button></div></article>`;
  }).join(''):`<div class="empty-state full-span"><span>🚗</span><h3>${t('vehicles.noVehicles')}</h3><p>${state.language==='en'?'Plate, brand, and model are enough to begin.':'Başlamak için plaka, marka ve model yeterlidir.'}</p><button class="primary-btn" id="emptyAddVehicle">＋ ${t('vehicles.add')}</button></div>`;
  const expenses=state.vehicleExpenses.slice(0,8).map(e=>`<tr><td>${formatDate(e.expense_date,false)}</td><td><strong>${escapeHtml(e.plate)}</strong><br><small>${escapeHtml(e.brand)} ${escapeHtml(e.model)}</small></td><td>${escapeHtml(categoryLabel(e.category))}</td><td>${escapeHtml(e.description||'—')}</td><td class="amount">${formatMoney(e.amount)}</td><td><button class="table-action delete-action" data-delete-expense="${e.id}">×</button></td></tr>`).join('')||`<tr><td colspan="6">${t('expenses.none')}</td></tr>`;
  const reminders=state.vehicleReminders.slice(0,10).map(r=>`<article class="reminder-card actionable ${Number(r.is_completed)?'completed':Number(r.days_left)<0?'overdue':''}"><button class="reminder-check" data-toggle-reminder="${r.id}" data-completed="${Number(r.is_completed)?0:1}">${Number(r.is_completed)?'✓':'○'}</button><div><span>${escapeHtml(reminderLabel(r.reminder_type))}</span><h4>${escapeHtml(r.title)}</h4><p>${escapeHtml(r.plate)} · ${formatDate(r.due_date,false)}${Number(r.days_left)<0?` · ${state.language==='en'?'Overdue':'Tarihi geçti'}`:''}</p><a href="${reminderOfficialLink(r.reminder_type)}" target="_blank" rel="noopener" class="reminder-official-link">${reminderActionLabel(r.reminder_type)} ↗</a></div><button class="table-action delete-action" data-delete-reminder="${r.id}">×</button></article>`).join('')||`<div class="empty-state compact"><span>✓</span><h3>${t('reminders.none')}</h3><p>${state.language==='en'?'Add only the dates you want RoadPass to track.':'Yalnızca RoadPass’in takip etmesini istediğiniz tarihleri ekleyin.'}</p></div>`;
  const suggestions=(suggestionData.suggestions||[]).slice(0,5).map(x=>`<div class="suggestion-status"><div><strong>${escapeHtml(x.brand)} ${escapeHtml(x.model_name)}</strong><small>${formatDate(x.created_at,false)}</small></div><span class="status-pill ${escapeHtml(x.status)}">${escapeHtml(t(`vehicles.suggestionStatus.${x.status}`,x.status))}</span></div>`).join('')||`<p class="muted">${t('vehicles.noSuggestions')}</p>`;
  $('#pageContent').innerHTML=`<div class="page-toolbar"><div><span class="eyebrow">${state.language==='en'?'MY VEHICLE':'ARACIM'}</span><h2>${t('vehicles.title')}</h2><p>${state.language==='en'?'Most people need one vehicle. Add the essentials first; everything else is optional.':'Çoğu kullanıcı için tek araç yeterlidir. Önce temel bilgileri ekleyin; diğer alanlar isteğe bağlıdır.'}</p></div><div class="toolbar-actions"><button id="addExpenseBtn" class="secondary-btn" ${state.vehicles.length?'':'disabled'}>＋ ${t('expenses.add')}</button><button id="addReminderBtn" class="secondary-btn" ${state.vehicles.length?'':'disabled'}>◷ ${t('reminders.add')}</button><button id="addVehicleBtn" class="primary-btn">＋ ${t('vehicles.add')}</button></div></div><div class="three-step-note"><span>1</span><b>${t('vehicles.plate')}</b><i>→</i><span>2</span><b>${t('vehicles.brand')}</b><i>→</i><span>3</span><b>${t('vehicles.model')}</b><small>${state.language==='en'?'Technical details are optional':'Teknik bilgiler isteğe bağlıdır'}</small></div><div class="card-grid">${cards}</div><div class="vehicle-center-grid"><section class="panel"><div class="panel-head"><div><h3>${t('expenses.title')}</h3><p>${t('expenses.subtitle')}</p></div><button id="addExpenseInline" class="text-link" ${state.vehicles.length?'':'disabled'}>＋ ${t('expenses.add')}</button></div><div class="table-wrap"><table><thead><tr><th>${t('common.date')}</th><th>${t('common.vehicle')}</th><th>${t('expenses.category')}</th><th>${t('expenses.description')}</th><th>${t('common.amount')}</th><th></th></tr></thead><tbody>${expenses}</tbody></table></div></section><aside class="vehicle-side-stack"><section class="panel"><div class="panel-head"><div><h3>${t('reminders.title')}</h3><p>${state.language==='en'?'Get reminded, then continue at the correct official service.':'Hatırlatmayı görün, ardından doğru resmî serviste işleme devam edin.'}</p></div><button id="addReminderInline" class="text-link" ${state.vehicles.length?'':'disabled'}>＋</button></div><div class="reminder-list">${reminders}</div></section><section class="panel"><div class="panel-head"><div><h3>${t('vehicles.modelSuggestions')}</h3><p>${t('vehicles.modelSuggestionsHelp')}</p></div></div><div class="suggestion-status-list">${suggestions}</div></section></aside></div>`;
  $('#addVehicleBtn').addEventListener('click',openAddVehicleModal);$('#emptyAddVehicle')?.addEventListener('click',openAddVehicleModal);['#addExpenseBtn','#addExpenseInline'].forEach(sel=>$(sel)?.addEventListener('click',openExpenseModal));['#addReminderBtn','#addReminderInline'].forEach(sel=>$(sel)?.addEventListener('click',openReminderModal));
  $$('[data-default-id]').forEach(btn=>btn.addEventListener('click',()=>setDefaultVehicle(btn.dataset.defaultId)));$$('[data-delete-id]').forEach(btn=>btn.addEventListener('click',()=>deleteVehicle(btn.dataset.deleteId)));
  $$('[data-delete-expense]').forEach(btn=>btn.addEventListener('click',async()=>{await api('vehicle_expenses',{method:'DELETE',query:`&id=${btn.dataset.deleteExpense}`});toast(t('toast.saved'));await renderVehicles();}));
  $$('[data-delete-reminder]').forEach(btn=>btn.addEventListener('click',async()=>{await api('vehicle_reminders',{method:'DELETE',query:`&id=${btn.dataset.deleteReminder}`});toast(t('toast.saved'));await renderVehicles();}));
  $$('[data-toggle-reminder]').forEach(btn=>btn.addEventListener('click',async()=>{await api('vehicle_reminders',{method:'POST',body:{operation:'complete',id:btn.dataset.toggleReminder,is_completed:Number(btn.dataset.completed)}});await renderVehicles();}));
}
function cityOptions(){return Array.from({length:81},(_,i)=>String(i+1).padStart(2,'0')).map(code=>`<option value="${code}">${code}</option>`).join('');}
async function openAddVehicleModal(){
  let catalog;try{catalog=await api('vehicle_catalog');}catch(error){toast(error.message,'error');return;}
  const types=catalog.types.map(type=>`<option value="${type.id}" data-code="${escapeHtml(type.code)}">${escapeHtml(state.language==='en'?type.name_en:type.name_tr)}</option>`).join('');
  openModal(`<div class="modal-heading"><span class="modal-icon">🚗</span><div><h2>${t('vehicles.add')}</h2><p>${state.language==='en'?'Only three essential details are required. You can complete technical information later.':'Yalnızca üç temel bilgi zorunludur. Teknik bilgileri daha sonra tamamlayabilirsiniz.'}</p></div></div><form id="addVehicleForm" class="modal-form large-form simplified-vehicle-form"><label>${t('vehicles.plate')}<div class="plate-inputs"><select name="city_code">${cityOptions()}</select><input name="plate_letters" maxlength="3" placeholder="ABC" required aria-label="${t('vehicles.letters')}"><input name="plate_digits" maxlength="4" inputmode="numeric" placeholder="1234" required aria-label="${t('vehicles.digits')}"></div><small class="field-help">${state.language==='en'?'Province 01–81, 1–3 letters, and 2–4 digits are accepted.':'İl kodu 01–81, 1–3 harf ve 2–4 rakam kabul edilir.'}</small><div id="platePreview" class="plate-preview">01 ABC 1234</div></label><div class="form-grid"><label>${t('vehicles.type')}<select name="vehicle_type_id" required>${types}</select></label><label>${t('vehicles.brand')}<select name="brand_id" required disabled><option value="">${t('vehicles.selectBrand')}</option></select></label></div><label>${t('vehicles.model')}<div class="model-select-row"><select name="model_id" required disabled><option value="">${t('vehicles.selectModel')}</option></select><button type="button" id="customModelToggle" class="secondary-btn">${t('vehicles.modelMissing')}</button></div></label><div id="customModelArea" class="custom-model-area hidden"><label>${t('vehicles.customModel')}<input name="custom_model_name" maxlength="120" placeholder="${t('vehicles.customModelPlaceholder')}"></label><p>i ${t('vehicles.customModelNotice')}</p></div><label>${state.language==='en'?'Fuel type (optional)':'Yakıt türü (isteğe bağlı)'}<select name="fuel_type"><option value="gasoline">${t('vehicles.gasoline')}</option><option value="diesel">${t('vehicles.diesel')}</option><option value="lpg">LPG</option><option value="hybrid">${t('vehicles.hybrid')}</option><option value="electric">${t('vehicles.electric')}</option><option value="other">${t('vehicles.otherFuel')}</option></select></label><details class="advanced-vehicle-details"><summary><span>⚙</span><div><strong>${state.language==='en'?'Advanced vehicle details':'Gelişmiş araç bilgileri'}</strong><small>${state.language==='en'?'Optional — used for fuel and cost estimates':'İsteğe bağlı — yakıt ve maliyet tahminlerinde kullanılır'}</small></div><b>＋</b></summary><div class="advanced-fields"><div class="form-grid three"><label>${t('vehicles.year')}<input type="number" name="manufacture_year" min="1950" max="${new Date().getFullYear()+1}"></label><label>${t('vehicles.bodyType')}<select name="body_type"><option value="">—</option>${['Sedan','Hatchback','SUV','Crossover','Station Wagon','Coupe','Cabrio','Pickup','Van','Minivan'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>${t('vehicles.transmission')}<select name="transmission"><option value="">—</option><option value="manual">${t('vehicles.manual')}</option><option value="automatic">${t('vehicles.automatic')}</option><option value="semi_automatic">${t('vehicles.semi_automatic')}</option><option value="other">${t('vehicles.other')}</option></select></label></div><div class="form-grid"><label>${t('vehicles.engine')}<input name="engine_label" maxlength="60"></label><label>${t('vehicles.consumption')}<input type="number" name="average_consumption" min="0" max="100" step="0.1"></label></div><div id="liquidEnergyFields" class="form-grid"><label>${t('vehicles.tankCapacity')}<input type="number" name="tank_capacity" min="0" max="500" step="0.1"></label><label>${t('vehicles.currentFuel')}<input type="number" name="current_fuel_liters" min="0" max="500" step="0.1"></label></div><div id="electricEnergyFields" class="form-grid hidden"><label>${t('vehicles.batteryCapacity')}<input type="number" name="battery_capacity" min="0" max="500" step="0.1"></label><label>${t('vehicles.charge')}<input type="number" name="current_charge_percent" min="0" max="100" step="1"></label></div><div class="form-grid"><label>${t('vehicles.color')}<input name="color" maxlength="50"></label><label>${t('vehicles.hgsTag')}<input name="hgs_tag" maxlength="${state.config.hgs_tag_max_length||32}"><small class="field-help">${t('vehicles.hgsHelp')}</small></label></div>${state.vehicles.length?`<label class="check"><input type="checkbox" name="is_default" value="1"> ${t('vehicles.default')}</label>`:''}</div></details><button class="primary-btn wide" type="submit">${t('vehicles.add')}</button></form>`);
  const form=$('#addVehicleForm'),typeSelect=form.elements.vehicle_type_id,brandSelect=form.elements.brand_id,modelSelect=form.elements.model_id,customArea=$('#customModelArea'),customInput=form.elements.custom_model_name;
  const loadBrands=async()=>{brandSelect.disabled=true;modelSelect.disabled=true;brandSelect.innerHTML=`<option>${t('common.loading')}...</option>`;modelSelect.innerHTML=`<option value="">${t('vehicles.selectModel')}</option>`;if(!typeSelect.value)return;const data=await api('vehicle_catalog',{query:`&type_id=${encodeURIComponent(typeSelect.value)}`});brandSelect.innerHTML=`<option value="">${t('vehicles.selectBrand')}</option>${data.brands.map(b=>`<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}`;brandSelect.disabled=false;};
  typeSelect.addEventListener('change',()=>loadBrands().catch(error=>toast(error.message,'error')));
  brandSelect.addEventListener('change',async()=>{modelSelect.disabled=true;modelSelect.innerHTML=`<option>${t('common.loading')}...</option>`;if(!brandSelect.value){modelSelect.innerHTML=`<option value="">${t('vehicles.selectModel')}</option>`;return;}try{const data=await api('vehicle_catalog',{query:`&brand_id=${encodeURIComponent(brandSelect.value)}`});modelSelect.innerHTML=`<option value="">${t('vehicles.selectModel')}</option>${data.models.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}`;modelSelect.disabled=false;}catch(error){toast(error.message,'error');}});
  $('#customModelToggle').addEventListener('click',()=>{const active=!customArea.classList.contains('hidden');customArea.classList.toggle('hidden',active);modelSelect.required=active;customInput.required=!active;if(!active){modelSelect.value='';customInput.focus();}$('#customModelToggle').textContent=!active?t('vehicles.useCatalogue'):t('vehicles.modelMissing');});
  const fuelSelect=form.elements.fuel_type;fuelSelect.addEventListener('change',()=>{$('#liquidEnergyFields').classList.toggle('hidden',fuelSelect.value==='electric');$('#electricEnergyFields').classList.toggle('hidden',fuelSelect.value!=='electric');});
  const letters=form.elements.plate_letters,digits=form.elements.plate_digits,city=form.elements.city_code;const updatePlate=()=>{letters.value=letters.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);digits.value=digits.value.replace(/\D/g,'').slice(0,4);$('#platePreview').textContent=`${city.value} ${letters.value||'ABC'} ${digits.value||'1234'}`;};[letters,digits,city].forEach(el=>el.addEventListener('input',updatePlate));form.elements.hgs_tag.addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'');});
  const carType=catalog.types.find(type=>type.code==='car')||catalog.types[0];if(carType){typeSelect.value=String(carType.id);await loadBrands();}
  form.addEventListener('submit',async event=>{event.preventDefault();if(letters.value.length<1||digits.value.length<2){toast(state.language==='en'?'Enter 1–3 letters and 2–4 digits.':'1–3 harf ve 2–4 rakam girin.','error');return;}const button=event.submitter;setButtonLoading(button,true,t('common.loading'));try{const fd=new FormData(form),body=Object.fromEntries(fd);body.plate=`${body.city_code}${body.plate_letters}${body.plate_digits}`;body.is_default=state.vehicles.length===0?1:(fd.has('is_default')?1:0);delete body.city_code;delete body.plate_letters;delete body.plate_digits;if(customArea.classList.contains('hidden'))body.custom_model_name='';else body.model_id='';await api('vehicles',{method:'POST',body});closeModal();toast(body.custom_model_name?t('vehicles.customAdded'):t('toast.vehicleAdded'));await renderVehicles();}catch(error){toast(error.message,'error');}finally{setButtonLoading(button,false);}});
}
function vehicleOptionsHtml(){return state.vehicles.map(v=>`<option value="${v.id}">${escapeHtml(v.plate)} · ${escapeHtml(v.brand)} ${escapeHtml(v.model)}</option>`).join('');}
function openExpenseModal(){openModal(`<h2>${t('expenses.add')}</h2><p>${t('expenses.addHelp')}</p><form id="expenseForm" class="modal-form"><label>${t('common.vehicle')}<select name="vehicle_id" required>${vehicleOptionsHtml()}</select></label><div class="form-grid"><label>${t('expenses.category')}<select name="category">${['fuel','maintenance','insurance','inspection','parking','wash','tax','other'].map(c=>`<option value="${c}">${categoryLabel(c)}</option>`).join('')}</select></label><label>${t('common.amount')}<input type="number" name="amount" min="1" step="0.01" required></label></div><div class="form-grid"><label>${t('common.date')}<input type="date" name="expense_date" value="${new Date().toISOString().slice(0,10)}" required></label><label>${t('expenses.odometer')}<input type="number" name="odometer_km" min="0"></label></div><label>${t('expenses.description')}<input name="description" maxlength="255"></label><button class="primary-btn wide" type="submit">${t('common.save')}</button></form>`);$('#expenseForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;setButtonLoading(b,true,t('common.loading'));try{await api('vehicle_expenses',{method:'POST',body:Object.fromEntries(new FormData(e.currentTarget))});closeModal();toast(t('toast.saved'));await renderVehicles();}catch(error){toast(error.message,'error');setButtonLoading(b,false);}});}
function openReminderModal(){openModal(`<h2>${t('reminders.add')}</h2><p>${t('reminders.addHelp')}</p><form id="reminderForm" class="modal-form"><label>${t('common.vehicle')}<select name="vehicle_id" required>${vehicleOptionsHtml()}</select></label><div class="form-grid"><label>${t('reminders.type')}<select name="reminder_type">${['inspection','insurance','maintenance','tax','tire','other'].map(c=>`<option value="${c}">${reminderLabel(c)}</option>`).join('')}</select></label><label>${t('reminders.dueDate')}<input type="date" name="due_date" required></label></div><label>${t('reminders.titleField')}<input name="title" maxlength="140" required></label><div class="form-grid"><label>${t('reminders.dueKm')}<input type="number" name="due_odometer_km" min="0"></label><label>${t('reminders.notes')}<input name="notes" maxlength="255"></label></div><button class="primary-btn wide" type="submit">${t('common.save')}</button></form>`);$('#reminderForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;setButtonLoading(b,true,t('common.loading'));try{await api('vehicle_reminders',{method:'POST',body:Object.fromEntries(new FormData(e.currentTarget))});closeModal();toast(t('toast.saved'));await renderVehicles();}catch(error){toast(error.message,'error');setButtonLoading(b,false);}});}
async function setDefaultVehicle(id){try{await api('set_default_vehicle',{method:'POST',body:{vehicle_id:Number(id)}});toast(t('toast.defaultChanged'));await renderVehicles();}catch(error){toast(error.message,'error');}}
async function deleteVehicle(id){openModal(`<h2>${t('common.delete')}</h2><p>${t('vehicles.deleteConfirm')}</p><div class="modal-actions"><button class="ghost-btn" data-close>${t('common.cancel')}</button><button class="danger-btn" id="confirmDeleteVehicle">${t('common.delete')}</button></div>`);$('[data-close]').addEventListener('click',closeModal);$('#confirmDeleteVehicle').addEventListener('click',async event=>{setButtonLoading(event.currentTarget,true,t('common.loading'));try{await api('vehicles',{method:'DELETE',query:`&id=${encodeURIComponent(id)}`});closeModal();toast(t('toast.vehicleDeleted'));await renderVehicles();}catch(error){toast(error.message,'error');setButtonLoading(event.currentTarget,false);}});}

async function renderHistory() {
  const data = await api('passages',{query:`&trash=${state.historyTrash?1:0}&limit=200`});
  state.passages = data.passages;
  const plateOptions = [...new Set(state.passages.map(item => item.plate).filter(Boolean))].map(plate => `<option value="${escapeHtml(plate)}">${escapeHtml(plate)}</option>`).join('');
  $('#pageContent').innerHTML = `
    <div class="page-toolbar"><div><h2>${t('history.title')}</h2><p>${t('history.subtitle')}</p></div><div class="toolbar-actions"><button id="toggleTrash" class="secondary-btn">${state.historyTrash ? `↺ ${t('history.active')}` : `🗑 ${t('history.trash')}`}</button>${state.historyTrash ? `<button id="restoreAll" class="secondary-btn">${t('history.restoreAll')}</button>` : `<button id="deleteHistoryBtn" class="danger-btn">${t('history.deleteHistory')}</button><button id="exportHistoryBtn" class="secondary-btn">${t('history.export')}</button>`}</div></div>
    <section class="panel"><div class="advanced-filters"><label>${t('common.search')}<input id="historySearch" placeholder="${t('history.searchPlaceholder')}"></label><label>${t('common.vehicle')}<select id="historyPlate"><option value="">${t('history.all')}</option>${plateOptions}</select></label><label>${t('common.status')}<select id="historyStatus"><option value="">${t('history.all')}</option><option value="completed">${t('dashboard.completed')}</option><option value="violation">${t('history.violation')}</option></select></label><label>${t('history.startDate')}<input id="historyFrom" type="date"></label><label>${t('history.endDate')}<input id="historyTo" type="date"></label><label>${t('history.minAmount')}<input id="historyMin" type="number" min="0" step="1"></label><label>${t('history.maxAmount')}<input id="historyMax" type="number" min="0" step="1"></label><button id="clearHistoryFilters" class="ghost-btn filter-clear">${t('history.clearFilters')}</button></div>
    <div id="bulkHistoryBar" class="bulk-action-bar hidden"><span><b id="selectedHistoryCount">0</b> ${t('history.selected')}</span><button id="bulkHistoryAction" class="${state.historyTrash?'secondary-btn':'danger-btn'}">${state.historyTrash?t('history.restoreSelected'):t('history.deleteSelected')}</button></div>
    <div class="table-wrap"><table><thead><tr><th class="check-cell"><input id="historySelectAll" type="checkbox" aria-label="${t('history.selectAll')}"></th><th>${t('history.location')}</th><th>${t('history.road')}</th><th>${t('common.vehicle')}</th><th>${t('common.date')}</th><th>${t('common.amount')}</th><th>${t('common.actions')}</th></tr></thead><tbody id="historyRows"></tbody></table></div></section>`;

  const draw = () => {
    const search = ($('#historySearch').value || '').toLocaleLowerCase(state.language === 'tr' ? 'tr-TR' : 'en-US');
    const plate = $('#historyPlate').value; const status = $('#historyStatus').value;
    const from = $('#historyFrom').value; const to = $('#historyTo').value;
    const min = $('#historyMin').value === '' ? null : Number($('#historyMin').value);
    const max = $('#historyMax').value === '' ? null : Number($('#historyMax').value);
    state.historyFiltered = state.passages.filter(item => {
      const haystack = `${item.location} ${item.road_name || ''} ${item.gate_name || ''} ${item.plate || ''}`.toLocaleLowerCase(state.language === 'tr' ? 'tr-TR' : 'en-US');
      const day = String(item.passed_at).slice(0,10); const amount = Number(item.amount);
      return (!search || haystack.includes(search)) && (!plate || item.plate===plate) && (!status || item.status===status) && (!from || day>=from) && (!to || day<=to) && (min===null || amount>=min) && (max===null || amount<=max);
    });
    $('#historyRows').innerHTML = state.historyFiltered.length ? state.historyFiltered.map(item => `<tr><td class="check-cell"><input class="history-check" type="checkbox" value="${item.id}"></td><td><strong>${escapeHtml(item.location)}</strong></td><td>${escapeHtml(item.road_name || '—')}<br><span class="muted">${escapeHtml(item.gate_name || '')}</span></td><td>${escapeHtml(item.plate || '—')}</td><td>${formatDate(item.passed_at)}</td><td class="amount">${formatMoney(item.amount)}</td><td><button class="table-action ${state.historyTrash?'restore-action':'delete-action'}" data-passage-id="${item.id}">${state.historyTrash?t('history.restoreOne'):t('history.deleteOne')}</button></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state compact"><span>⌕</span><h3>${t('history.empty')}</h3><p>${t('history.emptyHelp')}</p></div></td></tr>`;
    $$('[data-passage-id]').forEach(btn => btn.addEventListener('click', () => state.historyTrash ? restorePassages([Number(btn.dataset.passageId)]) : deletePassages([Number(btn.dataset.passageId)])));
    $$('.history-check').forEach(box => box.addEventListener('change', updateHistoryBulkBar));
    $('#historySelectAll').checked = false; updateHistoryBulkBar();
  };
  ['historySearch','historyPlate','historyStatus','historyFrom','historyTo','historyMin','historyMax'].forEach(id => $(`#${id}`).addEventListener(id==='historySearch'||id==='historyMin'||id==='historyMax'?'input':'change',draw));
  $('#clearHistoryFilters').addEventListener('click', () => { ['historySearch','historyPlate','historyStatus','historyFrom','historyTo','historyMin','historyMax'].forEach(id => { $(`#${id}`).value=''; }); draw(); });
  $('#historySelectAll').addEventListener('change', event => { $$('.history-check').forEach(box => { box.checked=event.currentTarget.checked; }); updateHistoryBulkBar(); });
  $('#bulkHistoryAction').addEventListener('click', () => { const ids=$$('.history-check:checked').map(box=>Number(box.value)); if(ids.length) state.historyTrash?restorePassages(ids):deletePassages(ids); });
  draw();
  $('#toggleTrash').addEventListener('click', () => { state.historyTrash=!state.historyTrash; renderHistory(); });
  $('#deleteHistoryBtn')?.addEventListener('click', openDeleteHistoryModal);
  $('#exportHistoryBtn')?.addEventListener('click', exportHistoryCsv);
  $('#restoreAll')?.addEventListener('click', async () => { try { await api('passages_restore',{method:'POST',body:{mode:'all'}}); toast(t('toast.restored')); await renderHistory(); } catch(error){ toast(error.message,'error'); } });
}

function updateHistoryBulkBar() {
  const count = $$('.history-check:checked').length;
  $('#selectedHistoryCount').textContent = count;
  $('#bulkHistoryBar').classList.toggle('hidden', count === 0);
}

function openDeleteHistoryModal() {
  openModal(`<h2>${t('history.confirmTitle')}</h2><p>${t('history.softDelete')}</p><div class="stack-actions"><button class="danger-btn wide" data-delete-mode="last30">${t('history.delete30')}</button><button class="danger-btn wide" data-delete-mode="all">${t('history.deleteAll')}</button><button class="ghost-btn wide" data-close>${t('common.cancel')}</button></div>`);
  $('[data-close]').addEventListener('click',closeModal);
  $$('[data-delete-mode]').forEach(btn => btn.addEventListener('click', async () => {
    try { const result=await api('passages',{method:'DELETE',body:{mode:btn.dataset.deleteMode}}); closeModal(); const ids=result.ids||[]; toastAction(t('toast.movedToTrash'),t('toast.undo'),async()=>{ if(ids.length) await api('passages_restore',{method:'POST',body:{mode:'ids',ids}}); await renderHistory(); }); await renderHistory(); }
    catch(error){ toast(error.message,'error'); }
  }));
}

async function deletePassages(ids) {
  try { await api('passages',{method:'DELETE',body:{mode:'ids',ids}}); toastAction(t('toast.movedToTrash'),t('toast.undo'),async()=>{ await api('passages_restore',{method:'POST',body:{mode:'ids',ids}}); await renderHistory(); }); await renderHistory(); }
  catch(error){ toast(error.message,'error'); }
}
async function restorePassages(ids) { try { await api('passages_restore',{method:'POST',body:{mode:'ids',ids}}); toast(t('toast.restored')); await renderHistory(); } catch(error){ toast(error.message,'error'); } }

function exportHistoryCsv() {
  const headers = ['Location','Road','Gate','Plate','Date','Amount'];
  const rows = state.historyFiltered.map(item => [item.location,item.road_name||'',item.gate_name||'',item.plate||'',item.passed_at,item.amount]);
  const csv = [headers,...rows].map(row => row.map(value => `"${String(value).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`roadpass-history-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

async function renderRoute(){
  const [vehiclesData,plansData,addressData]=await Promise.all([api('vehicles'),api('journey_plans'),api('addresses')]);state.vehicles=vehiclesData.vehicles||[];state.addresses=addressData.addresses||[];
  const vehicleOptions=state.vehicles.map(v=>`<option value="${v.id}" ${Number(v.is_default)?'selected':''}>${escapeHtml(v.plate)} · ${escapeHtml(v.brand)} ${escapeHtml(v.model)}</option>`).join('');
  const savedPlans=plansData.plans?.length?plansData.plans.map(p=>`<article class="saved-journey"><div><strong>${escapeHtml(p.origin)} → ${escapeHtml(p.destination)}</strong><small>${escapeHtml(p.plate||'')} · ${Number(p.total_complete)?'':(state.language==='en'?'Known ':'Bilinen ')}${formatMoney(p.estimated_total_cost||0)} · ${formatDate(p.created_at,false)}</small></div><div><button class="table-action" data-reuse-plan="${p.id}">${t('route.useAgain')}</button><button class="table-action delete-action" data-delete-plan="${p.id}">×</button></div></article>`).join(''):`<div class="empty-state compact"><span>⌖</span><h3>${t('route.noSaved')}</h3><p>${t('route.noSavedHelp')}</p></div>`;
  const addressCards=state.addresses.length?state.addresses.map(a=>`<article class="saved-address"><span>${a.address_type==='home'?'⌂':a.address_type==='work'?'▣':'⌖'}</span><div><strong>${escapeHtml(a.label)}</strong><small>${escapeHtml(a.full_address)}</small></div><div class="address-actions"><button data-address-origin="${a.id}">${t('route.useOrigin')}</button><button data-address-destination="${a.id}">${t('route.useDestination')}</button><button data-delete-address="${a.id}">×</button></div></article>`).join(''):`<div class="empty-state compact"><span>⌂</span><h3>${t('route.noAddresses')}</h3><p>${t('route.noAddressesHelp')}</p></div>`;
  $('#pageContent').innerHTML=`<div class="journey-v3-layout"><section class="panel journey-form-panel"><div class="panel-head"><div><h3>${t('route.title')}</h3><p>${t('route.subtitleV3')}</p></div><span class="status-pill">${t('route.smartBudget')}</span></div>${state.vehicles.length?`<form id="routeForm" class="route-form route-form-v3"><div class="segmented-control"><button type="button" class="active" data-address-mode="open">${t('route.openAddress')}</button><button type="button" data-address-mode="structured">${t('route.structuredAddress')}</button></div><div id="openAddressMode"><label>${t('route.from')}<div class="input-action"><textarea name="from_open" rows="2" maxlength="500" placeholder="${t('route.fullAddressPlaceholder')}" required></textarea><button type="button" id="useCurrentLocation" title="${t('route.currentLocation')}">◎</button></div></label><button type="button" id="swapJourney" class="swap-button" aria-label="${t('route.swap')}">⇅</button><label>${t('route.to')}<textarea name="to_open" rows="2" maxlength="500" placeholder="${t('route.fullAddressPlaceholder')}" required></textarea></label></div><div id="structuredAddressMode" class="hidden"><div class="structured-address"><h4>${t('route.from')}</h4><div class="form-grid"><label>${t('route.province')}<select name="from_province"><option value="">—</option>${provinceOptions()}</select></label><label>${t('route.district')}<input name="from_district" list="districtHints"></label></div><div class="form-grid"><label>${t('route.neighborhood')}<input name="from_neighborhood"></label><label>${t('route.street')}<input name="from_street"></label></div><label>${t('route.buildingNo')}<input name="from_building_no"></label></div><div class="structured-address"><h4>${t('route.to')}</h4><div class="form-grid"><label>${t('route.province')}<select name="to_province"><option value="">—</option>${provinceOptions()}</select></label><label>${t('route.district')}<input name="to_district" list="districtHints"></label></div><div class="form-grid"><label>${t('route.neighborhood')}<input name="to_neighborhood"></label><label>${t('route.street')}<input name="to_street"></label></div><label>${t('route.buildingNo')}<input name="to_building_no"></label></div><datalist id="districtHints"></datalist></div><input type="hidden" name="from"><input type="hidden" name="to"><label>${t('route.vehicle')}<select name="vehicle_id" required>${vehicleOptions}</select></label><label class="check route-avoid-tolls"><input type="checkbox" name="avoid_tolls" value="1"> <span>${state.language==='en'?'Avoid toll roads':'Ücretli yolları kullanma'}</span><small>${state.language==='en'?'HGS is budgeted as TRY 0; travel time remains a prototype estimate.':'HGS bütçesi 0 TL alınır; yol süresi prototip tahminidir.'}</small></label><section class="fuel-planner"><div class="form-section-title">${t('route.fuelPlanner')}</div><div class="form-grid three"><label>${t('route.currentEnergy')}<input type="number" name="current_fuel_liters" step="0.1" min="0"></label><label>${t('route.unitPrice')}<input type="number" name="fuel_price" step="0.01" min="0"></label><label>${t('route.safetyMargin')}<select name="safety_margin_percent"><option value="10">%10</option><option value="15" selected>%15</option><option value="20">%20</option><option value="25">%25</option></select></label></div><label>${t('route.parkingBudget')}<input type="number" name="parking_budget" step="1" min="0" value="0"></label><small id="fuelFieldHint" class="field-help"></small></section><button class="primary-btn wide" type="submit">⌖ ${t('route.calculateBudget')}</button></form>`:`<div class="empty-state"><span>🚗</span><h3>${t('route.vehicleNeeded')}</h3><p>${t('route.vehicleNeededHelp')}</p><button id="routeAddVehicle" class="primary-btn">${t('vehicles.add')}</button></div>`}<div class="journey-trust"><span>✓ ${t('route.addressDetail')}</span><span>✓ ${t('route.fuelCheck')}</span><span>✓ ${t('route.totalBudget')}</span></div></section><section id="routeResult" class="panel journey-result-panel"><div class="route-placeholder"><div><span>⌖</span><h3>${t('route.placeholderTitle')}</h3><p>${t('route.placeholderV3')}</p></div></div></section><aside class="journey-side-stack"><section class="panel"><div class="panel-head"><div><h3>${t('route.savedAddresses')}</h3><p>${t('route.savedAddressesHelp')}</p></div><button id="addAddressBtn" class="text-link">＋ ${t('route.addAddress')}</button></div><div class="saved-address-list">${addressCards}</div></section><section class="panel saved-journeys-panel"><div class="panel-head"><div><h3>${t('route.saved')}</h3><p>${t('route.savedHelp')}</p></div></div><div class="saved-journeys-list">${savedPlans}</div></section></aside></div>`;
  const form=$('#routeForm');if(form){let mode='open';$$('[data-address-mode]').forEach(btn=>btn.addEventListener('click',()=>{mode=btn.dataset.addressMode;$$('[data-address-mode]').forEach(x=>x.classList.toggle('active',x===btn));$('#openAddressMode').classList.toggle('hidden',mode!=='open');$('#structuredAddressMode').classList.toggle('hidden',mode!=='structured');form.elements.from_open.required=mode==='open';form.elements.to_open.required=mode==='open';}));
    const refreshVehicleEnergy=()=>{const v=state.vehicles.find(x=>String(x.id)===form.elements.vehicle_id.value)||state.vehicles[0];if(!v)return;const electric=v.fuel_type==='electric';form.elements.current_fuel_liters.value=electric?(v.current_charge_percent??''):(v.current_fuel_liters??'');form.elements.fuel_price.value=electric?'3.50':v.fuel_type==='lpg'?'26.00':v.fuel_type==='diesel'?'49.50':'48.50';form.elements.current_fuel_liters.max=electric?'100':'500';$('#fuelFieldHint').textContent=electric?t('route.electricHint'):t('route.liquidHint');};form.elements.vehicle_id.addEventListener('change',refreshVehicleEnergy);refreshVehicleEnergy();
    form.addEventListener('submit',e=>{if(mode==='open'){form.elements.from.value=form.elements.from_open.value.trim();form.elements.to.value=form.elements.to_open.value.trim();}else{form.elements.from.value=composeStructuredAddress('from',form);form.elements.to.value=composeStructuredAddress('to',form);}calculateRoute(e);});
    $('#swapJourney')?.addEventListener('click',()=>{[form.elements.from_open.value,form.elements.to_open.value]=[form.elements.to_open.value,form.elements.from_open.value];});
    $('#useCurrentLocation')?.addEventListener('click',()=>{if(!navigator.geolocation){toast(t('route.locationUnavailable'),'error');return;}navigator.geolocation.getCurrentPosition(pos=>{form.elements.from_open.value=`${t('route.currentLocation')}: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;},()=>toast(t('route.locationDenied'),'error'),{enableHighAccuracy:true,timeout:10000});});
    const updateDistricts=select=>{const list=DISTRICT_HINTS[select.value]||[];$('#districtHints').innerHTML=list.map(x=>`<option value="${x}"></option>`).join('');};form.elements.from_province.addEventListener('change',e=>updateDistricts(e.target));form.elements.to_province.addEventListener('change',e=>updateDistricts(e.target));
  }
  $('#routeAddVehicle')?.addEventListener('click',openAddVehicleModal);$('#addAddressBtn').addEventListener('click',openAddressModal);
  $$('[data-address-origin]').forEach(btn=>btn.addEventListener('click',()=>applySavedAddress(btn.dataset.addressOrigin,'from')));$$('[data-address-destination]').forEach(btn=>btn.addEventListener('click',()=>applySavedAddress(btn.dataset.addressDestination,'to')));$$('[data-delete-address]').forEach(btn=>btn.addEventListener('click',async()=>{await api('addresses',{method:'DELETE',query:`&id=${btn.dataset.deleteAddress}`});toast(t('toast.saved'));await renderRoute();}));
  $$('[data-delete-plan]').forEach(btn=>btn.addEventListener('click',async()=>{await api('journey_plans',{method:'DELETE',query:`&id=${btn.dataset.deletePlan}`});toast(t('toast.saved'));await renderRoute();}));$$('[data-reuse-plan]').forEach(btn=>btn.addEventListener('click',()=>{const plan=plansData.plans.find(x=>String(x.id)===btn.dataset.reusePlan);if(!plan||!$('#routeForm'))return;$('#routeForm').elements.from_open.value=plan.origin;$('#routeForm').elements.to_open.value=plan.destination;if(plan.vehicle_id)$('#routeForm').elements.vehicle_id.value=plan.vehicle_id;$('#routeForm').requestSubmit();}));
}
function applySavedAddress(id,target){const a=state.addresses.find(x=>String(x.id)===String(id));const form=$('#routeForm');if(!a||!form)return;form.elements[`${target}_open`].value=a.full_address;toast(`${a.label} ${t('route.addressApplied')}`);}
function openAddressModal(){openModal(`<h2>${t('route.addAddress')}</h2><p>${t('route.addAddressHelp')}</p><form id="addressForm" class="modal-form"><div class="form-grid"><label>${t('route.addressLabel')}<input name="label" maxlength="60" placeholder="Ev / İş" required></label><label>${t('route.addressType')}<select name="address_type"><option value="home">${t('route.home')}</option><option value="work">${t('route.work')}</option><option value="other">${t('route.otherAddress')}</option></select></label></div><div class="form-grid"><label>${t('route.province')}<select name="province"><option value="">—</option>${provinceOptions()}</select></label><label>${t('route.district')}<input name="district"></label></div><div class="form-grid"><label>${t('route.neighborhood')}<input name="neighborhood"></label><label>${t('route.street')}<input name="street"></label></div><label>${t('route.buildingNo')}<input name="building_no"></label><label>${t('route.fullAddress')}<textarea name="full_address" maxlength="500" required></textarea></label><label class="check"><input type="checkbox" name="is_default_origin" value="1"> ${t('route.defaultOrigin')}</label><button class="primary-btn wide" type="submit">${t('common.save')}</button></form>`);$('#addressForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;setButtonLoading(b,true,t('common.loading'));try{const fd=new FormData(e.currentTarget),body=Object.fromEntries(fd);body.is_default_origin=fd.has('is_default_origin')?1:0;await api('addresses',{method:'POST',body});closeModal();toast(t('toast.saved'));await renderRoute();}catch(error){toast(error.message,'error');setButtonLoading(b,false);}});}
async function calculateRoute(event){event.preventDefault();const form=event.currentTarget,button=event.submitter;if(!form.elements.from.value||!form.elements.to.value){toast(t('route.addressRequired'),'error');return;}setButtonLoading(button,true,t('common.loading'));try{const body=Object.fromEntries(new FormData(form));const v=state.vehicles.find(x=>String(x.id)===String(body.vehicle_id));if(v?.fuel_type==='electric'){body.current_charge_percent=body.current_fuel_liters;delete body.current_fuel_liters;}const data=await api('route_estimate',{method:'POST',body});state.currentJourney=data;state.selectedJourneyIndex=0;drawJourneyResult();}catch(error){toast(error.message,'error');}finally{setButtonLoading(button,false);}}
function drawJourneyResult(){
  const data=state.currentJourney;if(!data)return;
  const route=data.routes[state.selectedJourneyIndex]||data.routes[0],fuel=route.fuel_analysis||{};
  const tollKnown=route.toll!==null&&route.toll!==undefined;
  const tollValue=tollKnown?Number(route.toll):null;
  const hgsEnough=tollKnown?Number(data.balance)>=tollValue:null;
  const shortfall=tollKnown?Math.max(0,tollValue-Number(data.balance)):0;
  const routeTabs=data.routes.map((item,index)=>`<button class="journey-option ${index===state.selectedJourneyIndex?'active':''}" data-journey-index="${index}"><span>${index===0?t('route.recommended'):t('route.economic')}</span><strong>${item.total_complete?formatMoney(item.total_cost,item.currency||'TRY'):`${state.language==='en'?'Known':'Bilinen'} ${formatMoney(item.known_total_cost,item.currency||'TRY')}`}</strong><small>${formatDistance(item.distance_meters)} · ${formatDuration(item.duration_seconds)}</small></button>`).join('');
  const breakdown=(route.breakdown||[]).map(i=>`<div class="toll-line"><span><b>${escapeHtml(i.name)}</b><small>${escapeHtml(i.detail||'')}</small></span><strong>${formatMoney(i.amount,i.currency||'TRY')}</strong></div>`).join('');
  const fuelKnown=fuel.available!==null&&fuel.available!==undefined;const fuelClass=!fuelKnown?'unknown':fuel.sufficient?'safe':'danger';const fuelStatus=!fuelKnown?t('route.energyUnknown'):fuel.sufficient?t('route.energyEnough'):t('route.energyShort');
  const stations=(data.stations||[]).map(s=>`<article class="station-card"><span>⛽</span><div><strong>${escapeHtml(s.name)}</strong><small>${escapeHtml(s.address)}</small><em>${Number(s.is_24h)?'24/7':''} · ${t('route.demoStation')}</em></div><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name+' '+s.address)}" target="_blank" rel="noopener">↗</a></article>`).join('');
  const tollClass=!tollKnown?'unknown':route.has_tolls?'toll-found':'no-toll';
  const tollTitle=!tollKnown?(state.language==='en'?'Toll could not be verified':'Ücret doğrulanamadı'):route.has_tolls?(state.language==='en'?'Toll corridor detected':'Ücretli yol tespit edildi'):(state.language==='en'?'No toll road detected':'Ücretli yol tespit edilmedi');
  const scoreSafe=(hgsEnough!==false&&fuel.sufficient!==false);
  $('#routeResult').innerHTML=`<div class="journey-result-head"><div><span class="eyebrow">${escapeHtml(data.from)} → ${escapeHtml(data.to)}</span><h2>${t('route.budgetReady')}</h2><p>${state.language==='en'?'Only verified or known costs are included.':'Yalnızca doğrulanabilen veya bilinen maliyetler hesaba katılır.'}</p></div><span class="journey-score ${scoreSafe?'safe':'warning'}">${scoreSafe?'✓':'!'}</span></div><div class="journey-options">${routeTabs}</div><section class="toll-trust-card ${tollClass}"><span>${!tollKnown?'?':route.has_tolls?'₺':'✓'}</span><div><h3>${tollTitle}</h3><p>${escapeHtml(route.toll_message||'')}</p></div><strong>${tollKnown?formatMoney(tollValue):'—'}</strong></section><div class="journey-summary-grid budget"><div><small>${t('route.toll')}</small><strong>${tollKnown?formatMoney(tollValue):t('route.unknownToll')}</strong></div><div><small>${t('route.fuelCost')}</small><strong>${formatMoney(route.fuel_cost)}</strong></div><div><small>${t('route.parkingBudget')}</small><strong>${formatMoney(route.parking_budget)}</strong></div><div class="grand-total"><small>${route.total_complete?t('route.journeyTotal'):(state.language==='en'?'Known cost total':'Bilinen maliyet toplamı')}</small><strong>${formatMoney(route.known_total_cost)}</strong></div></div><section class="fuel-analysis-card ${fuelClass}"><div class="fuel-gauge"><span>${data.vehicle.fuel_type==='electric'?'⚡':'⛽'}</span><b>${fuelStatus}</b></div><div class="fuel-analysis-grid"><div><small>${t('route.consumption')}</small><strong>${fuel.average_consumption} ${fuel.unit}/100 km</strong></div><div><small>${t('route.requiredEnergy')}</small><strong>${fuel.required_with_margin} ${fuel.unit}</strong></div><div><small>${t('route.availableEnergy')}</small><strong>${fuelKnown?`${fuel.available} ${fuel.unit}`:'—'}</strong></div><div><small>${fuel.sufficient===false?t('route.missingEnergy'):t('route.arrivalEnergy')}</small><strong>${fuel.sufficient===false?`${fuel.missing} ${fuel.unit}`:(fuel.arrival_level!==null&&fuel.arrival_level!==undefined?`${fuel.arrival_level}${data.vehicle.fuel_type==='electric'?'%':' L'}`:'—')}</strong></div></div><p>${fuelKnown?(fuel.sufficient?t('route.energyEnoughText'):t('route.energyShortText')):t('route.energyUnknownText')}</p></section><section class="toll-breakdown"><div class="panel-head"><div><h3>${t('route.breakdown')}</h3><p>${tollKnown?escapeHtml(route.toll_message||''):state.language==='en'?'No HGS amount is added to the total until the route is verified.':'Rota doğrulanana kadar toplama HGS tutarı eklenmez.'}</p></div></div>${breakdown||`<div class="no-toll-breakdown"><span>${route.has_tolls===false?'✓':'?'}</span><p>${escapeHtml(route.toll_message||'')}</p></div>`}<div class="toll-line"><span><b>${t('route.fuelCost')}</b><small>${fuel.base_required} ${fuel.unit} × ${formatMoney(fuel.unit_price)}</small></span><strong>${formatMoney(route.fuel_cost)}</strong></div><div class="toll-total"><span>${route.total_complete?t('route.journeyTotal'):(state.language==='en'?'Known cost total':'Bilinen maliyet toplamı')}</span><strong>${formatMoney(route.known_total_cost)}</strong></div></section>${stations?`<section class="station-section"><div class="panel-head"><div><h3>${t('route.nearbyStations')}</h3><p>${t('route.stationNotice')}</p></div></div><div class="station-list">${stations}</div></section>`:''}<div class="journey-actions">${hgsEnough===false?`<button id="journeyTopup" class="primary-btn">₺ ${formatMoney(shortfall)} ${t('route.topupMissing')}</button>`:''}<a class="secondary-btn button-link" href="${escapeHtml(data.google_maps_url)}" target="_blank" rel="noopener">${t('route.openMaps')} ↗</a><button id="saveJourney" class="ghost-btn">☆ ${t('route.saveJourney')}</button></div><div class="source-note"><span>i</span><p>${escapeHtml(data.disclaimer)}<br>${t('route.tariffVersion')}: ${escapeHtml(data.tariff_version)}</p></div>`;
  $$('[data-journey-index]').forEach(btn=>btn.addEventListener('click',()=>{state.selectedJourneyIndex=Number(btn.dataset.journeyIndex);drawJourneyResult();}));
  $('#journeyTopup')?.addEventListener('click',()=>{sessionStorage.setItem('roadpass_topup_amount',String(shortfall));loadPage('wallet');});
  $('#saveJourney')?.addEventListener('click',async event=>{setButtonLoading(event.currentTarget,true,t('common.loading'));try{await api('journey_plans',{method:'POST',body:{from:data.from,to:data.to,vehicle_id:data.vehicle_id,route}});toast(t('route.savedSuccess'));await renderRoute();}catch(error){toast(error.message,'error');setButtonLoading(event.currentTarget,false);}});
}
async function renderAssistant() {
  const data=await api('ai_history');
  const mode=state.config.openai_enabled?t('ai.advancedMode'):t('ai.guideMode');
  const messages=data.messages.length?data.messages.map(item=>`<div class="message ${item.role==='assistant'?'ai':'user'}"><div>${escapeHtml(item.content)}</div><small>${formatDate(item.created_at)}</small></div>`).join(''):`<div class="message ai">${t('ai.subtitle')}</div>`;
  $('#pageContent').innerHTML=`<div class="chat-layout"><section class="panel chat-panel"><div class="panel-head"><div><h3>${t('ai.title')}</h3><p>${t('ai.subtitle')}</p></div><div class="chat-head-actions"><span class="status-pill">✦ ${mode}</span><button id="newChatBtn" class="ghost-btn">＋ ${t('ai.newChat')}</button></div></div><div id="chatMessages" class="chat-messages">${messages}</div><form id="chatForm" class="chat-input-row"><input name="message" maxlength="1200" autocomplete="off" placeholder="${t('ai.placeholder')}" required><button class="primary-btn" type="submit">${t('ai.send')} →</button></form></section><aside class="panel assistant-side"><div class="assistant-capability"><span>✦</span><div><strong>${t('ai.specialist')}</strong><p>${t('ai.specialistText')}</p></div></div><div class="panel-head"><div><h3>${t('ai.quick')}</h3></div></div><div class="suggestion-list">${['q1','q2','q3','q4'].map(key=>`<button class="suggestion-btn">${t(`ai.${key}`)}</button>`).join('')}</div><div class="disclaimer">${t('ai.notice')}</div></aside></div>`;
  $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
  $('#chatForm').addEventListener('submit',sendAiMessage);
  $$('.suggestion-btn').forEach(btn=>btn.addEventListener('click',()=>{ $('#chatForm input').value=btn.textContent; $('#chatForm').requestSubmit(); }));
  $('#newChatBtn').addEventListener('click',async()=>{ try{ await api('ai_history',{method:'DELETE'}); await renderAssistant(); }catch(error){toast(error.message,'error');} });
}
async function sendAiMessage(event) {
  event.preventDefault(); const input=$('input[name="message"]',event.currentTarget); const message=input.value.trim(); if(!message)return;
  $('#chatMessages').insertAdjacentHTML('beforeend',`<div class="message user"><div>${escapeHtml(message)}</div></div>`); input.value=''; const button=event.submitter; setButtonLoading(button,true,''); $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
  try{ const data=await api('ai_assistant',{method:'POST',body:{message}}); $('#chatMessages').insertAdjacentHTML('beforeend',`<div class="message ai"><div>${escapeHtml(data.reply)}</div><small>${escapeHtml(data.mode)}</small></div>`); if(data.integration_error)toast(data.integration_error,'error'); }
  catch(error){ toast(error.message,'error'); }
  finally{ setButtonLoading(button,false); $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight; }
}

async function renderNotifications() {
  const data=await api('notifications'); state.notifications=data.notifications;
  const list=state.notifications.length?state.notifications.map(item=>`<article class="notification-item ${Number(item.is_read)?'':'unread'}"><div class="notification-icon">${notificationIcon(item.type)}</div><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.message)}</p></div><time>${formatDate(item.created_at)}</time></article>`).join(''):`<div class="empty-state"><span>🔔</span><h3>${t('notifications.empty')}</h3></div>`;
  $('#pageContent').innerHTML=`<div class="page-toolbar"><div><h2>${t('notifications.title')}</h2><p>${t('notifications.subtitle')}</p></div><button id="markAllRead" class="secondary-btn">${t('notifications.markAll')}</button></div><div class="notification-list">${list}</div>`;
  $('#markAllRead').addEventListener('click',async()=>{ try{ await api('notifications',{method:'POST',body:{}}); await renderNotifications(); await refreshNotificationBadges(); }catch(error){toast(error.message,'error');} }); await refreshNotificationBadges();
}
function notificationIcon(type){ return ({low_balance:'₺',passage:'↺',campaign:'★',welcome:'✦',topup:'＋',premium:'PRO'})[type]||'🔔'; }

async function renderPremium() {
  const [data,dashboard]=await Promise.all([api('premium'),api('dashboard')]);
  const active=data.subscription; const forecast=dashboard.forecast||{}; const readiness=dashboard.readiness||{};
  const planCards=data.plans.map(plan=>`<article class="plan-card ${active&&Number(active.plan_id)===Number(plan.id)?'selected':''} ${plan.billing_period==='yearly'?'featured':''}">${plan.billing_period==='yearly'?`<span class="plan-save-badge">${t('premium.bestValue')}</span>`:''}<span class="eyebrow">${plan.billing_period==='yearly'?t('premium.yearly'):t('premium.monthly')}</span><h3>${escapeHtml(state.language==='en'?plan.name_en:plan.name_tr)}</h3><div class="plan-price"><strong>${formatMoney(plan.price,plan.currency)}</strong><small>/${plan.billing_period==='yearly'?t('premium.year'):t('premium.month')}</small></div><p>${plan.billing_period==='yearly'?t('premium.yearlyHelp'):t('premium.monthlyHelp')}</p><button class="primary-btn wide" data-plan-id="${plan.id}">${active&&Number(active.plan_id)===Number(plan.id)?t('premium.changePayment'):t('premium.choosePlan')}</button></article>`).join('');
  const premiumFeatures = state.language==='en' ? [
    ['◎','Readiness intelligence','A clear score that combines balance, dates, and vehicle status.'],
    ['↗','30/90-day cost outlook','Forecast known costs without inventing unknown future bills.'],
    ['⚡','Proactive actions','See the next useful step and continue at the correct official service.'],
    ['▦','Detailed reports','Compare HGS and vehicle expenses and prepare printable summaries.'],
    ['✦','Aurora appearance','Choose an exclusive visual identity while keeping RoadPass familiar.'],
    ['⌁','Journey memory','Save plans and compare known HGS and energy costs.'],
  ] : [
    ['◎','Hazırlık zekâsı','Bakiye, tarihler ve araç durumunu birleştiren anlaşılır puan.'],
    ['↗','30/90 günlük gider öngörüsü','Bilinmeyen gelecek masraflarını uydurmadan bilinen maliyetleri tahmin eder.'],
    ['⚡','Önleyici işlem önerileri','Sıradaki doğru adımı görün ve doğru resmî serviste devam edin.'],
    ['▦','Ayrıntılı raporlar','HGS ve araç giderlerini karşılaştırın, yazdırılabilir özetler hazırlayın.'],
    ['✦','Aurora görünümü','RoadPass kimliğini koruyan size özel görsel tema seçin.'],
    ['⌁','Yolculuk hafızası','Planları kaydedin, bilinen HGS ve enerji maliyetlerini karşılaştırın.'],
  ];
  const featureCards=premiumFeatures.map(f=>`<article class="pro-value-card"><span>${f[0]}</span><h3>${escapeHtml(f[1])}</h3><p>${escapeHtml(f[2])}</p></article>`).join('');
  const payments=data.payments?.length?data.payments.map(payment=>`<tr><td>${formatDate(payment.created_at)}</td><td>${escapeHtml(payment.reference_code)}</td><td>${escapeHtml(payment.card_brand)} •••• ${escapeHtml(payment.card_last4)}</td><td><span class="status-pill">${escapeHtml(payment.status)}</span></td><td class="amount">${formatMoney(payment.amount,payment.currency)}</td></tr>`).join(''):`<tr><td colspan="5">${t('premium.noPayments')}</td></tr>`;
  const activeHtml=active?`<section class="subscription-console aurora-console"><div><span class="status-pill">● ${t('premium.active')}</span><h3>${escapeHtml(state.language==='en'?active.name_en:active.name_tr)}</h3><p>${t('premium.nextBilling')}: <strong>${formatDate(active.ends_at,false)}</strong> · ${active.auto_renew?t('premium.autoRenewOn'):t('premium.autoRenewOff')}</p></div><div class="subscription-actions">${active.auto_renew?`<button id="cancelPremium" class="danger-btn">${t('premium.stopRenewal')}</button>`:`<button id="reactivatePremium" class="primary-btn">${t('premium.reactivate')}</button>`}</div></section>`:'';
  const proCockpit=active?`<section class="pro-intelligence-grid"><article class="pro-intelligence-card"><span>${state.language==='en'?'READINESS':'HAZIRLIK'}</span><strong>${readiness.score||0}<small>/100</small></strong><p>${escapeHtml(readiness.label||'')}</p></article><article class="pro-intelligence-card"><span>${state.language==='en'?'30-DAY OUTLOOK':'30 GÜNLÜK ÖNGÖRÜ'}</span><strong>${formatMoney(forecast.total||0)}</strong><p>${state.language==='en'?'Known estimated vehicle cost':'Tahminî bilinen araç gideri'}</p></article><article class="pro-intelligence-card"><span>${state.language==='en'?'90-DAY OUTLOOK':'90 GÜNLÜK ÖNGÖRÜ'}</span><strong>${formatMoney(Number(forecast.total||0)*3)}</strong><p>${state.language==='en'?'Projection from your current pattern':'Mevcut kullanım düzeninden projeksiyon'}</p></article></section><section class="panel premium-theme-studio"><div class="panel-head"><div><h3>${state.language==='en'?'Premium Theme Studio':'Premium Tema Stüdyosu'}</h3><p>${state.language==='en'?'Choose a distinctive RoadPass look. You can also change it in Profile settings.':'Kendine özgü RoadPass görünümünü seçin. Profil ayarlarından da değiştirebilirsiniz.'}</p></div></div><div class="theme-choices"><button data-premium-theme="aurora" class="theme-choice aurora ${state.user.accent_theme==='aurora'?'active':''}"><span></span><strong>Aurora</strong><small>${state.language==='en'?'Blue · mint · warm gold':'Mavi · mint · sıcak altın'}</small></button><button data-premium-theme="mint" class="theme-choice mint ${state.user.accent_theme==='mint'?'active':''}"><span></span><strong>Mint Drive</strong><small>${state.language==='en'?'Calm and high contrast':'Sakin ve yüksek kontrast'}</small></button><button data-premium-theme="midnight" class="theme-choice midnight ${state.user.accent_theme==='midnight'?'active':''}"><span></span><strong>Midnight</strong><small>${state.language==='en'?'Deep blue and violet':'Koyu mavi ve mor'}</small></button></div></section>`:'';
  $('#pageContent').innerHTML=`<div class="premium-hero premium-hero-v4"><div><span class="eyebrow">ROADPASS AURORA</span><h2>${active?(state.language==='en'?'Your vehicle life, predicted':'Aracınızın geleceğini önceden görün'):t('premium.title')}</h2><p>${state.language==='en'?'Premium is built around better foresight and fewer surprises—not merely adding more vehicles.':'Premium yalnızca daha fazla araç değil; daha iyi öngörü ve daha az sürpriz için tasarlandı.'}</p><div class="premium-benefit-strip"><span>◎ ${state.language==='en'?'Readiness score':'Hazırlık puanı'}</span><span>↗ ${state.language==='en'?'Cost outlook':'Gider öngörüsü'}</span><span>✦ ${state.language==='en'?'Exclusive themes':'Özel temalar'}</span></div></div><div class="premium-hero-mark"><span>PRO</span><strong>A</strong></div></div>${activeHtml}${proCockpit}<section class="premium-value-section"><div class="section-heading"><span class="eyebrow">${state.language==='en'?'WHY PREMIUM?':'NEDEN PREMIUM?'}</span><h2>${state.language==='en'?'Value that continues every month':'Her ay devam eden gerçek değer'}</h2></div><div class="pro-value-grid">${featureCards}</div></section><div class="plans-grid">${planCards}</div><section class="panel top-gap"><div class="panel-head"><div><h3>${t('premium.paymentHistory')}</h3><p>${t('premium.paymentHistoryHelp')}</p></div></div><div class="table-wrap"><table><thead><tr><th>${t('common.date')}</th><th>${t('premium.reference')}</th><th>${t('premium.card')}</th><th>${t('common.status')}</th><th>${t('common.amount')}</th></tr></thead><tbody>${payments}</tbody></table></div></section>`;
  $$('[data-plan-id]').forEach(btn=>btn.addEventListener('click',()=>{const plan=data.plans.find(item=>String(item.id)===btn.dataset.planId);openPremiumPaymentModal(plan);}));
  $$('[data-premium-theme]').forEach(btn=>btn.addEventListener('click',()=>setPremiumAccent(btn.dataset.premiumTheme)));
  $('#cancelPremium')?.addEventListener('click',async event=>{setButtonLoading(event.currentTarget,true,t('common.loading'));try{await api('premium',{method:'POST',body:{operation:'cancel'}});toast(t('premium.cancelledNotice'));await refreshUser();await renderPremium();}catch(error){toast(error.message,'error');setButtonLoading(event.currentTarget,false);}});
  $('#reactivatePremium')?.addEventListener('click',async event=>{setButtonLoading(event.currentTarget,true,t('common.loading'));try{await api('premium',{method:'POST',body:{operation:'reactivate'}});toast(t('toast.saved'));await refreshUser();await renderPremium();}catch(error){toast(error.message,'error');setButtonLoading(event.currentTarget,false);}});
}

async function setPremiumAccent(theme){
  try{
    const data=await api('profile'); const p=data.profile;
    await api('profile',{method:'POST',body:{full_name:p.full_name,phone:p.phone||'',language:p.language,push_enabled:Number(p.push_enabled),email_enabled:Number(p.email_enabled),premium_theme_enabled:1,simple_mode:Number(p.simple_mode),large_text:Number(p.large_text),accent_theme:theme}});
    await refreshUser();toast(state.language==='en'?'Premium theme saved.':'Premium tema kaydedildi.');await renderPremium();
  }catch(error){toast(error.message,'error');}
}
function openPremiumPaymentModal(plan) {
  if(!plan)return;
  openModal(`<div class="payment-modal"><div class="payment-heading"><span>PRO</span><div><h2>${t('premium.secureCheckout')}</h2><p>${escapeHtml(state.language==='en'?plan.name_en:plan.name_tr)} · ${formatMoney(plan.price,plan.currency)}</p></div></div><div class="demo-payment-banner"><strong>${t('premium.demoPaymentTitle')}</strong><p>${t('premium.demoPaymentText')}</p></div><form id="premiumPaymentForm" class="modal-form"><input type="hidden" name="plan_id" value="${plan.id}"><label>${t('premium.cardholder')}<input name="cardholder" maxlength="80" placeholder="MELİH EFE ERCAN" autocomplete="cc-name" required></label><label>${t('premium.cardNumber')}<div class="card-input-wrap"><input name="card_number" inputmode="numeric" maxlength="19" placeholder="4242 4242 4242 4242" autocomplete="cc-number" required><span id="cardBrand">CARD</span></div></label><div class="form-grid"><label>${t('premium.expiry')}<input name="expiry" inputmode="numeric" maxlength="5" placeholder="12/29" autocomplete="cc-exp" required></label><label>${t('premium.cvv')}<input name="cvv" type="password" inputmode="numeric" maxlength="4" placeholder="123" autocomplete="cc-csc" required></label></div><label class="check terms-check"><input type="checkbox" name="terms" required><span>${t('premium.terms')}</span></label><div class="payment-summary"><span>${t('premium.today')}</span><strong>${formatMoney(plan.price,plan.currency)}</strong></div><button class="primary-btn wide" type="submit">🔒 ${t('premium.completeDemoPayment')}</button></form><div class="security-foot">🔒 ${t('premium.securityFoot')}</div></div>`);
  const number=$('[name="card_number"]'); const expiry=$('[name="expiry"]');
  number.addEventListener('input',()=>{ const digits=number.value.replace(/\D/g,'').slice(0,16); number.value=digits.replace(/(.{4})/g,'$1 ').trim(); $('#cardBrand').textContent=digits.startsWith('4')?'VISA':digits.startsWith('5')?'MC':'CARD'; });
  expiry.addEventListener('input',()=>{ const digits=expiry.value.replace(/\D/g,'').slice(0,4); expiry.value=digits.length>2?`${digits.slice(0,2)}/${digits.slice(2)}`:digits; });
  $('[name="cvv"]').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,4);});
  $('#premiumPaymentForm').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;setButtonLoading(button,true,t('common.loading'));try{const form=new FormData(event.currentTarget);const body=Object.fromEntries(form);body.operation='subscribe';body.card_number=body.card_number.replace(/\s/g,'');const result=await api('premium',{method:'POST',body});openModal(`<div class="success-state premium-success"><span>✓</span><h2>${t('premium.welcomePro')}</h2><p>${t('premium.welcomeProText')}</p><div class="success-receipt"><div><small>${t('premium.plan')}</small><strong>${escapeHtml(state.language==='en'?plan.name_en:plan.name_tr)}</strong></div><div><small>${t('premium.nextBilling')}</small><strong>${formatDate(result.ends_at,false)}</strong></div><div><small>${t('premium.reference')}</small><strong>${escapeHtml(result.reference)}</strong></div></div><button id="premiumDone" class="primary-btn wide">${t('premium.explore')}</button></div>`);$('#premiumDone').addEventListener('click',async()=>{closeModal();await refreshUser();await renderPremium();});}catch(error){toast(error.message,'error');setButtonLoading(button,false);}});
}
async function renderHelp() {
  const data=await api('support');
  const faqs=(data.faqs||[]).map((faq,index)=>`<details class="faq-item" ${index===0?'open':''}><summary>${escapeHtml(faq.question)}<span>＋</span></summary><p>${escapeHtml(faq.answer)}</p></details>`).join('');
  const tickets=data.tickets?.length?data.tickets.map(ticket=>`<article class="ticket-card"><div><span class="status-pill">${escapeHtml(ticket.status)}</span><h4>${escapeHtml(ticket.subject)}</h4><p>${escapeHtml(ticket.message)}</p></div><time>${formatDate(ticket.created_at)}</time></article>`).join(''):`<div class="empty-state compact"><span>✓</span><h3>${t('help.noTickets')}</h3><p>${t('help.noTicketsHelp')}</p></div>`;
  const guideCards = state.language==='en' ? [
    ['◎','Dashboard','See today’s actions, readiness score, and estimated 30-day known costs.','dashboard'],
    ['₺','HGS Wallet','Manage demo balance and continue to the official PTT service for real transactions.','wallet'],
    ['🚗','My Vehicle','Keep expenses and dates together; technical fields are optional.','vehicles'],
    ['⌁','Journey Budget','Check known HGS cost and fuel sufficiency. Unknown tolls are not invented.','route'],
  ] : [
    ['◎','Dashboard','Bugünkü işlemleri, hazırlık puanını ve 30 günlük bilinen gider tahminini gösterir.','dashboard'],
    ['₺','HGS Cüzdanım','Demo bakiyeyi yönetin; gerçek işlem için resmî PTT servisine geçin.','wallet'],
    ['🚗','Aracım','Giderleri ve tarihleri bir arada tutun; teknik bilgiler isteğe bağlıdır.','vehicles'],
    ['⌁','Yolculuk Bütçesi','Bilinen HGS maliyetini ve yakıt yeterliliğini görün. Bilinmeyen ücret uydurulmaz.','route'],
  ];
  const guideHtml=guideCards.map(card=>`<button class="app-guide-card" data-guide-page="${card[3]}"><span>${card[0]}</span><div><h3>${escapeHtml(card[1])}</h3><p>${escapeHtml(card[2])}</p></div><b>→</b></button>`).join('');
  $('#pageContent').innerHTML=`<div class="help-hero"><div><span class="eyebrow">ROADPASS CARE</span><h2>${state.language==='en'?'RoadPass, explained simply':'RoadPass’i kolayca tanıyın'}</h2><p>${state.language==='en'?'Designed for first-time users, young drivers, older users, and anyone who wants clear steps.':'İlk kez kullananlar, gençler, ileri yaştaki kullanıcılar ve net adımlar isteyen herkes için tasarlandı.'}</p></div><button class="primary-btn" id="restartOnboarding">▶ ${state.language==='en'?'Show introduction':'Tanıtımı Göster'}</button></div><section class="panel app-guide-panel"><div class="panel-head"><div><h3>${state.language==='en'?'What does each section do?':'Hangi bölüm ne işe yarar?'}</h3><p>${state.language==='en'?'Open a short explanation without leaving this page.':'Sayfadan ayrılmadan kısa açıklamayı açın.'}</p></div></div><div class="app-guide-grid">${guideHtml}</div></section><section class="official-services-strip"><div><span>✓</span><strong>${state.language==='en'?'Official vehicle services':'Resmî araç servisleri'}</strong><small>${state.language==='en'?'RoadPass directs you; the real transaction stays with the authorised institution.':'RoadPass yönlendirir; gerçek işlem yetkili kurumda kalır.'}</small></div><a href="https://www.turkiye.gov.tr/muayene-randevu-kayit" target="_blank" rel="noopener">${state.language==='en'?'Inspection appointment':'Muayene randevusu'} ↗</a><a href="https://hgsmusteri.ptt.gov.tr/" target="_blank" rel="noopener">${state.language==='en'?'Official HGS':'Resmî HGS'} ↗</a><a href="https://www.turkiye.gov.tr/csb-egzoz-gazi-emisyon-olcumu-sorgulama" target="_blank" rel="noopener">${state.language==='en'?'Emission check':'Egzoz sorgulama'} ↗</a></section><div class="help-grid"><section class="panel"><div class="panel-head"><div><h3>${t('help.faq')}</h3><p>${t('help.faqHelp')}</p></div></div><div class="faq-list">${faqs}</div></section><aside class="help-side"><section class="panel support-contact"><span>?</span><h3>${t('help.needHelp')}</h3><p>${t('help.needHelpText')}</p><button id="openSupportFormSide" class="secondary-btn wide">${t('help.contact')}</button></section><section class="panel"><div class="panel-head"><div><h3>${t('help.myTickets')}</h3></div></div><div class="ticket-list">${tickets}</div></section></aside></div>`;
  $('#openSupportFormSide').addEventListener('click',openSupportModal);
  $$('[data-guide-page]').forEach(btn=>btn.addEventListener('click',()=>showPageGuide(btn.dataset.guidePage)));
  $('#restartOnboarding').addEventListener('click',()=>{localStorage.removeItem(`roadpass_onboarding_v4_${state.user?.id||'guest'}`);showOnboarding();});
}
function openSupportModal(){
  openModal(`<h2>${t('help.createTicket')}</h2><p>${t('help.createTicketHelp')}</p><form id="supportForm" class="modal-form"><label>${t('help.category')}<select name="category"><option value="account">${t('help.catAccount')}</option><option value="wallet">${t('help.catWallet')}</option><option value="vehicle">${t('help.catVehicle')}</option><option value="premium">${t('help.catPremium')}</option><option value="other">${t('help.catOther')}</option></select></label><label>${t('help.subject')}<input name="subject" maxlength="140" required></label><label>${t('help.message')}<textarea name="message" maxlength="2000" required></textarea></label><button class="primary-btn wide" type="submit">${t('help.send')}</button></form>`);
  $('#supportForm').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;setButtonLoading(button,true,t('common.loading'));try{const result=await api('support',{method:'POST',body:Object.fromEntries(new FormData(event.currentTarget))});openModal(`<div class="success-state"><span>✓</span><h2>${t('help.ticketCreated')}</h2><p>${t('help.ticketCreatedText')}</p><div class="success-receipt"><div><small>${t('premium.reference')}</small><strong>${escapeHtml(result.reference)}</strong></div></div><button id="supportDone" class="primary-btn wide">${t('common.close')}</button></div>`);$('#supportDone').addEventListener('click',async()=>{closeModal();await renderHelp();});}catch(error){toast(error.message,'error');setButtonLoading(button,false);}});
}

async function renderProfile(){
  const data=await api('profile');state.profile=data.profile;const p=data.profile;const premium=p.membership==='premium';
  $('#pageContent').innerHTML=`<div class="profile-layout"><section class="panel profile-card ${premium?'premium-profile':''}"><div class="profile-avatar">${initials(p.full_name)}</div>${premium?'<span class="profile-pro-ring">PRO</span>':''}<h3>${escapeHtml(p.full_name)}</h3><p>${escapeHtml(p.email)}</p><span class="status-pill">${premium?t('membership.premium'):t('membership.standard')}</span>${p.role==='admin'?`<a class="secondary-btn button-link wide" href="../admin/" target="_blank">${t('profile.adminPanel')} ↗</a>`:''}<button id="profileGuide" class="ghost-btn wide">? ${state.language==='en'?'Explain these settings':'Bu ayarları açıkla'}</button></section><section class="panel"><div class="panel-head"><div><h3>${t('profile.title')}</h3><p>${state.language==='en'?'Personal information and a RoadPass experience suitable for every age.':'Kişisel bilgiler ve her yaşa uygun RoadPass deneyimi.'}</p></div></div><form id="profileForm" class="settings-form"><div class="form-grid"><label>${t('common.fullName')}<input name="full_name" value="${escapeHtml(p.full_name)}" required></label><label>${t('common.phone')}<input name="phone" value="${escapeHtml(p.phone||'')}"></label></div><div class="form-grid"><label>${t('common.email')}<input value="${escapeHtml(p.email)}" disabled></label><label>${t('profile.language')}<select name="language"><option value="tr" ${p.language==='tr'?'selected':''}>Türkçe</option><option value="en" ${p.language==='en'?'selected':''}>English</option></select></label></div><div class="settings-section"><div class="settings-section-head"><span>Aa</span><div><h4>${state.language==='en'?'Accessibility':'Erişilebilirlik'}</h4><p>${state.language==='en'?'Make RoadPass easier to read and navigate.':'RoadPass’i okumayı ve kullanmayı kolaylaştırın.'}</p></div></div><div class="switch-row"><div><strong>${state.language==='en'?'Large text':'Büyük yazı'}</strong><small>${state.language==='en'?'Increases important text and button sizes.':'Önemli metinleri ve düğmeleri büyütür.'}</small></div><label class="switch"><input type="checkbox" name="large_text" value="1" ${Number(p.large_text)?'checked':''}><span class="slider"></span></label></div><div class="switch-row"><div><strong>${state.language==='en'?'Simple view':'Sade görünüm'}</strong><small>${state.language==='en'?'Reduces decorative elements and keeps core actions prominent.':'Süslemeleri azaltır, temel işlemleri öne çıkarır.'}</small></div><label class="switch"><input type="checkbox" name="simple_mode" value="1" ${Number(p.simple_mode)?'checked':''}><span class="slider"></span></label></div></div><div class="switch-row"><div><strong>${t('profile.push')}</strong><small>${t('profile.pushText')}</small></div><label class="switch"><input type="checkbox" name="push_enabled" value="1" ${Number(p.push_enabled)?'checked':''}><span class="slider"></span></label></div><div class="switch-row"><div><strong>${t('profile.emailNotifications')}</strong><small>${t('profile.emailText')}</small></div><label class="switch"><input type="checkbox" name="email_enabled" value="1" ${Number(p.email_enabled)?'checked':''}><span class="slider"></span></label></div>${premium?`<div class="settings-section premium-settings-section"><div class="settings-section-head"><span>✦</span><div><h4>${state.language==='en'?'Premium appearance':'Premium görünüm'}</h4><p>${state.language==='en'?'Choose a distinctive palette close to the RoadPass identity.':'RoadPass kimliğine yakın, kendine özgü paleti seçin.'}</p></div></div><div class="switch-row"><div><strong>${t('profile.premiumTheme')}</strong><small>${t('profile.premiumThemeText')}</small></div><label class="switch"><input type="checkbox" name="premium_theme_enabled" value="1" ${Number(p.premium_theme_enabled)?'checked':''}><span class="slider"></span></label></div><label>${state.language==='en'?'Accent theme':'Vurgu teması'}<select name="accent_theme"><option value="aurora" ${p.accent_theme==='aurora'?'selected':''}>Aurora — ${state.language==='en'?'Blue, mint, warm gold':'Mavi, mint, sıcak altın'}</option><option value="mint" ${p.accent_theme==='mint'?'selected':''}>Mint Drive — ${state.language==='en'?'Calm green':'Sakin yeşil'}</option><option value="midnight" ${p.accent_theme==='midnight'?'selected':''}>Midnight — ${state.language==='en'?'Deep blue and violet':'Koyu mavi ve mor'}</option></select></label></div>`:`<input type="hidden" name="premium_theme_enabled" value="0"><input type="hidden" name="accent_theme" value="aurora">`}<button class="primary-btn" type="submit">${t('profile.save')}</button></form></section></div>`;
  $('#profileForm').addEventListener('submit',saveProfile);$('#profileGuide').addEventListener('click',()=>showPageGuide('profile'));
}
async function saveProfile(event){
  event.preventDefault();const button=event.submitter;setButtonLoading(button,true,t('common.loading'));
  try{const form=new FormData(event.currentTarget),body=Object.fromEntries(form);body.push_enabled=form.has('push_enabled')?1:0;body.email_enabled=form.has('email_enabled')?1:0;body.premium_theme_enabled=form.has('premium_theme_enabled')?1:0;body.simple_mode=form.has('simple_mode')?1:0;body.large_text=form.has('large_text')?1:0;const data=await api('profile',{method:'POST',body});setLanguage(data.language);await refreshUser();toast(t('toast.saved'));await loadPage('profile');}catch(error){toast(error.message,'error');}finally{setButtonLoading(button,false);}
}
function openModal(html){ $('#modalContent').innerHTML=html; $('#modal').classList.remove('hidden'); }
function closeModal(){ $('#modal').classList.add('hidden'); $('#modalContent').innerHTML=''; }

window.loadPage=loadPage;
window.openAddVehicleModal=openAddVehicleModal;
document.addEventListener('DOMContentLoaded',bootstrap);
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(()=>{}));}
