import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where
} from "firebase/firestore";
import { db } from "./firebase.js";

export const CATEGORIES = ["Документы", "Электроника", "Ключи", "Сумки", "Одежда", "Питомцы", "Другое"];
export const ADMIN_EMAIL = "novvika1986@gmail.com";

const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
export const tokensFor = (text) => [...new Set(clean(text, 2000).toLowerCase().match(/[а-яёa-z0-9]{2,}/gi) || [])].slice(0, 20);
export const dateValue = (value) => Timestamp.fromDate(new Date(`${value}T12:00:00`));

export async function ensureProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const current = snap.data();
    if (user.email === ADMIN_EMAIL && user.emailVerified && current.role !== "admin") {
      await updateDoc(ref, { role: "admin", updatedAt: serverTimestamp() });
      return { id: snap.id, ...current, role: "admin" };
    }
    return { id: snap.id, ...current };
  }
  const role = user.email === ADMIN_EMAIL && user.emailVerified ? "admin" : "user";
  const profile = {
    displayName: clean(user.displayName || user.email?.split("@")[0] || "Пользователь", 60),
    email: clean(user.email, 120), phone: "", role,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  await setDoc(ref, profile);
  return { id: user.uid, ...profile };
}

export async function updateProfile(uid, values) {
  await updateDoc(doc(db, "users", uid), {
    displayName: clean(values.displayName, 60), phone: clean(values.phone, 30), updatedAt: serverTimestamp()
  });
}

export function listenItems(filters, pageSize, onData, onError) {
  const clauses = [];
  if (filters.search) clauses.push(where("searchTokens", "array-contains", clean(filters.search, 40).toLowerCase()));
  if (filters.category) clauses.push(where("category", "==", filters.category));
  if (filters.type) clauses.push(where("type", "==", filters.type));
  if (filters.status !== "all") clauses.push(where("status", "==", filters.status || "active"));
  clauses.push(orderBy("createdAt", filters.sort === "old" ? "asc" : "desc"), limit(pageSize));
  return onSnapshot(query(collection(db, "items"), ...clauses), snap => {
    onData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onError);
}

export async function getItem(itemId) {
  const snap = await getDoc(doc(db, "items", itemId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveItem(values, user, itemId = null) {
  const payload = {
    title: clean(values.title, 100), titleLower: clean(values.title, 100).toLowerCase(),
    description: clean(values.description, 1200), category: values.category,
    type: values.type, location: clean(values.location, 120), eventDate: dateValue(values.eventDate),
    status: values.status || "active", ownerId: user.uid,
    ownerName: clean(user.displayName || user.email?.split("@")[0], 60),
    searchTokens: tokensFor(`${values.title} ${values.description} ${values.location}`),
    updatedAt: serverTimestamp()
  };
  if (itemId) return updateDoc(doc(db, "items", itemId), payload);
  return addDoc(collection(db, "items"), { ...payload, createdAt: serverTimestamp() });
}

export const removeItem = itemId => deleteDoc(doc(db, "items", itemId));

export function listenComments(itemId, onData, onError) {
  return onSnapshot(query(collection(db, "comments"), where("itemId", "==", itemId), orderBy("createdAt", "asc"), limit(50)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export async function addComment(itemId, text, user, profile) {
  return addDoc(collection(db, "comments"), {
    itemId, authorId: user.uid, authorName: clean(profile.displayName, 60),
    text: clean(text, 500), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

export async function removeComment(id) { return deleteDoc(doc(db, "comments", id)); }

export async function createAction(item, user) {
  const id = `${user.uid}_${item.id}`;
  await setDoc(doc(db, "actions", id), {
    userId: user.uid, itemId: item.id, itemTitle: clean(item.title, 100),
    itemOwnerId: item.ownerId, type: "claim", status: "pending",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

export async function toggleSaved(item, user, active = true) {
  const ref = doc(db, "saved", `${user.uid}_${item.id}`);
  if (!active) return deleteDoc(ref);
  return setDoc(ref, {
    userId: user.uid, itemId: item.id, itemTitle: clean(item.title, 100),
    itemType: item.type, status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

export function listenUserActions(uid, onData, onError) {
  return onSnapshot(query(collection(db, "actions"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(50)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export function listenSaved(uid, onData, onError) {
  return onSnapshot(query(collection(db, "saved"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(50)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export function listenMyItems(uid, onData, onError) {
  return onSnapshot(query(collection(db, "items"), where("ownerId", "==", uid), orderBy("createdAt", "desc"), limit(50)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export function listenAdminCollection(name, onData, onError) {
  return onSnapshot(query(collection(db, name), orderBy("createdAt", "desc"), limit(100)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export function listenUsers(onData, onError) {
  return onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(100)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export async function updateActionStatus(id, status) {
  return updateDoc(doc(db, "actions", id), { status, updatedAt: serverTimestamp() });
}

export async function updateUserRole(id, role) {
  return updateDoc(doc(db, "users", id), { role, updatedAt: serverTimestamp() });
}

export async function seedDemo(user) {
  const existing = await getDocs(query(collection(db, "items"), limit(1)));
  if (!existing.empty) return false;
  const samples = [
    { type:"lost", category:"Документы", title:"Синий студенческий билет", description:"Потерян возле главного корпуса. Внутри была транспортная карта.", location:"Главный корпус", eventDate:"2026-09-18" },
    { type:"found", category:"Электроника", title:"Кассетный плеер Sony", description:"Найден на скамейке у остановки. Есть заметная царапина на крышке.", location:"Остановка Университет", eventDate:"2026-09-20" },
    { type:"found", category:"Ключи", title:"Связка из трёх ключей", description:"Ключи на чёрном кольце, один ключ с красной меткой.", location:"Библиотека, 2 этаж", eventDate:"2026-09-21" },
    { type:"lost", category:"Сумки", title:"Чёрная сумка с тетрадями", description:"Небольшая сумка через плечо. Внутри конспекты по базам данных.", location:"Аудитория 305", eventDate:"2026-09-22" },
    { type:"found", category:"Одежда", title:"Серый шерстяной шарф", description:"Оставлен на спинке стула после лекции.", location:"Лекционный зал", eventDate:"2026-09-23" },
    { type:"lost", category:"Другое", title:"Плёнка Kodak в коробке", description:"Непроявленная фотоплёнка, очень важны кадры.", location:"Фотолаборатория", eventDate:"2026-09-17" }
  ];
  await Promise.all(samples.map(item => saveItem(item, user)));
  return true;
}

export const formatDate = value => {
  if (!value) return "—";
  const date = value.toDate ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat("ru-RU", { day:"2-digit", month:"2-digit", year:"numeric" }).format(date);
};
