const VAPID_KEY = "BJdCHnXcg5_7bKWSCoi2AA6xSgcunPQAjBFZaHbvtM5DBYRuPyivNzk2-4sbe6aZXRSeoY3olgJnIittQl0Ymik";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function savePushToken(auth, { skipRecent = false } = {}) {
  const user = auth.currentUser;
  const allowed = () => auth.currentUser === user
    && user != null && "Notification" in window
    && Notification.permission === "granted";
  if (!allowed() || !window.isSecureContext || !("serviceWorker" in navigator)) return;

  try {
    const { getMessaging, getToken, isSupported } = await import(
      "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js"
    );
    if (!await isSupported() || !allowed()) return;
    let registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) {
      // 로그인 화면처럼 app.js를 쓰지 않는 화면에서도 같은 워커를 사용합니다.
      registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    }
    if (!allowed()) return;
    const token = await getToken(getMessaging(auth.app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token || !allowed()) return;

    const { getFirestore, doc, getDocFromServer, setDoc, serverTimestamp } = await import(
      "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js"
    );
    const tokenRef = doc(getFirestore(auth.app), "pushTokens", user.uid);
    if (skipRecent) {
      const snapshot = await getDocFromServer(tokenRef);
      const saved = snapshot.data();
      const updatedAt = saved?.updatedAt?.toMillis?.();
      const age = Date.now() - updatedAt;
      if (saved?.token === token && Number.isFinite(updatedAt)
          && age >= 0 && age < THIRTY_DAYS) return;
    }
    if (!allowed()) return;
    await setDoc(tokenRef, { token, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error(error?.name || "Error");
  }
}
