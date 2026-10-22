import { auth, authReady } from "./auth.js";
import {
  getFirestore, doc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const result = document.getElementById("order-result");
const paymentId = params.get("paymentId");

async function receivePayment() {
  if (params.has("code")) {
    result.textContent = params.get("message") ?? "";
    document.getElementById("cart-preserved").hidden = false;
    return;
  }
  if (!paymentId) return;

  try {
    await authReady;
    const user = auth.currentUser;
    if (!user) {
      result.textContent = "로그인이 필요합니다";
      return;
    }

    const items = Cart.read().map(i => {
      const product = findProduct(i.id);
      return {
        productId: i.id, name: product.name,
        price: product.price, quantity: i.qty
      };
    });
    const totalPrice = Cart.total();
    const db = getFirestore(auth.app);
    const orderRef = doc(db, "orders", paymentId);
    const created = await runTransaction(db, async transaction => {
      const existing = await transaction.get(orderRef);
      if (existing.exists()) return false;
      transaction.set(orderRef, {
        userId: user.uid, items, totalPrice, status: "paid",
        createdAt: serverTimestamp(), paymentId
      });
      return true;
    });

    if (created) {
      Cart.clear();
      paintChrome();
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ ecommerce: null });
      window.dataLayer.push({
        event: "purchase",
        ecommerce: {
          transaction_id: paymentId, currency: "KRW", value: totalPrice,
          items: items.map(i => ({
            item_id: i.productId, item_name: i.name,
            price: i.price, quantity: i.quantity
          }))
        }
      });
    }
    result.textContent = "주문이 접수되었습니다";
    const idLine = document.getElementById("order-payment-id");
    idLine.textContent = "paymentId: " + paymentId;
    idLine.hidden = false;
  } catch (error) {
    result.textContent = String(error);
  }
}

receivePayment();
