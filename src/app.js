import "./styles.css";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile as updateAuthProfile
} from "firebase/auth";
import { auth } from "./firebase.js";
import {
  ADMIN_EMAIL, CATEGORIES, addComment, createAction, ensureProfile, formatDate, getItem,
  listenAdminCollection, listenComments, listenItems, listenMyItems, listenSaved,
  listenUserActions, listenUsers, removeComment, removeItem, saveItem, seedDemo,
  toggleSaved, updateActionStatus, updateProfile, updateUserRole
} from "./data.js";

const app = document.querySelector("#app");
const state = {
  user: null, profile: null, view: "catalog", unsubscribers: [], pageSize: 12,
  filters: { search: "", category: "", type: "", sort: "new", status: "active" }
};

const escapeHTML = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[char]);
const categoryIcon = category => ({
  "Документы":"▤", "Электроника":"▣", "Ключи":"⌘", "Сумки":"▧", "Одежда":"♟", "Питомцы":"♞", "Другое":"?"
})[category] || "?";
const typeLabel = type => type === "lost" ? "ПОТЕРЯНО" : "НАЙДЕНО";
const statusLabel = status => ({ active:"Активно", pending:"Ожидает", approved:"Подтверждено", rejected:"Отклонено", completed:"Завершено", returned:"Возвращено" })[status] || status;

function cleanup() {
  state.unsubscribers.forEach(fn => { try { fn(); } catch { /* already closed */ } });
  state.unsubscribers = [];
}

function toast(message, timeout = 3200) {
  document.querySelector(".toast")?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.setAttribute("role", "status");
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), timeout);
}

function friendlyError(error) {
  const code = error?.code || "";
  const known = {
    "auth/invalid-credential":"Неверный e-mail или пароль.",
    "auth/email-already-in-use":"Этот e-mail уже зарегистрирован.",
    "auth/weak-password":"Пароль должен содержать не менее 6 символов.",
    "auth/invalid-email":"Проверьте адрес электронной почты.",
    "auth/too-many-requests":"Слишком много попыток. Попробуйте позже.",
    "permission-denied":"Недостаточно прав для этой операции.",
    "failed-precondition":"Для запроса ещё создаётся индекс Firestore. Повторите через минуту."
  };
  return known[code] || error?.message || "Произошла ошибка. Попробуйте ещё раз.";
}

function windowFrame(title, content, extra = "") {
  return `<section class="window ${extra}">
    <div class="title-bar"><span class="close-box" aria-hidden="true"></span><h1>${escapeHTML(title)}</h1><span class="zoom-box" aria-hidden="true"></span></div>
    <div class="window-body">${content}</div>
  </section>`;
}

function renderAuth(mode = "login", error = "") {
  cleanup();
  const register = mode === "register";
  app.innerHTML = `<main class="desktop"><div class="menu-bar"><div class="menu-brand"><span class="apple">◆</span><strong>Lost &amp; Found 92</strong></div><div class="menu-user">Firebase Online</div></div>
    <div class="workspace">${windowFrame(register ? "Регистрация нового пользователя" : "Вход в систему", `
      <div style="max-width:420px;margin:auto">
        <p class="auth-copy">${register ? "Создайте учётную запись, чтобы публиковать объявления и отвечать на находки." : "Введите данные пользователя. Каталог доступен только участникам сервиса."}</p>
        ${error ? `<div class="error-box">${escapeHTML(error)}</div>` : ""}
        <form id="auth-form">
          ${register ? `<div class="field"><label for="auth-name">Имя</label><input id="auth-name" name="name" maxlength="60" autocomplete="name" required></div>` : ""}
          <div class="field"><label for="auth-email">E-mail</label><input id="auth-email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="auth-password">Пароль</label><input id="auth-password" name="password" type="password" minlength="6" autocomplete="${register ? "new-password" : "current-password"}" required></div>
          <button class="button primary full" type="submit">${register ? "Зарегистрироваться" : "Войти"}</button>
        </form>
        <div class="button-row" style="justify-content:space-between;margin-top:10px">
          <button id="auth-switch" class="auth-switch">${register ? "Уже есть аккаунт" : "Создать аккаунт"}</button>
          ${register ? "" : `<button id="reset-password" class="auth-switch">Забыли пароль?</button>`}
        </div>
        <div class="notice" style="margin-top:14px">Проект использует Firebase Authentication и защищённые правила Firestore.</div>
      </div>
    `, "dialog small")}</div></main>`;

  document.querySelector("#auth-switch").onclick = () => renderAuth(register ? "login" : "register");
  document.querySelector("#auth-form").onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      if (register) {
        const credential = await createUserWithEmailAndPassword(auth, form.get("email"), form.get("password"));
        await updateAuthProfile(credential.user, { displayName: form.get("name").trim() });
        await sendEmailVerification(credential.user);
        toast("Аккаунт создан. Письмо для подтверждения отправлено.", 5000);
      } else {
        await signInWithEmailAndPassword(auth, form.get("email"), form.get("password"));
      }
    } catch (err) {
      renderAuth(register ? "register" : "login", friendlyError(err));
    } finally { button.disabled = false; }
  };
  document.querySelector("#reset-password")?.addEventListener("click", async () => {
    const email = document.querySelector("#auth-email").value.trim();
    if (!email) return toast("Сначала укажите e-mail.");
    try { await sendPasswordResetEmail(auth, email); toast("Письмо для восстановления отправлено."); }
    catch (err) { toast(friendlyError(err)); }
  });
}

function renderShell() {
  const admin = state.profile?.role === "admin";
  app.innerHTML = `<main class="desktop">
    <header class="menu-bar">
      <div class="menu-brand"><span class="apple">◆</span><strong>Lost &amp; Found 92</strong></div>
      <nav class="menu-items" aria-label="Основная навигация">
        <button data-view="catalog">Каталог</button><button data-view="saved">Сохранённое</button><button data-view="profile">Кабинет</button>${admin ? `<button data-view="admin">Админ</button>` : ""}
      </nav>
      <div class="menu-user"><span>${escapeHTML(state.profile?.displayName || state.user.email)}</span><button id="logout">Выход</button></div>
    </header>
    <div class="workspace"><div id="view"></div></div>
  </main>`;
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => navigate(button.dataset.view));
  document.querySelector("#logout").onclick = () => signOut(auth);
  navigate(state.view);
}

function navigate(view) {
  cleanup();
  if (view === "admin" && state.profile?.role !== "admin") view = "catalog";
  state.view = view;
  document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-current", button.dataset.view === view ? "page" : "false"));
  ({ catalog: renderCatalog, saved: renderSaved, profile: renderProfile, admin: renderAdmin }[view] || renderCatalog)();
}

function filterPanel() {
  return `<aside class="sidebar">
    <form class="panel" id="filters"><h3 class="panel-title">Поиск в каталоге</h3>
      <div class="field"><label for="search">Слово</label><input id="search" name="search" value="${escapeHTML(state.filters.search)}" placeholder="например: ключи"></div>
      <div class="field"><label for="category">Категория</label><select id="category" name="category"><option value="">Все категории</option>${CATEGORIES.map(c => `<option ${state.filters.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label for="type">Тип</label><select id="type" name="type"><option value="">Потеряно и найдено</option><option value="lost" ${state.filters.type === "lost" ? "selected" : ""}>Потеряно</option><option value="found" ${state.filters.type === "found" ? "selected" : ""}>Найдено</option></select></div>
      <div class="field"><label for="sort">Сортировка</label><select id="sort" name="sort"><option value="new">Сначала новые</option><option value="old" ${state.filters.sort === "old" ? "selected" : ""}>Сначала старые</option></select></div>
      <button class="button primary full">Найти</button>
    </form>
    <div class="panel"><h3 class="panel-title">Новое объявление</h3><p style="font-size:14px">Сообщите о потерянной или найденной вещи.</p><button id="new-item" class="button full">Создать…</button></div>
  </aside>`;
}

function itemCard(item) {
  return `<article class="item-card">
    <div class="pixel-icon" aria-hidden="true">${categoryIcon(item.category)}</div>
    <div><div class="meta"><span class="tag type-${item.type}">${typeLabel(item.type)}</span><span class="tag">${escapeHTML(item.category)}</span></div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description)}</p><div class="meta"><span>⌖ ${escapeHTML(item.location)}</span><span>◷ ${formatDate(item.eventDate)}</span></div></div>
    <button class="button" data-open-item="${item.id}">Подробнее</button>
  </article>`;
}

function renderCatalog() {
  const view = document.querySelector("#view");
  view.innerHTML = windowFrame("Каталог объявлений", `<div class="catalog-layout">${filterPanel()}<section>
    <div class="catalog-head"><div><h2>Бюро находок</h2><div id="result-count" class="result-count">Подключение к Firestore…</div></div><span class="live-badge">LIVE</span></div>
    <div id="items" class="items-grid"><div class="empty"><strong>Загрузка…</strong>Получаем актуальные объявления</div></div><div class="load-more"><button id="load-more" class="button">Показать ещё</button></div>
  </section></div><div class="status-bar"><span>Firebase Firestore</span><span>Синхронизация в реальном времени</span></div>`);

  const subscribe = () => {
    state.unsubscribers.forEach(fn => fn()); state.unsubscribers = [];
    const unsub = listenItems(state.filters, state.pageSize, items => {
      const list = document.querySelector("#items");
      if (!list) return;
      list.innerHTML = items.length ? items.map(itemCard).join("") : `<div class="empty" style="grid-column:1/-1"><strong>Ничего не найдено</strong>Попробуйте изменить параметры поиска.</div>`;
      document.querySelector("#result-count").textContent = `Показано: ${items.length}`;
      document.querySelector("#load-more").classList.toggle("hidden", items.length < state.pageSize);
      list.querySelectorAll("[data-open-item]").forEach(button => button.onclick = () => openItem(button.dataset.openItem));
    }, err => {
      document.querySelector("#items").innerHTML = `<div class="error-box" style="grid-column:1/-1">${escapeHTML(friendlyError(err))}</div>`;
    });
    state.unsubscribers.push(unsub);
  };
  subscribe();
  document.querySelector("#filters").onsubmit = event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    state.filters = { ...state.filters, search: form.get("search").trim(), category: form.get("category"), type: form.get("type"), sort: form.get("sort") };
    state.pageSize = 12; subscribe();
  };
  document.querySelector("#new-item").onclick = () => openItemEditor();
  document.querySelector("#load-more").onclick = () => { state.pageSize += 12; subscribe(); };
}

async function openItem(itemId) {
  try {
    const item = await getItem(itemId);
    if (!item) return toast("Объявление больше недоступно.");
    const overlay = document.createElement("div"); overlay.className = "overlay";
    overlay.innerHTML = windowFrame(item.title, `<div class="detail-kicker"><span class="tag type-${item.type}">${typeLabel(item.type)}</span> · ${escapeHTML(item.category)} · ${statusLabel(item.status)}</div>
      <div class="detail-grid"><div><h2 class="detail-title">${escapeHTML(item.title)}</h2><p class="detail-description">${escapeHTML(item.description)}</p><div class="button-row"><button id="claim" class="button primary">Это моя вещь</button><button id="save" class="button">Сохранить</button>${item.ownerId === state.user.uid || state.profile.role === "admin" ? `<button id="edit-item" class="button">Редактировать</button>` : ""}</div></div>
      <div class="facts"><div class="fact"><strong>Где</strong><span>${escapeHTML(item.location)}</span></div><div class="fact"><strong>Когда</strong><span>${formatDate(item.eventDate)}</span></div><div class="fact"><strong>Автор</strong><span>${escapeHTML(item.ownerName)}</span></div><div class="fact"><strong>Статус</strong><span>${statusLabel(item.status)}</span></div></div></div>
      <section class="comments"><h3>Комментарии</h3><form id="comment-form" class="button-row"><input name="text" maxlength="500" placeholder="Написать комментарий…" required style="flex:1;min-width:180px"><button class="button">Отправить</button></form><div id="comments"><p>Загрузка…</p></div></section>`, "dialog");
    document.body.append(overlay);
    const close = () => { commentUnsub?.(); overlay.remove(); };
    overlay.querySelector(".close-box").onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    overlay.querySelector("#claim").onclick = async () => { try { await createAction(item, state.user); toast("Отклик отправлен владельцу."); } catch (err) { toast(friendlyError(err)); } };
    overlay.querySelector("#save").onclick = async () => { try { await toggleSaved(item, state.user); toast("Добавлено в сохранённое."); } catch (err) { toast(friendlyError(err)); } };
    overlay.querySelector("#edit-item")?.addEventListener("click", () => { close(); openItemEditor(item); });
    overlay.querySelector("#comment-form").onsubmit = async event => {
      event.preventDefault(); const text = new FormData(event.currentTarget).get("text");
      try { await addComment(item.id, text, state.user, state.profile); event.currentTarget.reset(); }
      catch (err) { toast(friendlyError(err)); }
    };
    const commentUnsub = listenComments(item.id, comments => {
      const node = overlay.querySelector("#comments");
      node.innerHTML = comments.length ? comments.map(comment => `<article class="comment"><div class="comment-head"><span>${escapeHTML(comment.authorName)}</span><span>${formatDate(comment.createdAt)}</span></div><p>${escapeHTML(comment.text)}</p>${comment.authorId === state.user.uid || state.profile.role === "admin" ? `<button class="auth-switch" data-delete-comment="${comment.id}">Удалить</button>` : ""}</article>`).join("") : `<p>Комментариев пока нет.</p>`;
      node.querySelectorAll("[data-delete-comment]").forEach(button => button.onclick = async () => { try { await removeComment(button.dataset.deleteComment); } catch (err) { toast(friendlyError(err)); } });
    }, err => toast(friendlyError(err)));
  } catch (err) { toast(friendlyError(err)); }
}

function openItemEditor(item = null) {
  const overlay = document.createElement("div"); overlay.className = "overlay";
  const date = item?.eventDate?.toDate?.().toISOString().slice(0,10) || new Date().toISOString().slice(0,10);
  overlay.innerHTML = windowFrame(item ? "Редактировать объявление" : "Новое объявление", `<form id="item-form">
    <div class="field"><label>Что произошло?</label><select name="type"><option value="lost" ${item?.type === "lost" ? "selected" : ""}>Я потерял(а)</option><option value="found" ${item?.type === "found" ? "selected" : ""}>Я нашёл/нашла</option></select></div>
    <div class="field"><label>Название</label><input name="title" maxlength="100" value="${escapeHTML(item?.title || "")}" required></div>
    <div class="field"><label>Категория</label><select name="category">${CATEGORIES.map(c => `<option ${item?.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    <div class="field"><label>Описание</label><textarea name="description" maxlength="1200" required>${escapeHTML(item?.description || "")}</textarea></div>
    <div class="detail-grid"><div class="field"><label>Место</label><input name="location" maxlength="120" value="${escapeHTML(item?.location || "")}" required></div><div class="field"><label>Дата</label><input name="eventDate" type="date" value="${date}" required></div></div>
    <div class="button-row"><button class="button primary">${item ? "Сохранить" : "Опубликовать"}</button><button type="button" id="cancel" class="button">Отмена</button>${item ? `<button type="button" id="delete-item" class="button danger">Удалить</button>` : ""}</div>
  </form>`, "dialog");
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".close-box").onclick = close; overlay.querySelector("#cancel").onclick = close;
  overlay.querySelector("#item-form").onsubmit = async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await saveItem(values, state.user, item?.id); close(); toast(item ? "Объявление обновлено." : "Объявление опубликовано."); }
    catch (err) { toast(friendlyError(err)); }
  };
  overlay.querySelector("#delete-item")?.addEventListener("click", async () => {
    if (!confirm("Удалить объявление без возможности восстановления?")) return;
    try { await removeItem(item.id); close(); toast("Объявление удалено."); }
    catch (err) { toast(friendlyError(err)); }
  });
}

function renderSaved() {
  const view = document.querySelector("#view");
  view.innerHTML = windowFrame("Сохранённые объявления", `<div class="section-head"><div><h2>Сохранённое</h2><div class="result-count">Ваш временный список интересующих вещей</div></div><button class="button" data-view="catalog">В каталог</button></div><div id="saved-list"><p>Загрузка…</p></div>`);
  view.querySelector("[data-view]").onclick = () => navigate("catalog");
  state.unsubscribers.push(listenSaved(state.user.uid, rows => {
    const node = document.querySelector("#saved-list");
    node.innerHTML = rows.length ? `<table class="list-table"><thead><tr><th>Объявление</th><th>Тип</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHTML(row.itemTitle)}</td><td>${typeLabel(row.itemType)}</td><td>${statusLabel(row.status)}</td><td><div class="button-row"><button class="button" data-open-item="${row.itemId}">Открыть</button><button class="button danger" data-unsave="${row.itemId}" data-title="${escapeHTML(row.itemTitle)}" data-type="${row.itemType}">Убрать</button></div></td></tr>`).join("")}</tbody></table>` : `<div class="empty"><strong>Список пуст</strong>Сохраняйте объявления из каталога, чтобы не потерять их.</div>`;
    node.querySelectorAll("[data-open-item]").forEach(b => b.onclick = () => openItem(b.dataset.openItem));
    node.querySelectorAll("[data-unsave]").forEach(b => b.onclick = async () => { try { await toggleSaved({ id:b.dataset.unsave, title:b.dataset.title, type:b.dataset.type }, state.user, false); } catch (err) { toast(friendlyError(err)); } });
  }, err => toast(friendlyError(err))));
}

function renderProfile() {
  const view = document.querySelector("#view");
  view.innerHTML = windowFrame("Личный кабинет", `<div class="section-head"><div><h2>${escapeHTML(state.profile.displayName)}</h2><div class="result-count">${escapeHTML(state.user.email)}</div></div><span class="tag">${state.profile.role === "admin" ? "ADMIN" : "USER"}</span></div>
    <div class="detail-grid"><form id="profile-form" class="panel"><h3 class="panel-title">Профиль</h3><div class="field"><label>Имя</label><input name="displayName" maxlength="60" value="${escapeHTML(state.profile.displayName)}" required></div><div class="field"><label>Телефон</label><input name="phone" maxlength="30" value="${escapeHTML(state.profile.phone || "")}" placeholder="необязательно"></div><button class="button primary">Сохранить</button></form><div class="panel"><h3 class="panel-title">Состояние аккаунта</h3><p>Почта: ${state.user.emailVerified ? "подтверждена" : "не подтверждена"}</p>${!state.user.emailVerified ? `<button id="verify-email" class="button">Отправить письмо</button>` : ""}<p style="font-size:13px">Сессия сохраняется Firebase Authentication.</p></div></div>
    <h3 style="margin-top:22px">Мои публикации</h3><div id="my-items"><p>Загрузка…</p></div><h3 style="margin-top:22px">История откликов</h3><div id="my-actions"><p>Загрузка…</p></div>`);
  document.querySelector("#profile-form").onsubmit = async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await updateProfile(state.user.uid, values); await updateAuthProfile(state.user, { displayName: values.displayName }); state.profile.displayName = values.displayName; state.profile.phone = values.phone; toast("Профиль сохранён."); renderShell(); }
    catch (err) { toast(friendlyError(err)); }
  };
  document.querySelector("#verify-email")?.addEventListener("click", async () => { try { await sendEmailVerification(state.user); toast("Письмо отправлено."); } catch (err) { toast(friendlyError(err)); } });
  state.unsubscribers.push(listenMyItems(state.user.uid, rows => {
    const node = document.querySelector("#my-items"); if (!node) return;
    node.innerHTML = rows.length ? `<table class="list-table"><thead><tr><th>Название</th><th>Дата</th><th>Статус</th><th></th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHTML(row.title)}</td><td>${formatDate(row.createdAt)}</td><td>${statusLabel(row.status)}</td><td><button class="button" data-edit="${row.id}">Изменить</button></td></tr>`).join("")}</tbody></table>` : `<div class="empty"><strong>Публикаций нет</strong>Создайте первое объявление в каталоге.</div>`;
    node.querySelectorAll("[data-edit]").forEach(button => button.onclick = async () => openItemEditor(await getItem(button.dataset.edit)));
  }, err => toast(friendlyError(err))));
  state.unsubscribers.push(listenUserActions(state.user.uid, rows => {
    const node = document.querySelector("#my-actions"); if (!node) return;
    node.innerHTML = rows.length ? `<table class="list-table"><thead><tr><th>Объявление</th><th>Действие</th><th>Статус</th><th>Дата</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHTML(row.itemTitle)}</td><td>Отклик на находку</td><td>${statusLabel(row.status)}</td><td>${formatDate(row.createdAt)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty"><strong>История пуста</strong>Ваши отклики появятся здесь.</div>`;
  }, err => toast(friendlyError(err))));
}

function renderAdmin() {
  const view = document.querySelector("#view");
  const data = { items:[], actions:[], users:[] };
  view.innerHTML = windowFrame("Панель администратора", `<div class="section-head"><div><h2>Control Panel</h2><div class="result-count">Модерация сервиса Lost &amp; Found</div></div><button id="seed-demo" class="button">Добавить демо-данные</button></div><div id="admin-content"><p>Загрузка статистики…</p></div>`);
  const draw = () => {
    const node = document.querySelector("#admin-content"); if (!node) return;
    const active = data.items.filter(i => i.status === "active").length;
    node.innerHTML = `<div class="stats"><div class="stat"><strong>${data.items.length}</strong>объявлений</div><div class="stat"><strong>${active}</strong>активных</div><div class="stat"><strong>${data.actions.length}</strong>откликов</div><div class="stat"><strong>${data.users.length}</strong>пользователей</div></div>
      <h3>Отклики пользователей</h3>${data.actions.length ? `<table class="list-table"><thead><tr><th>Объявление</th><th>Пользователь</th><th>Статус</th><th>Изменить</th></tr></thead><tbody>${data.actions.map(row => `<tr><td>${escapeHTML(row.itemTitle)}</td><td>${escapeHTML(row.userId.slice(0,10))}…</td><td>${statusLabel(row.status)}</td><td><select data-action-status="${row.id}"><option value="pending" ${row.status === "pending" ? "selected":""}>Ожидает</option><option value="approved" ${row.status === "approved" ? "selected":""}>Подтверждено</option><option value="rejected" ${row.status === "rejected" ? "selected":""}>Отклонено</option><option value="completed" ${row.status === "completed" ? "selected":""}>Завершено</option></select></td></tr>`).join("")}</tbody></table>` : `<div class="empty">Откликов пока нет.</div>`}
      <h3>Объявления</h3>${data.items.length ? `<table class="list-table"><thead><tr><th>Название</th><th>Автор</th><th>Статус</th><th></th></tr></thead><tbody>${data.items.map(row => `<tr><td>${escapeHTML(row.title)}</td><td>${escapeHTML(row.ownerName)}</td><td>${statusLabel(row.status)}</td><td><div class="button-row"><button class="button" data-admin-edit="${row.id}">Изменить</button><button class="button danger" data-admin-delete="${row.id}">Удалить</button></div></td></tr>`).join("")}</tbody></table>` : `<div class="empty">Объявлений нет.</div>`}
      <h3>Пользователи</h3>${data.users.length ? `<table class="list-table"><thead><tr><th>Имя</th><th>E-mail</th><th>Роль</th></tr></thead><tbody>${data.users.map(row => `<tr><td>${escapeHTML(row.displayName)}</td><td>${escapeHTML(row.email)}</td><td><select data-user-role="${row.id}" ${row.email === ADMIN_EMAIL ? "disabled" : ""}><option value="user" ${row.role === "user" ? "selected":""}>user</option><option value="admin" ${row.role === "admin" ? "selected":""}>admin</option></select></td></tr>`).join("")}</tbody></table>` : `<div class="empty">Пользователей нет.</div>`}`;
    node.querySelectorAll("[data-action-status]").forEach(select => select.onchange = async () => { try { await updateActionStatus(select.dataset.actionStatus, select.value); toast("Статус обновлён."); } catch (err) { toast(friendlyError(err)); } });
    node.querySelectorAll("[data-user-role]").forEach(select => select.onchange = async () => { try { await updateUserRole(select.dataset.userRole, select.value); toast("Роль обновлена."); } catch (err) { toast(friendlyError(err)); } });
    node.querySelectorAll("[data-admin-edit]").forEach(button => button.onclick = async () => openItemEditor(await getItem(button.dataset.adminEdit)));
    node.querySelectorAll("[data-admin-delete]").forEach(button => button.onclick = async () => { if (confirm("Удалить объявление?")) { try { await removeItem(button.dataset.adminDelete); } catch (err) { toast(friendlyError(err)); } } });
  };
  state.unsubscribers.push(listenAdminCollection("items", rows => { data.items = rows; draw(); }, err => toast(friendlyError(err))));
  state.unsubscribers.push(listenAdminCollection("actions", rows => { data.actions = rows; draw(); }, err => toast(friendlyError(err))));
  state.unsubscribers.push(listenUsers(rows => { data.users = rows; draw(); }, err => toast(friendlyError(err))));
  document.querySelector("#seed-demo").onclick = async () => { try { const created = await seedDemo(state.user); toast(created ? "Демо-объявления добавлены." : "В каталоге уже есть данные."); } catch (err) { toast(friendlyError(err)); } };
}

onAuthStateChanged(auth, async user => {
  cleanup(); state.user = user;
  if (!user) { state.profile = null; renderAuth(); return; }
  try { state.profile = await ensureProfile(user); renderShell(); }
  catch (err) { renderAuth("login", friendlyError(err)); }
});
