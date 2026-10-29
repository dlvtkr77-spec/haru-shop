import { doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const CHART_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js";
let chartLibrary;
function loadChart() {
  if (!chartLibrary) {
    chartLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHART_URL;
      script.onload = () => globalThis.Chart ? resolve(globalThis.Chart) : reject(new Error(`차트 도구를 초기화하지 못했습니다: ${CHART_URL}`));
      script.onerror = event => {
        console.error(event);
        script.remove();
        reject(new Error(`차트 도구를 불러오지 못했습니다: ${CHART_URL}`));
      };
      document.head.append(script);
    }).catch(error => { chartLibrary = null; throw error; });
  }
  return chartLibrary;
}

// Convert the Korean calendar day to a UTC calendar anchor before subtracting days.
export function salesDays(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const part = type => Number(parts.find(value => value.type === type).value);
  const today = Date.UTC(part("year"), part("month") - 1, part("day"));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today - (7 - index) * 86400000).toISOString().slice(0, 10);
    return { date, id: date.replaceAll("-", "") };
  });
}

export function setupSales(db) {
  const el = id => document.getElementById(id);
  const panel = el("sales-admin");
  const status = el("sales-status");
  let allowed = false;
  let revision = 0;
  let loading = false;
  let rows = null;
  let dayKey = null;
  let chart = null;
  const node = (tag, text) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const countedAt = value => value?.toDate
    ? value.toDate().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "없음";
  const number = value => typeof value === "number" ? value.toLocaleString("ko-KR") : "없음";

  function drawTable() {
    const latest = [...rows].reverse().find(row => row.data !== null);
    el("sales-summary").textContent = latest
      ? `${latest.date}까지의 매출입니다 - 매일 00:05에 전날을 셉니다`
      : "최근 7일간 집계 없음 - 매일 00:05에 전날을 셉니다";
    el("sales-counted-at").textContent = `마지막으로 센 시각: ${latest ? countedAt(latest.data.countedAt) : "없음"}`;
    const canceled = rows.some(row => row.data && Object.hasOwn(row.data, "canceledCount"));
    const header = node("tr");
    for (const label of ["날짜", "건수", "매출", "센 시각", ...(canceled ? ["취소 건수"] : [])]) {
      header.append(node("th", label));
    }
    el("sales-head").replaceChildren(header);
    el("sales-body").replaceChildren(...rows.map(row => {
      const tr = node("tr");
      tr.append(node("td", row.date));
      if (row.data === null) {
        const missing = node("td", "집계 없음");
        missing.colSpan = canceled ? 4 : 3;
        tr.append(missing);
      } else {
        tr.append(node("td", number(row.data.orderCount)), node("td", `${number(row.data.totalSales)}원`), node("td", countedAt(row.data.countedAt)));
        if (canceled) tr.append(node("td", Object.hasOwn(row.data, "canceledCount") ? number(row.data.canceledCount) : "—"));
      }
      return tr;
    }));
  }

  async function drawChart(expectedRevision) {
    try {
      const Chart = await loadChart();
      if (!allowed || expectedRevision !== revision || panel.hidden || chart) return;
      chart = new Chart(el("sales-chart"), {
        type: "bar",
        data: {
          labels: rows.map(row => row.data === null ? [row.date, "집계 없음"] : row.date),
          datasets: [{ label: "매출(원)", data: rows.map(row => row.data === null ? null : row.data.totalSales), backgroundColor: "#487966" }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { x: { ticks: { autoSkip: false, maxRotation: 0, minRotation: 0 } }, y: { beginAtZero: true } },
          plugins: { legend: { display: false } }
        }
      });
    } catch (error) {
      console.error(error);
      if (allowed && expectedRevision === revision) status.textContent = "매출 차트를 불러오지 못했습니다. 콘솔을 확인해 주세요.";
    }
  }

  async function openSales() {
    if (!allowed) return;
    panel.hidden = false;
    el("products-admin").hidden = true;
    el("orders-admin").hidden = true;
    for (const id of ["products-tab", "orders-tab", "sales-tab"]) {
      el(id).setAttribute("aria-selected", String(id === "sales-tab"));
    }
    const days = salesDays();
    if (dayKey !== days[6].id) {
      revision++;
      loading = false;
      rows = null;
      dayKey = days[6].id;
      chart?.destroy(); chart = null;
      el("sales-summary").textContent = "";
      el("sales-counted-at").textContent = "";
      el("sales-head").replaceChildren();
      el("sales-body").replaceChildren();
    }
    if (rows) { void drawChart(revision); return; }
    if (loading) return;
    const request = revision;
    loading = true;
    status.textContent = "매출을 불러오고 있습니다.";
    try {
      // Exactly one server read per date; never query the orders collection.
      const results = await Promise.allSettled(days.map(day => getDocFromServer(doc(db, "dailyStats", day.id))));
      let failed = false;
      for (const result of results) {
        if (result.status === "rejected") { console.error(result.reason); failed = true; }
      }
      if (!allowed || request !== revision) return;
      if (failed) {
        status.textContent = "매출을 불러오지 못했습니다. 콘솔을 확인해 주세요.";
        return;
      }
      rows = days.map((day, index) => ({ ...day, data: results[index].value.exists() ? results[index].value.data() : null }));
      drawTable();
      status.textContent = "";
      if (!panel.hidden) await drawChart(request);
    } catch (error) {
      console.error(error);
      if (allowed && request === revision) status.textContent = "매출을 불러오지 못했습니다. 콘솔을 확인해 주세요.";
    } finally {
      if (request === revision) loading = false;
    }
  }
  el("sales-tab").addEventListener("click", () => { void openSales(); });
  for (const id of ["products-tab", "orders-tab"]) {
    el(id).addEventListener("click", () => {
      panel.hidden = true;
      el("sales-tab").setAttribute("aria-selected", "false");
    });
  }
  return {
    setAllowed(value) {
      allowed = value;
      revision++;
      loading = false;
      rows = null;
      dayKey = null;
      panel.hidden = true;
      el("sales-tab").setAttribute("aria-selected", "false");
      chart?.destroy(); chart = null;
      for (const id of ["sales-status", "sales-summary", "sales-counted-at"]) el(id).textContent = "";
      el("sales-head").replaceChildren();
      el("sales-body").replaceChildren();
    }
  };
}
