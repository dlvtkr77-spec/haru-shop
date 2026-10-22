import { auth, authReady } from "./auth.js";
import {
  getFirestore, doc, setDoc, serverTimestamp
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
    await setDoc(orderRef, {
      userId: user.uid, items, totalPrice, status: "paid",
      createdAt: serverTimestamp(), paymentId
    });

    let cartError;
    try {
      Cart.clear();
      paintChrome();
    } catch (error) {
      cartError = error;
    }
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
    showSuccess();
    if (cartError) result.textContent += "\n" + String(cartError);
  } catch (error) {
    result.textContent = String(error);
  }
}

function showSuccess() {
  result.textContent = "주문이 접수되었습니다";
  const idLine = document.getElementById("order-payment-id");
  idLine.textContent = "paymentId: " + paymentId;
  idLine.hidden = false;
}

receivePayment();
