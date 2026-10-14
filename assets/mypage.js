import { auth, authReady, reload, sendVerificationEmail, authErrorMessage } from "./auth.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const ordersList = document.getElementById("my-orders");
const ordersStatus = document.getElementById("orders-status");

function orderDate(value) {
  if (value == null) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function renderOrders(snapshot) {
  console.log(`[주문 알림] 주문 ${snapshot.size}건`);
  const orders = snapshot.docs.map(doc => doc.data());
  orders.sort((a, b) => (orderDate(b.createdAt)?.getTime() ?? 0) - (orderDate(a.createdAt)?.getTime() ?? 0));
  const rows = orders.map(order => {
    const row = document.createElement("li");
    const details = [
      ["주문한 날", orderDate(order.createdAt)?.toLocaleDateString("ko-KR") ?? "날짜 확인 중"],
      ["상품 이름", Array.isArray(order.items) ? order.items.map(item => item.name ?? item.item_name ?? "상품명 없음").join(", ") : (order.productName ?? "상품명 없음")],
      ["합계", typeof order.total === "number" ? `${order.total.toLocaleString("ko-KR")}원` : (order.total ?? "합계 없음")],
      ["status", order.status ?? ""]
    ];
    for (const [label, value] of details) {
      const line = document.createElement("p");
      line.textContent = `${label}: ${value}`;
      row.append(line);
    }
    return row;
  });
  ordersList.replaceChildren(...rows);
  ordersStatus.textContent = orders.length ? "" : "아직 주문이 없습니다.";
}

// 인증의 첫 결과를 기다리는 Promise이므로 인증 갱신이나 pageshow 때 중복 구독하지 않는다.
authReady.then(user => {
  if (!user) return;
  const ordersQuery = query(collection(getFirestore(auth.app), "orders"), where("userId", "==", user.uid));
  const unsubscribe = onSnapshot(ordersQuery, renderOrders, error => {
    console.log(`[주문 알림] 오류: ${error.code ?? "unknown"}`);
    ordersList.replaceChildren();
    ordersStatus.textContent = "주문을 불러오지 못했습니다. 잠시 뒤에 다시 시도해 주세요.";
  });
  window.addEventListener("pagehide", event => {
    if (!event.persisted) unsubscribe();
  });
}).catch(() => {
  ordersStatus.textContent = "로그인 정보를 확인하지 못했습니다.";
});

const verification = document.getElementById("email-verification");
const status = document.getElementById("verification-status");
const button = document.getElementById("resend-verification");
const accountStatus = document.getElementById("account-status");
const sentMessage = "인증 메일을 보냈습니다. 메일함과 스팸함을 확인해 주세요.";
let busy = false;

async function refreshVerification() {
  verification.hidden = true;
  const user = await authReady;
  if (!user || !auth.currentUser) return;
  await reload(auth.currentUser);
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  verification.hidden = currentUser.emailVerified;
  if (!currentUser.emailVerified && new URLSearchParams(location.search).get("verification") === "sent") {
    status.textContent = sentMessage;
  }
}

button.addEventListener("click", async () => {
  if (busy || !auth.currentUser) return;
  busy = true;
  button.disabled = true;
  try {
    await reload(auth.currentUser);
    if (!auth.currentUser) return;
    if (auth.currentUser.emailVerified) {
      verification.hidden = true;
      return;
    }
    await sendVerificationEmail(auth.currentUser);
    status.textContent = sentMessage;
  } catch (error) {
    status.textContent = error.code === "auth/too-many-requests"
      ? "잠시 뒤에 다시 눌러 주세요."
      : authErrorMessage(error);
  } finally {
    busy = false;
    button.disabled = false;
  }
});

refreshVerification().catch(error => { accountStatus.textContent = authErrorMessage(error); });
// 뒤로 가기로 복원된 마이페이지도 서버에서 인증 여부를 다시 확인한다.
window.addEventListener("pageshow", event => {
  if (event.persisted) {
    refreshVerification().catch(error => { accountStatus.textContent = authErrorMessage(error); });
  }
});
