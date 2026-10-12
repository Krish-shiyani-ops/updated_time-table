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
  renderFacultyAvailability(); // faculty list depends on the subjects
}

/* ===================== FACULTY AVAILABILITY ===================== */
// The user adds "not available" rules from drop-downs; they are expanded into a Set of "day|period"
// per faculty, which the scheduler checks (so a blocked teacher is never placed in those periods).
let rules = [];     // {fac, day: "all" | 0..4, slot: "all" | "morning" | "afternoon" | 0..6}
let unavail = {};   // faculty name -> Set of "day|period"
function getFaculties() { return [...new Set(subjects.map(s => s.faculty))]; }
function isFacultyAvailable(f, day, p) { return !(unavail[f] && unavail[f].has(day + "|" + p)); }

function slotPeriods(slot) { // lunch is after period 2, so morning = 0..2 and afternoon = 3..last
  if (slot === "all") return [...PERIODS.keys()];
  if (slot === "morning") return [0, 1, 2];
  if (slot === "afternoon") return [...PERIODS.keys()].filter(p => p >= 3);
  return [+slot];
}
function rebuildUnavail() {
  unavail = {};
  rules.forEach(r => {
    unavail[r.fac] = unavail[r.fac] || new Set();
    (r.day === "all" ? [...DAYS.keys()] : [+r.day]).forEach(d => slotPeriods(r.slot).forEach(p => unavail[r.fac].add(d + "|" + p)));
  });
}
function ruleText(r) {
  const day = r.day === "all" ? "Every day" : DAYS[r.day];
  const time = r.slot === "all" ? "Whole day" : r.slot === "morning" ? "Morning (before lunch)" : r.slot === "afternoon" ? "Afternoon (after lunch)" : PERIODS[r.slot];
  return `${r.fac} &middot; ${day} &middot; ${time}`;
}
function addUnavailability() {
  const fac = $("facSel").value, day = $("unDay").value, slot = $("unSlot").value;
  if (!fac) return alert("Add a subject with a faculty first.");
  if (rules.some(r => r.fac === fac && String(r.day) === day && String(r.slot) === slot)) return; // already added
  rules.push({ fac, day, slot });
  rebuildUnavail(); renderFacultyAvailability();
}
function removeRule(i) { rules.splice(i, 1); rebuildUnavail(); renderFacultyAvailability(); }

function renderFacultyAvailability() {
  const cur = $("facSel").value, facs = getFaculties();
  $("facSel").innerHTML = facs.map(f => `<option ${f === cur ? "selected" : ""}>${esc(f)}</option>`).join("");
  if (!$("unDay").innerHTML) {
    $("unDay").innerHTML = `<option value="all">Every day</option>` + DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join("");
    $("unSlot").innerHTML = `<option value="all">Whole day</option><option value="morning">Morning (before lunch)</option><option value="afternoon">Afternoon (after lunch)</option>` +
      PERIODS.map((p, i) => `<option value="${i}">${p}</option>`).join("");
  }
  $("ruleList").innerHTML = rules.length ? rules.map((r, i) => `<span class="chip">${ruleText(r)}<button class="remove" onclick="removeRule(${i})">x</button></span>`).join("")
    : `<p class="hint">No restrictions added: every faculty member is available at all times.</p>`;
}

/* ===================== ACTIVITIES ===================== */
// A common lecture is ONE activity for the whole division, so A1 + A2 attend together.
function createCommonLecture(div, sub, n) {
  return { id: `${div.name}-${sub.code}-L${n}`, kind: "Lecture", div: div.name, sub, batches: [...div.batches], len: 1, faculties: [sub.faculty], subKey: sub.code };
}
const subFor = (act, batch) => act.kind === "Lab" ? act.map[batch] : act.sub; // subject a batch has in this activity
const actLabel = act => act.kind === "Lab" ? "lab block" : act.sub.name + " lecture";

/* LAB ROTATION: in one lab period every batch of a division does a DIFFERENT lab (A1 -> WT, A2 -> DAA),
   and over the week every batch must do every lab subject the required number of times.
   This small backtracking search builds that plan: plan[period][batch] = subject index.
   "strict" means no two batches may share the same lab in a period (needs lab subjects >= batches);
   if that is impossible we relax it so batches may repeat a subject. */
function planLabRotation(div) {
  const labSubs = subjects.filter(s => s.lab > 0), n = div.batches.length;
  const S = labSubs.reduce((t, s) => t + s.lab, 0); // lab periods each batch attends per week
  if (!S) return [];
  for (const strict of [true, false]) {
    const need = div.batches.map(() => labSubs.map(s => s.lab));
    const plan = Array.from({ length: S }, () => []);
    let steps = 0;
    const solve = cell => {
      if (cell === S * n) return true;
      if (++steps > 100000) return false;
      const t = Math.floor(cell / n), i = cell % n;
      for (let j = 0; j < labSubs.length; j++) {
        if (need[i][j] === 0 || (strict && plan[t].includes(j))) continue;
        plan[t][i] = j; need[i][j]--;
        if (solve(cell + 1)) return true;
        need[i][j]++; plan[t].length = i; // undo this batch's choice and try the next lab
      }
      return false;
    };
    if (solve(0)) return plan.map(row => row.map(j => labSubs[j]));
  }
  return [];
}
// ONE lab block = one day + time for the whole division; each batch gets its own subject and its own room.
function createLabBlock(div, t, row) {
  const map = {}; div.batches.forEach((b, i) => map[b] = row[i]);
  return { id: `${div.name}-LAB${t}`, kind: "Lab", div: div.name, sub: null, batches: [...div.batches], len: 2, map,
    faculties: [...new Set(row.map(s => s.faculty))], subKey: "LAB" };
}
function buildActivities() {
  const acts = [];
  divisions.forEach(div => {
    subjects.forEach(sub => { for (let n = 0; n < sub.lec; n++) acts.push(createCommonLecture(div, sub, n)); });
    planLabRotation(div).forEach((row, t) => acts.push(createLabBlock(div, t, row)));
  });
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
    act.faculties.forEach(f => keys.push(key("F", f, day, p))); // every teacher involved is busy
    act.batches.forEach(b => keys.push(key("B", b, day, p)));    // every batch busy
    rooms.forEach(r => keys.push(key("R", r, day, p)));          // every room busy
  }
  return keys;
}
function isFree(act, day, start) { // faculty and batches must be free in every period
  for (let p = start; p < start + act.len; p++) {
    // Faculty must be marked available for EVERY period of the class (a 2-hour lab needs both periods).
    if (act.faculties.some(f => !isFacultyAvailable(f, day, p) || busy.has(key("F", f, day, p)))) return false;
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
    const score = sameDay.length + 10 * sameDay.filter(x => x.act.subKey === act.subKey).length;
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
    if (!choice) return { ok: false, error: `Greedy could not place ${actLabel(act)} for Division ${act.div}. Try Backtracking.` };
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
  getFaculties().forEach(f => { // a faculty member needs at least as many free periods as hours to teach
    const k = subjects.filter(s => s.lab > 0).length;
    const need = divisions.reduce((tot, d) => tot + subjects.filter(s => s.faculty === f).reduce((t, s) => t + s.lec + s.lab * 2 * Math.min(d.batches.length, k), 0), 0);
    const have = DAYS.length * PERIODS.length - (unavail[f] ? [...unavail[f]].length : 0);
    if (need > have) errs.push(`${f} needs ${need} periods but is available for only ${have}.`);
  });
  return errs;
}

// Expands the schedule into one record per batch per period, to re-check it independently.
function perPeriod(list) {
  const out = [];
  list.forEach(x => { for (let p = x.start; p < x.start + x.act.len; p++)
    x.act.batches.forEach((b, i) => { const sub = subFor(x.act, b);
      out.push({ day: x.day, p, batch: b, faculty: sub.faculty, gid: x.act.id + "|" + sub.code, aid: x.act.id, kind: x.act.kind, room: x.rooms[x.act.kind === "Lab" ? i : 0] }); }); });
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
function validateFacultyAvailability(list) { // final check: nobody is scheduled while marked unavailable
  return perPeriod(list).filter(r => !isFacultyAvailable(r.faculty, r.day, r.p))
    .map(r => `${r.faculty} is not available on ${DAYS[r.day]}, ${PERIODS[r.p]}`).filter((e, i, a) => a.indexOf(e) === i);
}
function validateLabCoverage(list) { // every batch must get every lab subject exactly the required number of times
  const errs = [], cnt = {};
  list.filter(x => x.act.kind === "Lab").forEach(x => x.act.batches.forEach(b => { const k = b + "|" + subFor(x.act, b).code; cnt[k] = (cnt[k] || 0) + 1; }));
  divisions.forEach(d => d.batches.forEach(b => subjects.filter(s => s.lab > 0).forEach(s => {
    const got = cnt[b + "|" + s.code] || 0;
    if (got !== s.lab) errs.push(`Batch ${b} has ${got} ${s.name} lab session(s) instead of ${s.lab}`); })));
  return errs;
}
function validateLabRooms(list) { // a room cannot hold two batches at once; lab batches must use different rooms
  const errs = [], seen = {};
  perPeriod(list).forEach(r => { // a lecture room is shared by its own batches only; a lab room is never shared
    const k = `${r.room}|${r.day}|${r.p}`;
    if (seen[k] !== undefined && (r.kind === "Lab" || seen[k] !== r.aid)) errs.push(`Room ${r.room} used twice on ${DAYS[r.day]}, ${PERIODS[r.p]}`);
    seen[k] = r.aid;
  });
  list.filter(x => x.act.kind === "Lab").forEach(x => { // lab sync: one day+start per group, distinct rooms
    if (new Set(x.rooms).size !== x.act.batches.length) errs.push(`Lab block of Division ${x.act.div} does not have different rooms per batch`);
  });
  return errs;
}

/* ===================== OUTPUT ===================== */
function toRows(list) {
  const rows = [];
  list.forEach(x => {
    const base = { day: x.day, start: x.start, len: x.act.len, div: x.act.div, type: x.act.kind };
    if (x.act.kind === "Lecture") rows.push({ ...base, sub: x.act.sub, batch: x.act.batches.join(" + "), room: x.rooms[0] }); // one common row
    else x.act.batches.forEach((b, i) => rows.push({ ...base, sub: subFor(x.act, b), batch: b, room: x.rooms[i] }));          // one row per batch
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
        if (a.kind === "Lecture") html += `<td colspan="${a.len}" style="background:${a.sub.color}66"><b>${esc(a.sub.name)} Lecture</b><br>${esc(a.sub.faculty)}<br>${esc(a.batches.join(" + "))}<br>${esc(x.rooms[0])}</td>`;
        else { // different labs in the same period, written as: WT (Lab 2) -> A1 / DAA (Lab 4) -> A2
          const parts = a.batches.map((b, i) => { const sb = subFor(a, b);
            return `<span class="labpart" style="background:${sb.color}99">${esc(sb.name)} (${esc(x.rooms[i])}) &rarr; ${esc(b)}<small> ${esc(sb.faculty)}</small></span>`; });
          html += `<td colspan="${a.len}"><b>Labs</b><br>${parts.join(" / ")}</td>`;
        }
        p += a.len;
      }
      html += "</tr>";
    });
    return html + "</table></div>";
  }).join("");
}

/* Day-wise room availability: for every day, every room, every period -> Free or the class using it. */
function showRoomAvailability(list) {
  const occ = {}; // "room|day|period" -> {text, color}
  list.forEach(x => { for (let p = x.start; p < x.start + x.act.len; p++) x.act.batches.forEach((b, i) => {
    const room = x.rooms[x.act.kind === "Lab" ? i : 0];
    occ[`${room}|${x.day}|${p}`] = { color: subFor(x.act, b).color,
      text: x.act.kind === "Lab" ? `${b}: ${subFor(x.act, b).name} Lab` : `${x.act.div} (${x.act.batches.join("+")}): ${x.act.sub.name}` };
  }); });
  const rooms = [...getRooms("lecRooms"), ...getRooms("labRooms")];
  $("roomTables").innerHTML = DAYS.map((day, di) => {
    let html = `<h3>${day}</h3><div class="scroll"><table class="grid"><tr><th>Room</th>`;
    PERIODS.forEach((p, i) => { if (i === 3) html += "<th>Lunch</th>"; html += `<th>${p}</th>`; });
    html += "</tr>";
    rooms.forEach(r => {
      html += `<tr><th>${esc(r)}</th>`;
      PERIODS.forEach((_, p) => {
        if (p === 3) html += `<td class="lunch">12:00-1:00</td>`;
        const o = occ[`${r}|${di}|${p}`];
        html += o ? `<td style="background:${o.color}66">${esc(o.text)}</td>` : `<td class="free">Free</td>`;
      });
      html += "</tr>";
    });
    return html + "</table></div>";
  }).join("");
  $("roomCard").hidden = false;
}

function showTimetable(list) {
  showDivisionTimetables(list);
  showRoomAvailability(list);
  const rows = toRows(list);
  $("timetable").innerHTML = "<tr><th>Day</th><th>Time</th><th>Division</th><th>Batch</th><th>Subject</th><th>Type</th><th>Faculty</th><th>Room</th></tr>" +
    rows.map(r => `<tr style="background:${r.sub.color}44"><td>${DAYS[r.day]}</td><td>${timeLabel(r)}</td><td>${esc(r.div)}</td><td>${esc(r.batch)}</td>
      <td><b>${esc(r.sub.name)}</b></td><td>${r.type}</td><td>${esc(r.sub.faculty)}</td><td>${esc(r.room)}</td></tr>`).join("");
  $("legend").innerHTML = subjects.map(s => `<span class="legend-item" style="background:${s.color}66;border-left:8px solid ${s.color}">${esc(s.name)}</span>`).join("");
  $("resultCard").hidden = false;
}

function generate() {
  const box = $("messages"); $("resultCard").hidden = true; $("roomCard").hidden = true;
  const errs = validateInputs();
  if (errs.length) { box.innerHTML = errs.map(e => `<div class="error">${esc(e)}</div>`).join(""); return; }
  const acts = buildActivities();
  const res = $("algo").value === "greedy" ? generateGreedyTimetable(acts) : generateBacktrackingTimetable(acts);
  if (!res.ok) { box.innerHTML = `<div class="error">${esc(res.error)}</div>`; return; }
  const problems = [...validateBatchConflicts(res.placed), ...validateLabRooms(res.placed), ...validateFacultyAvailability(res.placed), ...validateLabCoverage(res.placed)]; // final self-check
  box.innerHTML = problems.length ? problems.map(e => `<div class="error">${esc(e)}</div>`).join("")
    : `<div class="ok">Valid timetable generated: ${acts.length} activities, no faculty, room or batch conflicts, every teacher within their availability, batches of a division run different labs in the same period in different rooms.</div>`;
  showTimetable(res.placed);
}

render();
