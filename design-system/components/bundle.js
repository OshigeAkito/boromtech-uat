/* @ds-bundle: {"format":4,"namespace":"BoromTech","components":[{"name":"TaskCard"},{"name":"StatusPill"},{"name":"Button"},{"name":"StarRating"},{"name":"TierBadge"}]} */
var __BoromTech = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // react-global:react/jsx-runtime
  var require_jsx_runtime = __commonJS({
    "react-global:react/jsx-runtime"(exports) {
      var R = window.React;
      exports.Fragment = R.Fragment;
      exports.jsx = exports.jsxs = function(t, p, k) {
        return R.createElement(t, k === void 0 ? p : Object.assign({}, p, { key: k }));
      };
    }
  });

  // design-system/components/src/index.tsx
  var index_exports = {};
  __export(index_exports, {
    Button: () => Button,
    STATUS: () => STATUS,
    StarRating: () => StarRating,
    StatusPill: () => StatusPill,
    TaskCard: () => TaskCard,
    TierBadge: () => TierBadge,
    dueText: () => dueText
  });
  var import_jsx_runtime = __toESM(require_jsx_runtime());
  var STATUS = {
    open: { label: "Open", tone: "brand" },
    assigned: { label: "In progress", tone: "neutral" },
    changes: { label: "Changes requested", tone: "danger" },
    submitted: { label: "Awaiting review", tone: "warning" },
    approved: { label: "Approved, unpaid", tone: "success-ring" },
    paid: { label: "Paid", tone: "success" }
  };
  var TIER_BARS = { Gold: 3, Silver: 2, Bronze: 1, Rookie: 0, Unranked: 0 };
  var cx = (...names) => names.filter(Boolean).join(" ");
  function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type, ...rest, className: cx("bt-btn", `bt-btn-${variant}`, `bt-btn-${size}`, className) });
  }
  function StatusPill({ status, children }) {
    const s = STATUS[status];
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: cx("bt-pill", `bt-tone-${s.tone}`), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "bt-pill-dot", "aria-hidden": true }),
      children != null ? children : s.label
    ] });
  }
  function StarRating({ value, max = 5, onChange, size = "md" }) {
    const stars = Array.from({ length: max }, (_, i) => i + 1);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "span",
      {
        className: cx("bt-stars", size === "sm" && "bt-stars-sm"),
        role: onChange ? "group" : "img",
        "aria-label": onChange ? "Grade" : `Grade ${value} of ${max}`,
        children: stars.map(
          (n) => onChange ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: cx("bt-star", n <= value && "bt-star-on"),
              "aria-label": `${n} of ${max}`,
              "aria-pressed": n === value,
              onClick: () => onChange(n),
              children: "\u2605"
            },
            n
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cx("bt-star", n <= value && "bt-star-on"), "aria-hidden": true, children: "\u2605" }, n)
        )
      }
    );
  }
  function TierBadge({ tier, score }) {
    const bars = TIER_BARS[tier];
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: cx("bt-tier", tier === "Unranked" && "bt-tier-muted"), title: score == null ? tier : `${tier}, score ${score}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "bt-tier-bars", "aria-hidden": true, children: [0, 1, 2].map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cx("bt-tier-bar", i < bars && "bt-tier-bar-on") }, i)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: tier }),
      score != null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "bt-tier-score", children: score })
    ] });
  }
  var DAY = 864e5;
  function dueText(due, now) {
    const date = /* @__PURE__ */ new Date(`${due}T00:00:00`);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const days = Math.round((date.getTime() - today.getTime()) / DAY);
    const label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const plural = (n) => `${n} ${n === 1 ? "day" : "days"}`;
    const dateOnly = `Due ${label}`;
    if (days < 0) return { text: `${dateOnly} \xB7 ${plural(-days)} overdue`, date: dateOnly, late: true, soon: false };
    if (days === 0) return { text: "Due today", date: dateOnly, late: false, soon: true };
    return { text: `${dateOnly} \xB7 ${plural(days)} left`, date: dateOnly, late: false, soon: days <= 2 };
  }
  var initials = (name) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  function TaskCard({
    title,
    project,
    description,
    payout,
    currency = "\u0E3F",
    due,
    status,
    assignee,
    submission,
    review,
    compact,
    now = Date.now(),
    children
  }) {
    const deadline = due ? dueText(due, now) : null;
    const live = status === "open" || status === "assigned" || status === "changes";
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: cx("bt-task", compact && "bt-task-compact"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "bt-task-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusPill, { status }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "bt-task-payout", children: [
          currency,
          payout.toLocaleString("en-US")
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bt-task-titles", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "bt-task-title", children: title }),
        project && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "bt-task-project", children: project })
      ] }),
      description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "bt-task-desc", children: description }),
      (deadline || assignee) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bt-task-meta", children: [
        deadline && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cx("bt-task-due", live && deadline.late && "bt-late", live && deadline.soon && "bt-soon"), children: live ? deadline.text : deadline.date }),
        assignee && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "bt-task-who", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "bt-avatar", "aria-hidden": true, children: initials(assignee) }),
          assignee
        ] })
      ] }),
      submission && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { className: "bt-task-link", href: submission, target: "_blank", rel: "noreferrer", children: submission.replace(/^https?:\/\//, "") }),
      review && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cx("bt-task-review", !review.grade && "bt-task-review-changes"), children: [
        review.grade ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarRating, { value: review.grade, size: "sm" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Changes requested" }),
        review.feedback && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: review.feedback })
      ] }),
      children && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", { className: "bt-task-actions", children })
    ] });
  }
  return __toCommonJS(index_exports);
})();
window.BoromTech = Object.assign(window.BoromTech || {}, __BoromTech);
