/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest, onCall, HttpsError} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

const portoneApiSecret = defineSecret("PORTONE_API_SECRET");
initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

exports.portoneWebhook = onRequest(
  {secrets: [portoneApiSecret]},
  async (request, response) => {
    try {
      const {type, data} = request.body;
      const paymentId = data.paymentId;
      console.log(type, paymentId);

      const result = await fetch(
        `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
        {
          headers: {Authorization: `PortOne ${portoneApiSecret.value()}`},
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!result.ok) {
        console.log(result.status);
        console.log(await result.text());
        return;
      }

      const payment = await result.json();
      console.log("결제 상태:", payment.status);
      console.log("결제 금액:", payment.amount.total);
      console.log("customData:", JSON.stringify(payment.customData));

      const customData = typeof payment.customData === "string" ?
        JSON.parse(payment.customData) : payment.customData;
      if (!process.env.FIRESTORE_EMULATOR_HOST) {
        throw new Error("Firestore 에뮬레이터 연결 설정이 없습니다.");
      }
      if (!Array.isArray(customData?.items) || customData.items.length === 0) {
        throw new Error("customData.items에 상품이 없습니다.");
      }

      const db = getFirestore();
      let expectedAmount = 0;
      for (const {id, qty} of customData.items) {
        if (typeof id !== "string" || !id || id.includes("/") ||
            !Number.isSafeInteger(qty) || qty <= 0) {
          throw new Error("상품 ID 또는 수량이 올바르지 않습니다.");
        }
        const product = await db.collection("products").doc(id).get();
        const price = product.data()?.price;
        if (!product.exists || !Number.isSafeInteger(price) || price < 0) {
          throw new Error(`상품 가격을 확인할 수 없습니다: ${id}`);
        }
        expectedAmount += price * qty;
        if (!Number.isSafeInteger(expectedAmount)) {
          throw new Error("기준 금액이 올바르지 않습니다.");
        }
      }

      const paidAmount = payment.amount.total;
      const verdict = payment.status === "PAID" && paidAmount === expectedAmount ?
        "검증 통과" : "금액 불일치";
      console.log(`${verdict}: ${paymentId} 기준 금액 ${expectedAmount} 결제 금액 ${paidAmount}`);
      if (verdict === "검증 통과") {
        try {
          await db.collection("orders").doc(paymentId).create({
            paymentId,
            userId: typeof customData.userId === "string" ? customData.userId : "",
            items: customData.items.map(({id, qty}) => ({id, qty})),
            totalPrice: expectedAmount,
            paidAmount,
            status: "paid",
            createdAt: FieldValue.serverTimestamp(),
          });
          console.log(`주문 생성: ${paymentId}`);
        } catch (error) {
          if (error.code === 6 || error.code === "already-exists") {
            console.log(`이미 있는 주문 - 건너뜀: ${paymentId}`);
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error("결제 검증 실패:", error.message);
    } finally {
      response.status(200).send("OK");
    }
  },
);

// 실습 188 - shopPing : 바깥에서 주소로 불러 함수가 깨어 있는지 보는 HTTP 함수
exports.shopPing = onRequest({ region: "us-central1" }, (req, res) => {
  const now = new Date().toISOString();
  res.send("하루상점 함수가 깨어 있습니다 · " + now);
});

exports.calcOrderTotal = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다");
  }
  const {productId, quantity} = request.data ?? {};
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new HttpsError("invalid-argument", "quantity는 1 이상의 정수여야 합니다");
  }
  if (typeof productId !== "string" || !productId || productId.includes("/")) {
    throw new HttpsError("invalid-argument", "productId가 올바르지 않습니다");
  }
  const product = await getFirestore().collection("products").doc(productId).get();
  if (!product.exists) {
    throw new HttpsError("not-found", "상품을 찾을 수 없습니다");
  }
  const price = product.data().price;
  const totalPrice = price * quantity;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0 ||
      !Number.isFinite(totalPrice)) {
    throw new HttpsError("failed-precondition", "상품 가격을 확인할 수 없습니다");
  }
  return {totalPrice};
});
Object.assign(exports, require("./automation"));
Object.assign(exports, require("./admin"));