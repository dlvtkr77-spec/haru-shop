import { auth, authReady, reload, sendVerificationEmail } from "./auth.js";

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
      : error.code;
  } finally {
    busy = false;
    button.disabled = false;
  }
});

refreshVerification().catch(error => { accountStatus.textContent = error.code; });
// 뒤로 가기로 복원된 마이페이지도 서버에서 인증 여부를 다시 확인한다.
window.addEventListener("pageshow", event => {
  if (event.persisted) {
    refreshVerification().catch(error => { accountStatus.textContent = error.code; });
  }
});
