import { auth } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, getDocsFromServer, query, where, limit, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db = getFirestore(auth.app);
const login = document.getElementById("rules-login");
const content = document.getElementById("rules-content");
const identity = document.getElementById("rules-identity");
const rows = document.getElementById("orders-rows");
const table = document.getElementById("orders-table");
const results = [...content.querySelectorAll("pre")];
let generation = 0;

onAuthStateChanged(auth, user => {
  generation++;
  login.hidden = !!user;
  content.hidden = !user;
  identity.textContent = user ? `이메일: ${user.email ?? ""}\nUID: ${user.uid}` : "";
  results.forEach(result => { result.textContent = ""; });
  rows.replaceChildren();
  table.hidden = true;
  document.getElementById("rules-error").textContent = "";
}, error => {
  generation++;
  content.hidden = true;
  rows.replaceChildren();
  results.forEach(result => { result.textContent = ""; });
  document.getElementById("rules-error").textContent = String(error);
});

function bindAction(buttonId, resultId, action) {
  const button = document.getElementById(buttonId);
  const result = document.getElementById(resultId);
  button.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || button.disabled) return;
    const currentGeneration = generation;
    const isCurrent = () => currentGeneration === generation && auth.currentUser === user;
    button.disabled = true;
    result.textContent = "처리 중입니다.";
    try {
      await action(user, result, isCurrent);
    } catch (error) {
      if (isCurrent()) result.textContent = String(error);
    } finally {
      button.disabled = false;
    }
  });
}

bindAction("read-orders", "read-result", async (user, result, isCurrent) => {
  rows.replaceChildren();
  table.hidden = true;
  const snapshot = await getDocsFromServer(collection(db, "orders"));
  if (!isCurrent()) return;
  let otherUsers = 0;
  for (const order of snapshot.docs) {
    const data = order.data();
    if (data.userId !== user.uid) otherUsers++;
    const row = document.createElement("tr");
    for (const value of [order.id, data.userId, data.totalPrice]) {
      const cell = document.createElement("td");
      cell.textContent = typeof value === "string" ? value : String(JSON.stringify(value));
      row.append(cell);
    }
    rows.append(row);
  }
  result.textContent = `전체 ${snapshot.size}건 · userId가 내 UID와 다른 주문 ${otherUsers}건`;
  table.hidden = false;
});

bindAction("edit-order", "edit-result", async (user, result, isCurrent) => {
  const snapshot = await getDocsFromServer(query(
    collection(db, "orders"), where("userId", "==", user.uid), limit(1)
  ));
  if (!isCurrent()) return;
  if (snapshot.empty) {
    result.textContent = "내 주문이 없습니다. 변경한 문서가 없습니다.";
    return;
  }
  const order = snapshot.docs[0];
  await updateDoc(order.ref, { totalPrice: 1 });
  if (isCurrent()) result.textContent = `문서 ID: ${order.id}\ntotalPrice: 1`;
});

bindAction("edit-product", "product-result", async (user, result, isCurrent) => {
  await updateDoc(doc(db, "products", "p1"), { price: 0 });
  if (isCurrent()) result.textContent = "문서 ID: p1\nprice: 0";
});
