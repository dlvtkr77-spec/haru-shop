import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAwz8FywtpJ20DpWW7Sc3OuvyGm7pDmIpo",
    authDomain: "haru-shop-4083f.firebaseapp.com",
    projectId: "haru-shop-4083f",
    storageBucket: "haru-shop-4083f.firebasestorage.app",
    messagingSenderId: "1058982124810",
    appId: "1:1058982124810:web:bc866184877dd494442ef3"
  };
export const auth = getAuth(initializeApp(firebaseConfig));
export { createUserWithEmailAndPassword, signInWithEmailAndPassword };

const nav = document.querySelector("header.site nav.site");
const account = document.createElement("span");
account.className = "header-account";
if (nav) nav.append(account);

let loggingOut = false;
export async function logout() {
  loggingOut = true;
  try {
    await signOut(auth);
    location.replace("index.html");
  } catch (error) {
    loggingOut = false;
    throw error;
  }
}

function logoutButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn ghost account-logout";
  button.textContent = "로그아웃";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await logout();
    } catch (error) {
      button.disabled = false;
      const status = document.getElementById("account-status");
      if (status) status.textContent = error.code;
      else account.append(document.createTextNode(error.code));
    }
  });
  return button;
}

function link(text, href) {
  const a = document.createElement("a");
  a.textContent = text;
  a.href = href;
  return a;
}

export function returnAfterLogin() {
  // 돌아갈 곳은 이 사이트의 마이페이지만 허용한다.
  if (new URLSearchParams(location.search).get("next") === "mypage.html") {
    location.replace("mypage.html");
  }
}

const mypage = document.getElementById("mypage-content");
const mypageLogout = document.getElementById("mypage-logout");
if (mypageLogout) mypageLogout.append(logoutButton());

export const authReady = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, user => {
    account.replaceChildren();
    if (user) {
      const email = document.createElement("span");
      email.className = "account-email";
      email.textContent = user.email || "";
      account.append(email, link("마이페이지", "mypage.html"), logoutButton());
    } else {
      account.append(link("로그인", "login.html"));
    }
    if (mypage) {
      mypage.hidden = !user;
      if (!user && !loggingOut) {
        location.replace("login.html?next=mypage.html");
      } else if (user) {
        document.getElementById("mypage-email").textContent = user.email || "";
      }
    }
    resolve(user);
  }, error => {
    const status = document.getElementById("account-status");
    if (status) status.textContent = error.code;
    reject(error);
  });
});
// 인증 오류가 나도 마이페이지의 숨김 상태는 유지한다.
authReady.catch(() => {});
