import {
  collection, doc, getDocFromServer, getDocsFromServer, query, where,
  orderBy, limit, startAfter, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export function setupOrders(db) {
  const el = id => document.getElementById(id);
  const tabs = el("admin-tabs");
  const products = el("products-admin");
  const panel = el("orders-admin");
  const filter = el("orders-filter");
  const body = el("orders-body");
  const status = el("orders-status");
  const more = el("orders-more");
  const detail = el("order-detail");
  const dialog = el("order-confirm");
  const transitions = {
    paid: ["포장 시작", "preparing"],
    preparing: ["배송 시작", "shipped"],
    shipped: ["배송 완료", "delivered"]
  };
  let allowed = false;
  let generation = 0;
  let detailGeneration = 0;
  let cursor = null;
  let loading = false;
  let loaded = false;
  let selectedId = null;
  const node = (tag, text) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const time = value => value?.toDate ? value.toDate().toLocaleString("ko-KR") : (value ?? "없음");
  const money = value => typeof value === "number" ? `${value.toLocaleString("ko-KR")}원` : (value ?? "없음");
  function reset() {
    generation++;
    detailGeneration++;
    cursor = null;
    loading = false;
    loaded = false;
    selectedId = null;
    body.replaceChildren();
    detail.replaceChildren();
    status.textContent = "";
    more.hidden = true;
    more.disabled = false;
    if (dialog.open) dialog.close("cancel");
  }
  async function load() {
    if (!allowed || loading) return;
    const request = generation;
    loading = true;
    more.disabled = true;
    status.textContent = "주문을 불러오고 있습니다.";
    try {
      const constraints = [];
      if (filter.value) constraints.push(where("status", "==", filter.value));
      constraints.push(orderBy("createdAt", "desc"));
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(20));
      const snapshot = await getDocsFromServer(query(collection(db, "orders"), ...constraints));
      if (!allowed || request !== generation) return;
      for (const order of snapshot.docs) {
        const data = order.data();
        const row = node("tr");
        const idCell = node("td");
        const open = node("button", order.id);
        open.type = "button";
        open.addEventListener("click", event => { event.stopPropagation(); void showDetail(order.id); });
        idCell.append(open);
        row.append(idCell, node("td", money(data.totalPrice)), node("td", data.status ?? "없음"), node("td", time(data.createdAt)));
        row.dataset.orderId = order.id;
        row.addEventListener("click", () => { void showDetail(order.id); });
        body.append(row);
      }
      cursor = snapshot.docs.at(-1) ?? cursor;
      loaded = true;
      more.hidden = snapshot.size < 20;
      status.textContent = body.children.length ? "" : "주문이 없습니다.";
    } catch (error) {
      console.error(error);
      if (allowed && request === generation) {
        status.textContent = "주문을 불러오지 못했습니다. 콘솔을 확인해 주세요.";
        more.hidden = false;
      }
    } finally {
      if (request === generation) { loading = false; more.disabled = false; }
    }
  }
  async function showDetail(id) {
    if (!allowed) return;
    selectedId = id;
    const request = ++detailGeneration;
    const session = generation;
    detail.textContent = "주문 상세를 불러오고 있습니다.";
    try {
      const snapshot = await getDocFromServer(doc(db, "orders", id));
      if (!allowed || request !== detailGeneration || session !== generation) return;
      if (!snapshot.exists()) throw new Error(`주문 ${id}를 찾을 수 없습니다.`);
      const data = snapshot.data();
      detail.replaceChildren(node("h3", "주문 상세"));
      const fields = node("dl");
      function field(label, value) { fields.append(node("dt", label), node("dd", value)); }
      field("주문 번호", id);
      const items = node("ul");
      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          items.append(node("li", typeof item === "object" && item !== null
            ? Object.entries(item).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join(" · ")
            : String(item)));
        }
      } else items.append(node("li", data.items == null ? "없음" : JSON.stringify(data.items)));
      fields.append(node("dt", "산 것"));
      const itemField = node("dd"); itemField.append(items); fields.append(itemField);
      field("금액", money(data.totalPrice));
      field("상태", data.status ?? "없음");
      field("받은 시각", time(data.receivedAt));
      field("처리 표시", data.processStatus ?? "없음");
      for (const key of ["processError", "mailStatus", "statusUpdatedAt"]) {
        if (Object.hasOwn(data, key)) field(key, key === "statusUpdatedAt" ? time(data[key]) : String(data[key]));
      }
      detail.append(fields);
      const next = transitions[data.status];
      if (next) {
        const button = node("button", next[0]); button.type = "button";
        button.addEventListener("click", async () => {
          if (!allowed || dialog.open) return;
          button.disabled = true;
          el("order-confirm-message").textContent = `주문 ${id}를 ${next[1]}로 바꿉니다`;
          dialog.returnValue = "cancel";
          const confirmed = new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "change"), { once: true }));
          dialog.showModal();
          try {
            if (!await confirmed || !allowed || session !== generation || request !== detailGeneration) return;
            await updateDoc(doc(db, "orders", id), { status: next[1], statusUpdatedAt: serverTimestamp() });
            if (!allowed || session !== generation) return;
            // Keep visible list rows consistent without changing the pagination cursor.
            const row = [...body.children].find(row => row.dataset.orderId === id);
            if (row) {
              if (filter.value && filter.value !== next[1]) row.remove();
              else row.children[2].textContent = next[1];
            }
            status.textContent = "상태를 바꿨습니다.";
            if (selectedId === id) await showDetail(id);
          } catch (error) {
            console.error(error);
            if (allowed && session === generation) status.textContent = "주문 상태를 바꾸지 못했습니다. 콘솔을 확인해 주세요.";
          } finally { button.disabled = false; }
        });
        detail.append(button);
      }
    } catch (error) {
      console.error(error);
      if (allowed && request === detailGeneration && session === generation) {
        detail.replaceChildren();
        status.textContent = "주문 상세를 불러오지 못했습니다. 콘솔을 확인해 주세요.";
      }
    }
  }
  function selectTab(orders) {
    if (!allowed) return;
    products.hidden = orders;
    panel.hidden = !orders;
    el("products-tab").setAttribute("aria-selected", String(!orders));
    el("orders-tab").setAttribute("aria-selected", String(orders));
    if (orders && !loaded) void load();
  }
  el("products-tab").addEventListener("click", () => selectTab(false));
  el("orders-tab").addEventListener("click", () => selectTab(true));
  filter.addEventListener("change", () => { reset(); void load(); });
  more.addEventListener("click", () => { void load(); });
  return {
    setAllowed(value) {
      allowed = value;
      reset();
      tabs.hidden = !value;
      panel.hidden = true;
      el("products-tab").setAttribute("aria-selected", "true");
      el("orders-tab").setAttribute("aria-selected", "false");
    }
  };
}
