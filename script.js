/* =========================================================
   Disk Scheduling Simulator - LOOK and C-LOOK
   ========================================================= */

const DEFAULTS = {
  head: "53",
  queue: "98, 183, 37, 122, 14, 124, 65, 67",
  direction: "increasing",
  algorithm: "LOOK",
};

const $ = (id) => document.getElementById(id);

/* ---------- Input validation ---------- */

function validate(headText, queueText) {
  const head = headText.trim();
  if (!/^\d+$/.test(head)) {
    return { error: "Initial head position must be a non-negative whole number." };
  }

  const parts = queueText.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) {
    return { error: "Enter at least one request track in the disk request queue." };
  }

  const requests = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) {
      return { error: `"${p}" is not a non-negative whole number.` };
    }
    requests.push(Number(p));
  }

  return { head: Number(head), requests };
}

/* ---------- Scheduling ---------- */

/**
 * Returns the service order for the requested algorithm.
 * wrapIndex is the position in `order` where a C-LOOK wraparound
 * occurs (-1 if none, or for LOOK).
 */
function buildOrder(head, requests, direction, algorithm) {
  const unique = [...new Set(requests)];

  const lower = unique.filter((r) => r < head).sort((a, b) => b - a); // descending
  const upper = unique.filter((r) => r >= head).sort((a, b) => a - b); // ascending

  let order;
  let split; // number of requests serviced before the first direction change / wrap

  if (direction === "increasing") {
    split = upper.length;
    order = algorithm === "LOOK"
      ? [...upper, ...lower]                       // reverse, then descend
      : [...upper, ...lower.slice().reverse()];    // wrap to lowest, continue up
  } else {
    split = lower.length;
    order = algorithm === "LOOK"
      ? [...lower, ...upper]                       // reverse, then ascend
      : [...lower, ...upper.slice().reverse()];    // wrap to highest, continue down
  }

  const wrapIndex =
    algorithm === "C-LOOK" && split > 0 && split < order.length ? split : -1;

  return { order, wrapIndex, duplicates: requests.length - unique.length };
}

/** Builds the full simulation result, including the movement trace. */
function simulate(head, requests, direction, algorithm) {
  const { order, wrapIndex, duplicates } = buildOrder(head, requests, direction, algorithm);

  const steps = [];
  let prev = head;
  let cumulative = 0;

  order.forEach((track, i) => {
    const movement = Math.abs(track - prev);
    cumulative += movement;
    steps.push({
      step: i + 1,
      from: prev,
      to: track,
      movement,
      cumulative,
      action: i === wrapIndex ? "Wraparound" : "Service",
    });
    prev = track;
  });

  const count = order.length;
  return {
    head,
    order,
    steps,
    wrapIndex,
    duplicates,
    count,
    thm: cumulative,
    avg: count > 0 ? cumulative / count : 0,
  };
}

const fmt2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

/* ---------- Rendering helpers ---------- */

function el(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text) node.textContent = text;
  return node;
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

function renderMetrics(result, head) {
  $("m-count").textContent = result.count;
  $("m-thm").textContent = `${result.thm} tracks`;
  $("m-avg").textContent = fmt2(result.avg);
  $("m-start").textContent = head;
}

function renderSequence(result) {
  const box = $("sequence");
  box.replaceChildren();

  box.appendChild(el("span", { class: "chip start" }, `${result.head} (start)`));

  result.order.forEach((track, i) => {
    box.appendChild(el("span", { class: "arrow" }, "→"));
    const cls = i === result.wrapIndex ? "chip wrap" : "chip";
    box.appendChild(el("span", { class: cls }, String(track)));
  });
}

function renderTrace(result) {
  const body = $("trace");
  body.replaceChildren();

  result.steps.forEach((s) => {
    const tr = el("tr");
    tr.appendChild(el("td", { class: "num" }, String(s.step)));
    tr.appendChild(el("td", { class: "num" }, String(s.from)));
    tr.appendChild(el("td", { class: "num" }, String(s.to)));
    tr.appendChild(el("td", { class: "num" }, String(s.movement)));
    tr.appendChild(el("td", { class: "num" }, String(s.cumulative)));

    const actionCell = el("td");
    const isWrap = s.action === "Wraparound";
    actionCell.appendChild(
      el("span", { class: `tag ${isWrap ? "wrap" : "service"}` }, s.action)
    );
    tr.appendChild(actionCell);

    body.appendChild(tr);
  });
}

function renderChart(result, algorithm) {
  const svg = $("chart");
  svg.replaceChildren();

  const W = 700, H = 260;
  const padL = 56, padR = 24, padT = 24, padB = 40;

  // Points: starting head, then each serviced track in order
  const points = [result.head, ...result.order];
  const n = points.length;

  let minT = Math.min(...points);
  let maxT = Math.max(...points);
  minT = Math.max(0, minT - 10);
  maxT = maxT + 10;
  if (maxT === minT) maxT = minT + 1;

  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, n - 1);
  const y = (t) => H - padB - ((t - minT) / (maxT - minT)) * (H - padT - padB);

  // Axes
  svg.appendChild(svgEl("line", {
    x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, stroke: "#9aa5b5",
  }));
  svg.appendChild(svgEl("line", {
    x1: padL, y1: padT, x2: padL, y2: H - padB, stroke: "#9aa5b5",
  }));

  // Y-axis label ticks
  const ticks = 4;
  for (let k = 0; k <= ticks; k++) {
    const t = Math.round(minT + ((maxT - minT) * k) / ticks);
    const yy = y(t);
    svg.appendChild(svgEl("line", {
      x1: padL, y1: yy, x2: W - padR, y2: yy, stroke: "#e3e8f0",
    }));
    const label = svgEl("text", {
      x: padL - 8, y: yy + 4, "text-anchor": "end", "font-size": 11, fill: "#6b7785",
    });
    label.textContent = t;
    svg.appendChild(label);
  }

  // Path segments (wraparound drawn in amber, others in blue)
  for (let i = 0; i < n - 1; i++) {
    const isWrap = result.wrapIndex === i;
    svg.appendChild(svgEl("line", {
      x1: x(i), y1: y(points[i]), x2: x(i + 1), y2: y(points[i + 1]),
      stroke: isWrap ? "#b7791f" : "#2f6fd6",
      "stroke-width": isWrap ? 2.5 : 2,
      "stroke-dasharray": isWrap ? "6 4" : "none",
    }));
  }

  // Points and labels
  points.forEach((t, i) => {
    const isStart = i === 0;
    svg.appendChild(svgEl("circle", {
      cx: x(i), cy: y(t), r: isStart ? 6 : 4.5,
      fill: isStart ? "#14213d" : "#fff",
      stroke: isStart ? "#14213d" : "#2f6fd6",
      "stroke-width": 2,
    }));
    const label = svgEl("text", {
      x: x(i), y: y(t) - 10, "text-anchor": "middle", "font-size": 11,
      "font-weight": 600, fill: "#14213d",
    });
    label.textContent = t;
    svg.appendChild(label);
  });

  // X-axis caption
  const cap = svgEl("text", {
    x: W / 2, y: H - 10, "text-anchor": "middle", "font-size": 11, fill: "#6b7785",
  });
  cap.textContent = `${algorithm} service order (head start → ${n - 1} requests)`;
  svg.appendChild(cap);
}

function renderComparison(head, requests, direction) {
  const look = simulate(head, requests, direction, "LOOK");
  const clook = simulate(head, requests, direction, "C-LOOK");

  const body = $("compare");
  body.replaceChildren();

  const rows = [
    ["Number of requests", look.count, clook.count],
    ["Total head movement", `${look.thm} tracks`, `${clook.thm} tracks`],
    ["Average movement per request", fmt2(look.avg) + " tracks", fmt2(clook.avg) + " tracks"],
    ["Movement pattern",
      "Service in one direction, then reverse",
      "Service in one direction, then wrap and continue"],
  ];

  rows.forEach(([label, a, b]) => {
    const tr = el("tr");
    tr.appendChild(el("td", {}, label));
    tr.appendChild(el("td", { class: "num" }, String(a)));
    tr.appendChild(el("td", { class: "num" }, String(b)));
    body.appendChild(tr);
  });

  const diff = clook.thm - look.thm;
  let message;
  if (diff > 0) {
    message = `For this input, LOOK requires ${diff} fewer tracks of head movement than C-LOOK.`;
  } else if (diff < 0) {
    message = `For this input, C-LOOK requires ${-diff} fewer tracks of head movement than LOOK.`;
  } else {
    message = "For this input, LOOK and C-LOOK produce identical total head movement.";
  }
  $("conclusion").textContent =
    message + " This result applies only to the selected request queue and starting direction.";
}

/* ---------- Main flow ---------- */

function showError(msg) {
  const box = $("error");
  box.textContent = msg;
  box.hidden = false;
}

function hideError() {
  $("error").hidden = true;
}

function run() {
  const check = validate($("head").value, $("queue").value);
  if (check.error) {
    showError(check.error);
    return;
  }
  hideError();

  const direction = $("direction").value;
  const algorithm = $("algorithm").value;
  const result = simulate(check.head, check.requests, direction, algorithm);

  $("status").textContent = "Complete";
  $("subtitle").textContent =
    `${algorithm} · ${direction === "increasing" ? "Increasing" : "Decreasing"} direction`;

  renderMetrics(result, check.head);
  renderSequence(result);
  renderChart(result, algorithm);
  renderTrace(result);
  renderComparison(check.head, check.requests, direction);

  const dupNote = result.duplicates > 0
    ? ` ${result.duplicates} duplicate request(s) were removed before scheduling.`
    : "";
  $("avg-note").textContent =
    "Average movement per request = THM ÷ request count. This is a simplified track-based measure, not a time measurement." +
    dupNote;
}

function reset() {
  $("head").value = DEFAULTS.head;
  $("queue").value = DEFAULTS.queue;
  $("direction").value = DEFAULTS.direction;
  $("algorithm").value = DEFAULTS.algorithm;
  run();
}

document.addEventListener("DOMContentLoaded", () => {
  $("sim-form").addEventListener("submit", (e) => {
    e.preventDefault();
    run();
  });
  $("reset").addEventListener("click", reset);
  reset();
});
