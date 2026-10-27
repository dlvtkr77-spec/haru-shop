// 주문 성공 후에만 호출합니다. 토큰은 발급하지 않습니다.
export function showOrderNotifications(anchor, orderId) {
  document.getElementById("order-notifications")?.remove();
  if (!("Notification" in window) || !window.isSecureContext) return;

  const box = document.createElement("section");
  box.id = "order-notifications";
  box.setAttribute("aria-live", "polite");
  anchor.after(box);
  const dismissalKey = "haru_notification_later:" + orderId;
  let dismissed = false;
  try { dismissed = sessionStorage.getItem(dismissalKey) === "1"; } catch {}

  function render() {
    box.replaceChildren();
    box.removeAttribute("style");
    if (Notification.permission === "granted" || Notification.permission === "denied") {
      const line = document.createElement("p");
      line.textContent = Notification.permission === "granted"
        ? "알림을 받고 있어요"
        : "브라우저 주소창 왼쪽 아이콘 → 알림에서 켤 수 있어요";
      box.append(line);
      return;
    }
    if (dismissed) return;

    box.style.cssText = "margin:16px 0;padding:20px;border:1px solid var(--line);border-radius:12px;background:var(--card)";
    const title = document.createElement("h3");
    title.textContent = "배송이 출발하면 알려 드릴까요?";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "btn";
    accept.textContent = "알림 받기";
    const later = document.createElement("button");
    later.type = "button";
    later.className = "btn ghost";
    later.style.marginLeft = "8px";
    later.textContent = "나중에";
    accept.addEventListener("click", async () => {
      accept.disabled = true;
      try {
        // 사용자 클릭 처리 안에서 즉시 요청해야 합니다.
        const permission = await Notification.requestPermission();
        console.log("알림 권한 결과: " + permission);
        render();
      } catch (error) {
        console.error("알림 권한 요청에 실패했습니다.", error);
        accept.disabled = false;
      }
    });
    later.addEventListener("click", () => {
      dismissed = true;
      try { sessionStorage.setItem(dismissalKey, "1"); } catch {}
      render();
    });
    box.append(title, accept, later);
  }

  render();
}
