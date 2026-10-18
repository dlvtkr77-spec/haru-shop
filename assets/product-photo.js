import { auth } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, getDocsFromServer, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const db = getFirestore(auth.app);
const storage = getStorage(auth.app);
const login = document.getElementById("photo-login");
const content = document.getElementById("photo-content");
const form = document.getElementById("photo-form");
const products = document.getElementById("photo-product");
const fileInput = document.getElementById("photo-file");
const button = document.getElementById("photo-submit");
const status = document.getElementById("photo-status");
let generation = 0;
let busy = false;
let uploadTask = null;

onAuthStateChanged(auth, async user => {
  const currentGeneration = ++generation;
  login.hidden = !!user;
  content.hidden = !user;
  status.textContent = "";
  products.replaceChildren();
  products.disabled = true;
  button.disabled = true;
  if (!user) {
    if (uploadTask) uploadTask.cancel();
    return;
  }
  status.textContent = "상품을 불러오고 있습니다.";
  try {
    const snapshot = await getDocsFromServer(collection(db, "products"));
    if (currentGeneration !== generation) return;
    for (const product of snapshot.docs) {
      const option = document.createElement("option");
      option.value = product.id;
      option.textContent = `${product.id} — ${product.data().name ?? ""}`;
      products.append(option);
    }
    products.disabled = busy || snapshot.empty;
    button.disabled = busy || snapshot.empty;
    status.textContent = snapshot.empty ? "상품이 없습니다." : "";
  } catch (error) {
    if (currentGeneration === generation) status.textContent = String(error);
  }
}, error => { status.textContent = String(error); });

form.addEventListener("submit", async event => {
  event.preventDefault();
  const user = auth.currentUser;
  const file = fileInput.files[0];
  if (busy || !user || !products.value || !file) return;
  const currentGeneration = generation;
  const productId = products.value;
  const imagePath = `products/${productId}/main.jpg`;
  busy = true;
  button.disabled = true;
  products.disabled = true;
  fileInput.disabled = true;
  status.textContent = "올리는 중 … 0%";
  try {
    uploadTask = uploadBytesResumable(ref(storage, imagePath), file);
    await new Promise((resolve, reject) => {
      uploadTask.on("state_changed", snapshot => {
        if (currentGeneration !== generation) return;
        const percent = snapshot.totalBytes === 0 ? 100
          : Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100);
        status.textContent = `올리는 중 … ${percent}%`;
      }, reject, resolve);
    });
    if (currentGeneration !== generation || auth.currentUser !== user) return;
    await updateDoc(doc(db, "products", productId), { imagePath });
    if (currentGeneration === generation) status.textContent = "사진을 올리고 저장했습니다.";
  } catch (error) {
    if (currentGeneration === generation) status.textContent = String(error);
  } finally {
    busy = false;
    uploadTask = null;
    button.disabled = !auth.currentUser || !products.options.length;
    products.disabled = button.disabled;
    fileInput.disabled = false;
  }
});
