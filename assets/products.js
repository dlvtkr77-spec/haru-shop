import { auth, authReady } from "./auth.js";
import { showOrderNotifications } from "./order-notifications.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, query, where, orderBy, limit, startAfter, getDocsFromServer,
  doc, getDocFromServer, writeBatch, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const db = getFirestore(auth.app);
const storage = getStorage(auth.app);
const list = document.getElementById("product-list");
const detail = document.getElementById("product-detail");
const status = document.getElementById("product-status");
const counter = document.getElementById("product-read-count");
const loadMore = document.getElementById("load-more-products");
const orderNow = document.getElementById("order-now");
const orderStatus = document.getElementById("order-status");
let detailProductId = null;
let ordering = false;
let lastProduct = null;
let loadingProducts = false;
let readCount = 0;
function countReads(count) {
  readCount += count;
  counter.textContent = `이번 화면에서 읽은 문서 ${readCount}장`;
}
function productFromDocument(snapshot) {
  const local = findProduct(snapshot.id);
  const data = snapshot.data();
  return {
    id: snapshot.id, name: data.name, price: data.price,
    summary: data.summary, stock: data.stock, imagePath: data.imagePath,
    emoji: local?.emoji ?? "", detail: local?.detail ?? []
  };
}
async function loadProducts(append = false) {
  if (loadingProducts) return;
  loadingProducts = true;
  if (loadMore) loadMore.disabled = true;
  status.textContent = "상품을 불러오고 있습니다.";
  try {
    if (list) {
      const snapshot = await getDocsFromServer(query(
        collection(db, "products"),
        where("isVisible", "==", true),
        orderBy("price", "asc"),
        ...(append && lastProduct ? [startAfter(lastProduct)] : []),
        limit(3)
      ));
      countReads(snapshot.size);
      const products = snapshot.docs.map(productFromDocument);
      await Promise.all(products.map(async product => {
        if (!product.imagePath) return;
        try {
          product.imageUrl = await getDownloadURL(ref(storage, product.imagePath));
        } catch (error) {
          console.error(error);
        }
      }));
      paintList(products, append);
      lastProduct = snapshot.docs[snapshot.docs.length - 1] ?? lastProduct;
      if (loadMore) loadMore.hidden = snapshot.size < 3;
      status.textContent = snapshot.empty && !append ? "상품이 없습니다." : "";
    } else if (detail) {
      detailProductId = null;
      if (orderNow) orderNow.hidden = true;
      const id = qs("id");
      if (!id || id.includes("/")) {
        paintDetail(null);
      } else {
        const snapshot = await getDocFromServer(doc(db, "products", id));
        countReads(snapshot.exists() ? 1 : 0);
        const product = snapshot.exists() && snapshot.data().isVisible === true
          ? productFromDocument(snapshot) : null;
        if (product) {
          // 장바구니 이벤트도 현재 상세에서 조회한 이름과 가격을 사용합니다.
          const local = findProduct(id);
          if (local) Object.assign(local, product);
        }
        paintDetail(product);
        if (product && orderNow) {
          detailProductId = product.id;
          orderNow.hidden = false;
        }
      }
      status.textContent = "";
    }
  } catch (error) {
    if (list) {
      console.error(error);
      status.textContent = "목록을 불러오지 못했습니다";
    } else {
      status.textContent = String(error);
    }
  } finally {
    loadingProducts = false;
    if (loadMore) loadMore.disabled = false;
  }
}

if (loadMore) loadMore.addEventListener("click", () => loadProducts(true));

if (orderNow) orderNow.addEventListener("click", async () => {
  if (ordering || !detailProductId) return;
  ordering = true;
  orderNow.disabled = true;
  orderStatus.textContent = "";
  try {
    await authReady;
    const user = auth.currentUser;
    if (!user) {
      orderStatus.textContent = "로그인이 필요합니다";
      return;
    }
    const productRef = doc(db, "products", detailProductId);
    const orderRef = doc(collection(db, "orders"));
    const ordered = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(productRef);
      if (!snapshot.exists()) throw new Error("상품 문서가 없습니다.");
      const product = snapshot.data();
      if (!(product.stock >= 1)) return false;
      transaction.set(orderRef, {
        userId: user.uid,
        items: [{
          productId: snapshot.id, name: product.name, price: product.price, quantity: 1
        }],
        totalPrice: product.price * 1,
        status: "paid",
        createdAt: serverTimestamp()
      });
      transaction.update(productRef, { stock: product.stock - 1 });
      return true;
    });
    orderStatus.textContent = ordered ? "주문했습니다." : "재고가 없습니다";
    if (ordered) showOrderNotifications(orderStatus, orderRef.id);
  } catch (error) {
    orderStatus.textContent = String(error);
  } finally {
    ordering = false;
    orderNow.disabled = false;
  }
});

const upload = document.getElementById("upload-products");
if (upload) {
  const uploadStatus = document.getElementById("upload-status");
  let busy = false;
  onAuthStateChanged(auth, user => {
    upload.hidden = !user;
    upload.disabled = busy || !user;
  }, error => { uploadStatus.textContent = String(error); });
  upload.addEventListener("click", async () => {
    if (busy || !auth.currentUser) return;
    busy = true;
    upload.disabled = true;
    uploadStatus.textContent = "상품 다섯 장을 올리고 있습니다.";
    try {
      const batch = writeBatch(db);
      const stocks = { p2: 30, p3: 8, p4: 0, p5: 5, p6: 40 };
      for (const [id, stock] of Object.entries(stocks)) {
        const p = findProduct(id);
        batch.set(doc(db, "products", id), {
          name: p.name, price: p.price, summary: p.summary,
          stock, isVisible: id !== "p5", createdAt: serverTimestamp()
        });
      }
      await batch.commit();
      uploadStatus.textContent = "p2~p6 상품 다섯 장을 모두 올렸습니다. p1은 변경하지 않았습니다.";
      await loadProducts();
    } catch (error) {
      uploadStatus.textContent = String(error);
    } finally {
      busy = false;
      upload.disabled = !auth.currentUser;
    }
  });
}
loadProducts();
