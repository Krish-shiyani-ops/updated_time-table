/* ===================== CONFIG & DATA ===================== */
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const PERIODS = ["9:00-10:00", "10:00-11:00", "11:00-12:00", "1:00-2:00", "2:00-3:00", "3:00-4:00", "4:00-5:00"];
// Lunch is 12-1, so a 2-hour lab must not start at period 2 (11-12) or 6 (4-5, last period).
const LAB_STARTS = [0, 1, 3, 4, 5];
const LECTURE_STARTS = [0, 1, 2, 3, 4, 5, 6];
const STEP_LIMIT = 200000; // stops backtracking from running forever
const PALETTE = ["#e57373", "#64b5f6", "#81c784", "#ffb74d", "#ba68c8", "#4db6ac", "#f06292", "#a1887f", "#7986cb", "#dce775"];

let divisions = [
  { name: "A", batches: ["A1", "A2"] },
  { name: "B", batches: ["B1", "B2"] }
];
let subjects = [
  { code: "DAA", name: "DAA", faculty: "Faculty 1", lec: 3, lab: 2, color: PALETTE[0] },
  { code: "DBMS", name: "DBMS", faculty: "Faculty 2", lec: 3, lab: 2, color: PALETTE[1] },
  { code: "PY", name: "Python", faculty: "Faculty 3", lec: 3, lab: 1, color: PALETTE[2] },
  { code: "OS", name: "OS", faculty: "Faculty 4", lec: 3, lab: 0, color: PALETTE[3] }
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = id => document.getElementById(id);

/* ===================== DIVISION & BATCH MANAGEMENT ===================== */
function allBatchNames() { return divisions.flatMap(d => d.batches); }
function getBatchesForDivision(name) { return divisions.find(d => d.name === name).batches; }

function addDivision() {
  const name = $("divName").value.trim();
  if (!name) return alert("Enter a division name.");
  if (divisions.some(d => d.name.toLowerCase() === name.toLowerCase())) return alert("Division already exists.");
  divisions.push({ name, batches: [] });
  $("divName").value = "";
  render();
}
function removeDivision(i) { divisions.splice(i, 1); render(); }

function addBatch(i) {
  const input = $("batch" + i), name = input.value.trim();
  if (!name) return alert("Enter a batch name.");
  if (allBatchNames().some(b => b.toLowerCase() === name.toLowerCase())) return alert("Batch name already used.");
  divisions[i].batches.push(name); // a batch always lives inside a division
  render();
}
function removeBatch(i, j) { divisions[i].batches.splice(j, 1); render(); }

/* ===================== SUBJECT MANAGEMENT ===================== */
function addSubject() {
  const s = {
    code: $("sCode").value.trim(), name: $("sName").value.trim(), faculty: $("sFaculty").value.trim(),
    lec: +$("sLec").value, lab: +$("sLab").value, color: $("sColor").value
  };
  if (!s.code || !s.name || !s.faculty) return alert("Fill code, name and faculty.");
  if (subjects.some(x => x.code === s.code)) return alert("Subject code already exists.");
  subjects.push(s);
  ["sCode", "sName", "sFaculty"].forEach(id => $(id).value = "");
  $("sColor").value = PALETTE[subjects.length % PALETTE.length]; // suggest next colour
  render();
}
function removeSubject(i) { subjects.splice(i, 1); render(); }
function subjectType(s) { return s.lec > 0 && s.lab > 0 ? "Lecture + Lab" : s.lab > 0 ? "Lab" : "Lecture"; }

function render() {
  $("divList").innerHTML = divisions.map((d, i) => `
    <div class="division"><h3>Division ${esc(d.name)}
      <button class="remove" onclick="removeDivision(${i})">Remove</button></h3>
      <div class="row"><input id="batch${i}" placeholder="New batch (e.g. ${esc(d.name)}${d.batches.length + 1})">
      <button onclick="addBatch(${i})">Add Batch</button></div>
      ${d.batches.map((b, j) => `<span class="chip">${esc(b)}<button class="remove" onclick="removeBatch(${i},${j})">x</button></span>`).join("")}
    </div>`).join("");
  $("subjList").innerHTML = subjects.map((s, i) => `
    <span class="subj" style="border-color:${s.color};background:${s.color}33">
      <b>${esc(s.code)}</b> ${esc(s.name)} &middot; ${esc(s.faculty)} &middot; ${subjectType(s)} (${s.lec} lectures, ${s.lab} lab session${s.lab === 1 ? "" : "s"})
      <button class="remove" onclick="removeSubject(${i})">x</button></span>`).join("");
}

/* ===================== ACTIVITIES ===================== */
// A common lecture is ONE activity for the whole division, so A1 + A2 attend together.
function createCommonLecture(div, sub, n) {
  return { id: `${div.name}-${sub.code}-L${n}`, kind: "Lecture", div: div.name, sub, batches: [...div.batches], len: 1 };
}
// A lab group is ONE activity for all batches of a division, so day + time is chosen once for all.
function createLabGroup(div, sub, n) {
  return { id: `${div.name}-${sub.code}-P${n}`, kind: "Lab", div: div.name, sub, batches: [...div.batches], len: 2 };
}
function buildActivities() {
  const acts = [];
  divisions.forEach(div => subjects.forEach(sub => {
    for (let n = 0; n < sub.lec; n++) acts.push(createCommonLecture(div, sub, n));
    for (let n = 0; n < sub.lab; n++)  // sub.lab = number of 2-hour lab sessions per week
      acts.push(createLabGroup(div, sub, n));
  }));
  // Hardest first: labs needing the most rooms, then other labs, then lectures (greedy ordering).
  return acts.sort((a, b) => (a.kind === "Lab" ? 0 : 1) - (b.kind === "Lab" ? 0 : 1) || b.batches.length - a.batches.length);
}

/* ===================== BUSY TABLE (conflict tracking) ===================== */
let busy, placed, steps;
const key = (type, id, day, p) => `${type}|${id}|${day}|${p}`;
function resetState() { busy = new Set(); placed = []; steps = 0; }

function keysFor(act, day, start, rooms) {
  const keys = [];
  for (let p = start; p < start + act.len; p++) {
    keys.push(key("F", act.sub.faculty, day, p));                // faculty busy
    act.batches.forEach(b => keys.push(key("B", b, day, p)));    // every batch busy
    rooms.forEach(r => keys.push(key("R", r, day, p)));          // every room busy
  }
  return keys;
}
function isFree(act, day, start) { // faculty and batches must be free in every period
  for (let p = start; p < start + act.len; p++) {
    if (busy.has(key("F", act.sub.faculty, day, p))) return false;
    if (act.batches.some(b => busy.has(key("B", b, day, p)))) return false;
  }
  return true;
}

/* Lecture: needs 1 free classroom. Lab: needs one DIFFERENT free lab room per batch.
   Returns null when not enough rooms are free, so the caller tries another time. */
function assignLabRooms(act, day, start) {
  const pool = act.kind === "Lab" ? getRooms("labRooms") : getRooms("lecRooms");
  const need = act.kind === "Lab" ? act.batches.length : 1;
  const free = pool.filter(r => { for (let p = start; p < start + act.len; p++) if (busy.has(key("R", r, day, p))) return false; return true; });
  return free.length >= need ? free.slice(0, need) : null;
}

// Lists every valid (day, time, rooms) choice. Less crowded days come first so the timetable spreads out.
function findValidSlots(act) {
  const starts = act.kind === "Lab" ? LAB_STARTS : LECTURE_STARTS, out = [];
  DAYS.forEach((_, day) => starts.forEach(start => {
    if (!isFree(act, day, start)) return;
    const rooms = assignLabRooms(act, day, start);
    if (!rooms) return;
    const sameDay = placed.filter(x => x.day === day && x.act.div === act.div);
    const score = sameDay.length + 10 * sameDay.filter(x => x.act.sub.code === act.sub.code).length;
    out.push({ day, start, rooms, score });
  }));
  return out.sort((a, b) => a.score - b.score);
}
const findValidLabSlot = findValidSlots; // same logic is used for labs and lectures

function place(act, c) { keysFor(act, c.day, c.start, c.rooms).forEach(k => busy.add(k)); placed.push({ act, ...c }); }
function unplace() { // undoes the whole group (time + all rooms) at once
  const p = placed.pop();
  keysFor(p.act, p.day, p.start, p.rooms).forEach(k => busy.delete(k));
}

/* ===================== ALGORITHMS ===================== */
// GREEDY: take activities in priority order and always pick the first valid choice. Never undoes.
function generateGreedyTimetable(acts) {
  resetState();
  for (const act of acts) {
    const choice = findValidSlots(act)[0];
    if (!choice) return { ok: false, error: `Greedy could not place ${act.sub.name} ${act.kind} for Division ${act.div}. Try Backtracking.` };
    place(act, choice);
  }
  return { ok: true, placed };
}

// BACKTRACKING: try a choice, recurse; if later activities get stuck, undo it and try the next one.
function generateBacktrackingTimetable(acts) {
  resetState();
  const solve = i => {
    if (i === acts.length) return true;
    if (++steps > STEP_LIMIT) return false;
    for (const choice of findValidSlots(acts[i])) {
      place(acts[i], choice);               // places time + all batch rooms as one group
      if (solve(i + 1)) return true;
      unplace();                            // undo the entire group, then try another time
    }
    return false;
  };
  return solve(0) ? { ok: true, placed } : { ok: false, error: steps > STEP_LIMIT ? "Backtracking stopped: search too large. Add rooms or reduce hours." : "No valid timetable exists with the current data." };
}

/* ===================== VALIDATION ===================== */
function getRooms(id) { return $(id).value.split(",").map(s => s.trim()).filter(Boolean); }

function validateInputs() {
  const errs = [];
  if (divisions.length < 1) errs.push("At least one division must exist.");
  divisions.forEach(d => { if (!d.batches.length) errs.push(`Division ${d.name} has no batches.`); });
  const names = allBatchNames().map(b => b.toLowerCase());
  if (new Set(names).size !== names.length) errs.push("Batch names must be unique.");
  if (!subjects.length) errs.push("Add at least one subject.");
  const needLec = subjects.some(s => s.lec > 0), needLab = subjects.some(s => s.lab > 0);
  if (needLec && !getRooms("lecRooms").length) errs.push("Enough lecture rooms do not exist.");
  const maxBatches = Math.max(0, ...divisions.map(d => d.batches.length));
  if (needLab && getRooms("labRooms").length < maxBatches) errs.push("Not enough lab rooms available for simultaneous batch labs.");
  return errs;
}

// Expands the schedule into one record per batch per period, to re-check it independently.
function perPeriod(list) {
  const out = [];
  list.forEach(x => { for (let p = x.start; p < x.start + x.act.len; p++)
    x.act.batches.forEach((b, i) => out.push({ day: x.day, p, batch: b, faculty: x.act.sub.faculty, gid: x.act.id, room: x.rooms[x.act.kind === "Lab" ? i : 0] })); });
  return out;
}
function validateBatchConflicts(list) { // a batch / faculty cannot be in two places at once
  const errs = [], seenB = new Set(), seenF = {};
  perPeriod(list).forEach(r => {
    const kb = `${r.batch}|${r.day}|${r.p}`;
    if (seenB.has(kb)) errs.push(`Batch ${r.batch} has two classes on ${DAYS[r.day]}, ${PERIODS[r.p]}`);
    seenB.add(kb);
    const kf = `${r.faculty}|${r.day}|${r.p}`;
    if (seenF[kf] && seenF[kf] !== r.gid) errs.push(`${r.faculty} teaches two classes on ${DAYS[r.day]}, ${PERIODS[r.p]}`);
    seenF[kf] = r.gid;
  });
  return errs;
}
function validateLabRooms(list) { // a room cannot hold two batches at once; lab batches must use different rooms
  const errs = [], seen = new Set();
  perPeriod(list).forEach(r => {
    const k = `${r.room}|${r.day}|${r.p}`;
    if (seen.has(k) && !list.find(x => x.act.id === r.gid && x.act.kind === "Lecture")) errs.push(`Room ${r.room} used twice on ${DAYS[r.day]}, ${PERIODS[r.p]}`);
    seen.add(k);
  });
  list.filter(x => x.act.kind === "Lab").forEach(x => { // lab sync: one day+start per group, distinct rooms
    if (new Set(x.rooms).size !== x.act.batches.length) errs.push(`${x.act.sub.name} lab of Division ${x.act.div} does not have different rooms per batch`);
  });
  return errs;
}

/* ===================== OUTPUT ===================== */
function toRows(list) {
  const rows = [];
  list.forEach(x => {
    const base = { day: x.day, start: x.start, len: x.act.len, div: x.act.div, sub: x.act.sub, type: x.act.kind };
    if (x.act.kind === "Lecture") rows.push({ ...base, batch: x.act.batches.join(" + "), room: x.rooms[0] }); // one common row
    else x.act.batches.forEach((b, i) => rows.push({ ...base, batch: b, room: x.rooms[i] }));              // one row per batch
  });
  return rows.sort((a, b) => a.day - b.day || a.start - b.start || a.div.localeCompare(b.div) || a.batch.localeCompare(b.batch));
}
const timeLabel = r => PERIODS[r.start].split("-")[0] + " - " + PERIODS[r.start + r.len - 1].split("-")[1];

/* One grid (Day x Period) per division. Every batch of the division sits in the SAME cell:
   lectures show "A1 + A2" with one room, labs show each batch with its own lab room. */
function showDivisionTimetables(list) {
  $("divTables").innerHTML = divisions.map(d => {
    const mine = list.filter(x => x.act.div === d.name);
    let html = `<h3>Division ${esc(d.name)} (${d.batches.map(esc).join(", ")})</h3><div class="scroll"><table class="grid"><tr><th>Day</th>`;
    PERIODS.forEach((p, i) => { if (i === 3) html += "<th>Lunch</th>"; html += `<th>${p}</th>`; });
    html += "</tr>";
    DAYS.forEach((day, di) => {
      html += `<tr><th>${day}</th>`;
      let p = 0;
      while (p < PERIODS.length) {
        if (p === 3) html += `<td class="lunch">12:00-1:00</td>`;
        const x = mine.find(m => m.day === di && m.start === p);
        if (!x) { html += "<td></td>"; p++; continue; }
        const a = x.act;
        const body = a.kind === "Lecture"
          ? `${esc(a.batches.join(" + "))}<br>${esc(x.rooms[0])}`
          : a.batches.map((b, i) => `${esc(b)} &rarr; ${esc(x.rooms[i])}`).join("<br>");
        html += `<td colspan="${a.len}" style="background:${a.sub.color}66"><b>${esc(a.sub.name)} ${a.kind}</b><br>${esc(a.sub.faculty)}<br>${body}</td>`;
        p += a.len;
      }
      html += "</tr>";
    });
    return html + "</table></div>";
  }).join("");
}

function showTimetable(list) {
  showDivisionTimetables(list);
  const rows = toRows(list);
  $("timetable").innerHTML = "<tr><th>Day</th><th>Time</th><th>Division</th><th>Batch</th><th>Subject</th><th>Type</th><th>Faculty</th><th>Room</th></tr>" +
    rows.map(r => `<tr style="background:${r.sub.color}44"><td>${DAYS[r.day]}</td><td>${timeLabel(r)}</td><td>${esc(r.div)}</td><td>${esc(r.batch)}</td>
      <td><b>${esc(r.sub.name)}</b></td><td>${r.type}</td><td>${esc(r.sub.faculty)}</td><td>${esc(r.room)}</td></tr>`).join("");
  $("legend").innerHTML = subjects.map(s => `<span class="legend-item" style="background:${s.color}66;border-left:8px solid ${s.color}">${esc(s.name)}</span>`).join("");
  $("resultCard").hidden = false;
}

function generate() {
  const box = $("messages"); $("resultCard").hidden = true;
  const errs = validateInputs();
  if (errs.length) { box.innerHTML = errs.map(e => `<div class="error">${esc(e)}</div>`).join(""); return; }
  const acts = buildActivities();
  const res = $("algo").value === "greedy" ? generateGreedyTimetable(acts) : generateBacktrackingTimetable(acts);
  if (!res.ok) { box.innerHTML = `<div class="error">${esc(res.error)}</div>`; return; }
  const problems = [...validateBatchConflicts(res.placed), ...validateLabRooms(res.placed)]; // final self-check
  box.innerHTML = problems.length ? problems.map(e => `<div class="error">${esc(e)}</div>`).join("")
    : `<div class="ok">Valid timetable generated: ${acts.length} activities, no faculty, room or batch conflicts, labs synchronized with different rooms.</div>`;
  showTimetable(res.placed);
}

render();
