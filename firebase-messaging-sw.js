importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAwz8FywtpJ20DpWW7Sc3OuvyGm7pDmIpo",
  authDomain: "haru-shop-4083f.firebaseapp.com",
  projectId: "haru-shop-4083f",
  storageBucket: "haru-shop-4083f.firebasestorage.app",
  messagingSenderId: "1058982124810",
  appId: "1:1058982124810:web:bc866184877dd494442ef3"
});

// 알림 수신만 준비합니다. 권한 요청과 토큰 발급은 하지 않습니다.
firebase.messaging();
