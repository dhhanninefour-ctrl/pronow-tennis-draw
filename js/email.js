/*
 * email.js — 이메일 인증코드 발송 (EmailJS, 선택)
 * 전역: window.TennisEmail
 *
 * config.js 의 window.TENNIS_CONFIG.EMAILJS = { publicKey, serviceId, templateId } 가 있으면
 * 그 계정으로 실제 메일 발송. 없으면 sent:false 로 반환(호출 측이 화면에 코드 표시 — 테스트용).
 * EmailJS 템플릿 변수: to_email, code, purpose
 */
(function (global) {
  "use strict";

  const SDK = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
  let loading = null;

  function cfg() { return (global.TENNIS_CONFIG && global.TENNIS_CONFIG.EMAILJS) || {}; }
  function configured() {
    const c = cfg();
    return !!(c.publicKey && c.serviceId && c.templateId);
  }

  function ensureSDK() {
    if (global.emailjs) return Promise.resolve(true);
    if (!configured()) return Promise.resolve(false);
    if (loading) return loading;
    loading = new Promise(function (resolve) {
      const s = global.document.createElement("script");
      s.src = SDK;
      s.onload = function () {
        try { global.emailjs.init({ publicKey: cfg().publicKey }); } catch (e) {}
        resolve(!!global.emailjs);
      };
      s.onerror = function () { resolve(false); };
      global.document.head.appendChild(s);
    });
    return loading;
  }

  // 4자리 인증코드
  function gen4() {
    let n;
    if (global.crypto && global.crypto.getRandomValues) {
      const a = new global.Uint32Array(1); global.crypto.getRandomValues(a);
      n = a[0] % 10000;
    } else { n = Math.floor(parseFloat("0." + (Date.now() % 100000)) * 10000); }
    return String(n).padStart(4, "0");
  }

  // 코드 발송 → Promise<{sent:boolean}>
  function sendCode(toEmail, code, purpose) {
    return ensureSDK().then(function (ok) {
      if (!ok || !global.emailjs) return { sent: false };
      const c = cfg();
      return global.emailjs.send(c.serviceId, c.templateId, {
        to_email: toEmail, email: toEmail, code: code, purpose: purpose || "비밀번호 찾기"
      }).then(function () { return { sent: true }; })
        .catch(function (e) { console.warn("email send fail:", e); return { sent: false }; });
    });
  }

  global.TennisEmail = { configured: configured, gen4: gen4, sendCode: sendCode };
})(typeof window !== "undefined" ? window : this);
