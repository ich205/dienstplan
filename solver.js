const BLOCK = {
  NONE: '',
  FREE0: 'FREE0',
  WF: 'WF',
  FREEH: 'FREEH',
};

const SHIFT = {
  IWD: { key: 'IWD', label: 'IWD', hours: 20 },
  TD: { key: 'TD', label: 'TD', hours: 10 },
};

const SPECIAL_DAY = {
  NONE: '',
  SV: 'SV',
  TEAM: 'TEAM',
};

const SPECIAL_DAY_CONFIG = {
  [SPECIAL_DAY.SV]: { offCredit: 3.5, otherCredit: 2 },
  [SPECIAL_DAY.TEAM]: { offCredit: 2, otherCredit: 3 },
};

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

function round1(n){
  return Math.round(n * 10) / 10;
}

function normalizeSpecialDay(value){
  if (value === null || typeof value === 'undefined' || value === '') return SPECIAL_DAY.NONE;
  const normalized = String(value).toUpperCase();
  if (normalized === 'SV') return SPECIAL_DAY.SV;
  if (normalized === 'TEAM') return SPECIAL_DAY.TEAM;
  return SPECIAL_DAY.NONE;
}

function getSpecialDayCredit(value, { forcedOff } = {}){
  const config = SPECIAL_DAY_CONFIG[value];
  if (!config) return 0;
  return forcedOff ? config.offCredit : config.otherCredit;
}

function defaultEmpPrefs(){
  return {
    allowIWD: true,
    allowTD: true,
    tdBias: 0,
    bannedDows: [],
    iwdMinGap: 4,
    doubleIwdPref: 0,
    extraRestAfterIWD: 0,
    preferWorkDows: [],
    weekendBias: 0,
    maxIwdPerWeek: null,
    maxTdPerWeek: null,
    maxIwdPerMonth: null,
    maxTdPerMonth: null,
  };
}

function sanitizePrefs(prefs){
  const base = defaultEmpPrefs();
  const p = (prefs && typeof prefs === 'object') ? prefs : {};

  const allowIWD = ('allowIWD' in p) ? Boolean(p.allowIWD) : base.allowIWD;
  const allowTD  = ('allowTD'  in p) ? Boolean(p.allowTD)  : base.allowTD;

  let tdBias = Number(('tdBias' in p) ? p.tdBias : base.tdBias);
  if (![ -1, 0, 1 ].includes(tdBias)) tdBias = 0;

  const banned = Array.isArray(p.bannedDows) ? p.bannedDows : [];
  const bannedDows = Array.from(new Set(
    banned.map(n => Number(n)).filter(n => [0,1,2,3,4,5,6].includes(n))
  ));

  let iwdMinGap = Number(('iwdMinGap' in p) ? p.iwdMinGap : base.iwdMinGap);
  iwdMinGap = clamp(Math.round(iwdMinGap || base.iwdMinGap), 2, 7);

  let doubleIwdPref = Number(('doubleIwdPref' in p) ? p.doubleIwdPref : base.doubleIwdPref);
  if (![ -1, 0, 1 ].includes(doubleIwdPref)) doubleIwdPref = 0;

  let extraRestAfterIWD = Number(('extraRestAfterIWD' in p) ? p.extraRestAfterIWD : base.extraRestAfterIWD);
  extraRestAfterIWD = clamp(Math.round(extraRestAfterIWD || 0), 0, 2);

  const preferWork = Array.isArray(p.preferWorkDows) ? p.preferWorkDows : [];
  const preferWorkDows = Array.from(new Set(
    preferWork.map(n => Number(n)).filter(n => [0,1,2,3,4,5,6].includes(n))
  ));

  let weekendBias = Number(('weekendBias' in p) ? p.weekendBias : base.weekendBias);
  if (![ -1, 0, 1 ].includes(weekendBias)) weekendBias = 0;

  const normLimit = (v) => {
    if (v === null || typeof v === 'undefined' || v === '') return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return null;
    return clamp(n, 0, 31);
  };

  const maxIwdPerWeek = normLimit(('maxIwdPerWeek' in p) ? p.maxIwdPerWeek : base.maxIwdPerWeek);
  const maxTdPerWeek  = normLimit(('maxTdPerWeek'  in p) ? p.maxTdPerWeek  : base.maxTdPerWeek);
  const maxIwdPerMonth = normLimit(('maxIwdPerMonth' in p) ? p.maxIwdPerMonth : base.maxIwdPerMonth);
  const maxTdPerMonth  = normLimit(('maxTdPerMonth'  in p) ? p.maxTdPerMonth  : base.maxTdPerMonth);

  return {
    allowIWD,
    allowTD,
    tdBias,
    bannedDows,
    iwdMinGap,
    doubleIwdPref,
    extraRestAfterIWD,
    preferWorkDows,
    weekendBias,
    maxIwdPerWeek,
    maxTdPerWeek,
    maxIwdPerMonth,
    maxTdPerMonth,
  };
}

function balanceMonthlyAdjustment(balanceHours){
  const b = Number(balanceHours) || 0;
  const adj = -b / 12;
  return round1(clamp(adj, -20, 20));
}

function getBlockFromMap(blocksByEmpId, empId, isoDate){
  if (!blocksByEmpId || !blocksByEmpId[empId]) return BLOCK.NONE;
  return blocksByEmpId[empId][isoDate] || BLOCK.NONE;
}

function buildMonthContext({ monthKey, days, segments, employees, settings, blocksByEmpId, tdRequiredByDay, specialDayByDay }){
  const N = days.length;
  const segIdByDay = Array(N).fill(0);
  segments.forEach((seg, si) => {
    for (const idx of seg.indices){
      segIdByDay[idx] = si;
    }
  });

  const empDataById = {};

  for (const emp of employees){
    const prefs = sanitizePrefs(emp.prefs);
    const perWeekday = emp.weeklyHours / 5;

    const blockByDay = Array(N);
    const creditByDay = Array(N);
    const allowedByDay = Array(N);
    const preferWorkByDay = Array(N);

    for (let i = 0; i < N; i++){
      const day = days[i];
      const blk = getBlockFromMap(blocksByEmpId, emp.id, day.iso);
      blockByDay[i] = blk;
      creditByDay[i] = (day.dow >= 1 && day.dow <= 5 && blk === BLOCK.FREEH) ? perWeekday : 0;
      allowedByDay[i] = !(prefs.bannedDows && prefs.bannedDows.includes(day.dow));
      preferWorkByDay[i] = Boolean(prefs.preferWorkDows && prefs.preferWorkDows.includes(day.dow));
    }

    const segContractTarget = segments.map(seg => emp.weeklyHours * (seg.weekdaysCount / 5));
    const segCredit = segments.map(seg => seg.indices.reduce((sum, idx) => sum + (creditByDay[idx] || 0), 0));

    const monthContractTarget = segContractTarget.reduce((a,b) => a + b, 0);
    const monthCredit = segCredit.reduce((a,b) => a + b, 0);

    const adjust = balanceMonthlyAdjustment(emp.balanceHours);
    const monthDesiredTarget = round1(Math.max(0, monthContractTarget + adjust));

    const segDesiredTarget = segments.map((seg, si) => {
      if (monthContractTarget <= 0) return 0;
      const share = segContractTarget[si] / monthContractTarget;
      return Math.max(0, segContractTarget[si] + adjust * share);
    });
    if (segments.length && monthContractTarget > 0){
      const sumDesired = segDesiredTarget.reduce((a,b) => a + b, 0);
      const diff = (monthDesiredTarget - sumDesired);
      const last = segDesiredTarget.length - 1;
      segDesiredTarget[last] = round1(Math.max(0, segDesiredTarget[last] + diff));
    }

    const segRequired = segments.map((seg, si) => Math.max(0, segDesiredTarget[si] - segCredit[si]));
    const monthRequired = segRequired.reduce((a,b) => a + b, 0);

    empDataById[emp.id] = {
      emp,
      prefs,
      perWeekday,
      blockByDay,
      creditByDay,
      allowedByDay,
      preferWorkByDay,
      segContractTarget,
      segCredit,
      segDesiredTarget,
      segRequired,
      monthContractTarget: round1(monthContractTarget),
      monthDesiredTarget: round1(monthDesiredTarget),
      monthCredit: round1(monthCredit),
      balanceStart: round1(Number(emp.balanceHours) || 0),
      balanceAdjust: round1(adjust),
      monthRequired: round1(monthRequired),
    };
  }

  const segRequiredTotal = segments.map((seg, si) => {
    let total = 0;
    for (const emp of employees){
      total += empDataById[emp.id]?.segRequired[si] || 0;
    }
    return total;
  });

  const resolvedTdRequiredByDay = Array.isArray(tdRequiredByDay)
    ? tdRequiredByDay.slice(0, N).map(Boolean)
    : Array(N).fill(false);
  const resolvedSpecialDayByDay = Array.isArray(specialDayByDay)
    ? specialDayByDay.slice(0, N).map(normalizeSpecialDay)
    : Array(N).fill(SPECIAL_DAY.NONE);

  return {
    monthKey,
    days,
    segments,
    employees,
    settings,
    N,
    segIdByDay,
    empDataById,
    segRequiredTotal,
    tdRequiredByDay: resolvedTdRequiredByDay,
    specialDayByDay: resolvedSpecialDayByDay,
  };
}

function blockStageAllows(blk, stage){
  if (!blk || blk === BLOCK.NONE) return true;
  if (blk === BLOCK.FREE0) return stage >= 1;
  if (blk === BLOCK.WF) return stage >= 2;
  if (blk === BLOCK.FREEH) return stage >= 3;
  return false;
}

function isEmployeeAvailableCtx(ctx, empId, dayIdx, shift, forcedOff, blockStage = 0){
  const ed = ctx.empDataById[empId];
  if (!ed) return false;
  if (forcedOff && forcedOff[empId] && forcedOff[empId][dayIdx]) return false;

  const blk = ed.blockByDay[dayIdx];
  if (!blockStageAllows(blk, blockStage)) return false;
  return true;
}

function countAvailableForDayCtx(ctx, dayIdx, forcedOff, shift){
  let count = 0;
  for (const emp of ctx.employees){
    if (!isEmployeeAvailableCtx(ctx, emp.id, dayIdx, shift, forcedOff, 0)) continue;
    count += 1;
  }
  return count;
}

function selectTdDaysWithOmissionsCtx(ctx, segmentIndices, forcedOff, tdCount, tdRequiredByDay){
  const days = ctx.days;

  const required = [];
  if (Array.isArray(tdRequiredByDay)){
    for (const idx of segmentIndices){
      if (tdRequiredByDay[idx]) required.push(idx);
    }
  }
  const requiredSet = new Set(required);

  const candidates = segmentIndices
    .filter(idx => !requiredSet.has(idx))
    .map(idx => {
      const day = days[idx];
      const weekend = (day.dow === 0 || day.dow === 6);
      const avail = countAvailableForDayCtx(ctx, idx, forcedOff, SHIFT.TD);
      return { idx, weekend, avail };
    });

  candidates.sort((a,b) => {
    if (a.weekend !== b.weekend) return a.weekend ? 1 : -1;
    if (b.avail !== a.avail) return b.avail - a.avail;
    return a.idx - b.idx;
  });

  const ordered = required.concat(candidates.map(c => c.idx));
  const pickCount = Math.max(0, Math.min(tdCount, ordered.length));
  const planned = ordered.slice(0, pickCount).sort((a,b) => a - b);
  const omitted = ordered.slice(pickCount).sort((a,b) => a - b);

  return { planned, omitted };
}

function scoreIwdCtx(ctx, empId, dayIdx, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd){
  const ed = ctx.empDataById[empId];
  if (!ed) return -Infinity;
  const prefs = ed.prefs;

  const remW = (remainingWeek && typeof remainingWeek[empId] === 'number') ? remainingWeek[empId] : 0;
  const remM = (remainingMonth && typeof remainingMonth[empId] === 'number') ? remainingMonth[empId] : 0;

  const gap = dayIdx - (lastWork[empId] ?? -999);
  const gapIwd = dayIdx - (lastIwd[empId] ?? -999);

  const iCount = (counts && counts.iwd && counts.iwd[empId]) ? counts.iwd[empId] : 0;
  const tCount = (counts && counts.td && counts.td[empId]) ? counts.td[empId] : 0;

  const weekI = (weekCounts && weekCounts.iwd && weekCounts.iwd[empId]) ? weekCounts.iwd[empId] : 0;

  const day = ctx.days[dayIdx];
  const isWeekend = (day.dow === 0 || day.dow === 6);

  let score = 0;

  if (!ed.allowedByDay[dayIdx]) score -= 260;
  if (prefs.allowIWD === false) score -= 900;

  score += remW * 2.2 + remM * 1.6;

  score += Math.min(gap, 14) * (ctx.settings.preferGaps ? 18 : 10);
  if (gap === 1) score -= 500;
  if (gap === 2) score -= 120;

  const minGap = prefs.iwdMinGap ?? 4;
  if (gapIwd < minGap){
    score -= 260 * (minGap - gapIwd);
  }
  if (prefs.doubleIwdPref === 1 && gapIwd === 2) score += 140;
  if (prefs.doubleIwdPref === -1 && gapIwd === 2) score -= 220;

  if ((prefs.extraRestAfterIWD || 0) >= 1 && gapIwd === 2) score -= 420;

  if (prefs.weekendBias === 1 && isWeekend) score += 70;
  if (prefs.weekendBias === -1 && isWeekend) score -= 70;

  if (ed.preferWorkByDay[dayIdx]) score += 120;
  if (dayIdx + 1 < ctx.N && ed.preferWorkByDay[dayIdx + 1]) score += 90;

  if (prefs.maxIwdPerWeek != null && weekI >= prefs.maxIwdPerWeek) score -= 700;
  if (prefs.maxIwdPerMonth != null && iCount >= prefs.maxIwdPerMonth) score -= 900;

  if (prefs.tdBias === -1) score += 120;
  if (prefs.tdBias === 1) score -= 80;
  if (prefs.tdBias === 1){
    score -= Math.max(0, iCount - tCount) * 20;
  } else if (prefs.tdBias === -1){
    score += Math.max(0, tCount - iCount) * 20;
  }

  if (dayIdx + 1 < ctx.N){
    const nextBlock = ed.blockByDay[dayIdx + 1];
    if (nextBlock === BLOCK.FREEH) score -= 800;
    else if (nextBlock === BLOCK.WF) score -= 500;
    else if (nextBlock === BLOCK.FREE0) score -= 120;
  }

  if (remW < 0) score -= 900 + Math.abs(remW) * 12;
  if (remM < 0) score -= 400 + Math.abs(remM) * 4;

  score += (Math.random() - 0.5) * 40;
  return score;
}

function scoreTdCtx(ctx, empId, dayIdx, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd){
  const ed = ctx.empDataById[empId];
  if (!ed) return -Infinity;
  const prefs = ed.prefs;

  const remW = (remainingWeek && typeof remainingWeek[empId] === 'number') ? remainingWeek[empId] : 0;
  const remM = (remainingMonth && typeof remainingMonth[empId] === 'number') ? remainingMonth[empId] : 0;

  const gap = dayIdx - (lastWork[empId] ?? -999);
  const gapIwd = dayIdx - (lastIwd[empId] ?? -999);

  const iCount = (counts && counts.iwd && counts.iwd[empId]) ? counts.iwd[empId] : 0;
  const tCount = (counts && counts.td && counts.td[empId]) ? counts.td[empId] : 0;

  const weekT = (weekCounts && weekCounts.td && weekCounts.td[empId]) ? weekCounts.td[empId] : 0;

  const day = ctx.days[dayIdx];
  const isWeekend = (day.dow === 0 || day.dow === 6);

  let score = 0;

  if (!ed.allowedByDay[dayIdx]) score -= 200;
  if (prefs.allowTD === false) score -= 750;

  score += remW * 1.6 + remM * 1.2;

  score += Math.min(gap, 14) * (ctx.settings.preferGaps ? 10 : 6);
  if (gap === 1) score -= 260;
  if (gap === 2) score -= 70;

  if ((prefs.extraRestAfterIWD || 0) >= 1 && gapIwd === 2) score -= 250;

  if (prefs.weekendBias === 1 && isWeekend) score += 50;
  if (prefs.weekendBias === -1 && isWeekend) score -= 50;

  if (ed.preferWorkByDay[dayIdx]) score += 80;

  if (prefs.maxTdPerWeek != null && weekT >= prefs.maxTdPerWeek) score -= 450;
  if (prefs.maxTdPerMonth != null && tCount >= prefs.maxTdPerMonth) score -= 650;

  if (prefs.tdBias === 1) score += 140;
  if (prefs.tdBias === -1) score -= 90;

  if (prefs.tdBias === 1){
    score += Math.max(0, iCount - tCount) * 20;
  } else if (prefs.tdBias === -1){
    score -= Math.max(0, tCount - iCount) * 20;
  }

  if (remW < 0) score -= 500 + Math.abs(remW) * 6;
  if (remM < 0) score -= 220 + Math.abs(remM) * 3;

  score += (Math.random() - 0.5) * 30;
  return score;
}

function chooseEmployeeForShiftCtx({ ctx, shift, dayIdx, schedule, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd, forcedOff }){
  const candidates = [];
  for (const emp of ctx.employees){
    if (!isEmployeeAvailableCtx(ctx, emp.id, dayIdx, shift, forcedOff, 0)) continue;

    if (shift.key === SHIFT.IWD.key){
      if (schedule.iwd[dayIdx]) continue;
    } else {
      if (schedule.td[dayIdx]) continue;
      if (schedule.iwd[dayIdx] && schedule.iwd[dayIdx] === emp.id) continue;
    }

    candidates.push(emp);
  }

  if (candidates.length === 0){
    for (let stage = 1; stage <= 3 && candidates.length === 0; stage++){
      for (const emp of ctx.employees){
        if (!isEmployeeAvailableCtx(ctx, emp.id, dayIdx, shift, forcedOff, stage)) continue;
        if (shift.key === SHIFT.IWD.key){
          if (schedule.iwd[dayIdx]) continue;
        } else {
          if (schedule.td[dayIdx]) continue;
          if (schedule.iwd[dayIdx] && schedule.iwd[dayIdx] === emp.id) continue;
        }
        candidates.push(emp);
      }
    }
  }

  if (candidates.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;

  for (const emp of candidates){
    let score = -Infinity;
    if (shift.key === SHIFT.IWD.key){
      score = scoreIwdCtx(ctx, emp.id, dayIdx, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd);
    } else {
      score = scoreTdCtx(ctx, emp.id, dayIdx, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd);
    }
    if (score > bestScore){
      bestScore = score;
      best = emp;
    }
  }

  return best ? best.id : null;
}

function chooseTdCount(totalRequiredWork, baseIwdHours, maxDays){
  if (totalRequiredWork <= baseIwdHours) return 0;

  let best = 0;
  let bestDiff = Infinity;

  for (let c = 0; c <= maxDays; c++){
    const total = baseIwdHours + c * SHIFT.TD.hours;
    const diff = Math.abs(totalRequiredWork - total);
    if (diff < bestDiff){
      bestDiff = diff;
      best = c;
    } else if (diff === bestDiff){
      if (c < best) best = c;
    }
  }
  return best;
}

function buildScheduleAttemptCtx(ctx){
  const N = ctx.N;

  const schedule = {
    iwd: Array(N).fill(null),
    td: Array(N).fill(null),
  };

  const forcedOff = {};
  const lastWork = {};
  const lastIwd = {};
  const counts = { iwd: {}, td: {} };
  const plannedTdDays = [];
  const omittedTdDays = [];

  for (const emp of ctx.employees){
    forcedOff[emp.id] = Array(N).fill(false);
    lastWork[emp.id] = -999;
    lastIwd[emp.id] = -999;
    counts.iwd[emp.id] = 0;
    counts.td[emp.id] = 0;
  }

  const remainingMonth = {};
  for (const emp of ctx.employees) remainingMonth[emp.id] = 0;

  for (let si = 0; si < ctx.segments.length; si++){
    for (const emp of ctx.employees){
      const required = Number(ctx.empDataById[emp.id]?.segRequired[si]) || 0;
      remainingMonth[emp.id] += required;
    }
  }

  for (let si = 0; si < ctx.segments.length; si++){
    const seg = ctx.segments[si];
    const segIndices = seg.indices;

    const remainingDays = ctx.segments.slice(si).reduce((sum, s) => sum + s.indices.length, 0);
    const remainingMonthTotal = ctx.employees.reduce((sum, emp) => {
      const rem = Number(remainingMonth[emp.id] || 0);
      return sum + Math.max(0, rem);
    }, 0);
    const segmentTargetTotal = remainingDays > 0
      ? remainingMonthTotal * (segIndices.length / remainingDays)
      : 0;

    const remainingWeek = {};
    for (const emp of ctx.employees){
      const req = Number(ctx.empDataById[emp.id]?.segRequired[si]) || 0;
      const remMonth = Number(remainingMonth[emp.id] || 0);
      remainingWeek[emp.id] = Math.min(req, remMonth);
    }

    const baseIwd = segIndices.length * SHIFT.IWD.hours;
    const requiredTdCount = segIndices.reduce((n, idx) => n + (ctx.tdRequiredByDay[idx] ? 1 : 0), 0);
    const autoTdCount = chooseTdCount(segmentTargetTotal, baseIwd, segIndices.length);
    const tdCount = clamp(Math.max(autoTdCount, requiredTdCount), 0, segIndices.length);
    const { planned: tdDays, omitted: omittedDays } = selectTdDaysWithOmissionsCtx(
      ctx,
      segIndices,
      forcedOff,
      tdCount,
      ctx.tdRequiredByDay,
    );
    plannedTdDays.push(...tdDays);
    omittedTdDays.push(...omittedDays);

    const weekCounts = { iwd: {}, td: {} };
    for (const emp of ctx.employees){
      weekCounts.iwd[emp.id] = 0;
      weekCounts.td[emp.id] = 0;
    }

    for (const dayIdx of segIndices){
      const empId = chooseEmployeeForShiftCtx({
        ctx,
        shift: SHIFT.IWD,
        dayIdx,
        schedule,
        remainingWeek,
        remainingMonth,
        counts,
        weekCounts,
        lastWork,
        lastIwd,
        forcedOff,
      });

      schedule.iwd[dayIdx] = empId;
      if (empId){
        remainingWeek[empId] -= SHIFT.IWD.hours;
        remainingMonth[empId] -= SHIFT.IWD.hours;

        counts.iwd[empId] += 1;
        weekCounts.iwd[empId] += 1;
        lastWork[empId] = dayIdx;
        lastIwd[empId] = dayIdx;

        if (dayIdx + 1 < N){
          forcedOff[empId][dayIdx + 1] = true;
        }
      }
    }

    for (const dayIdx of tdDays){
      const empId = chooseEmployeeForShiftCtx({
        ctx,
        shift: SHIFT.TD,
        dayIdx,
        schedule,
        remainingWeek,
        remainingMonth,
        counts,
        weekCounts,
        lastWork,
        lastIwd,
        forcedOff,
      });

      schedule.td[dayIdx] = empId;
      if (empId){
        remainingWeek[empId] -= SHIFT.TD.hours;
        remainingMonth[empId] -= SHIFT.TD.hours;

        counts.td[empId] += 1;
        weekCounts.td[empId] += 1;
        lastWork[empId] = dayIdx;
      }
    }
  }

  return { schedule, forcedOff, plannedTdDays, omittedTdDays };
}

function evaluateAttemptCtx(ctx, attempt){
  const schedule = attempt.schedule;
  const forcedOff = attempt.forcedOff;

  let cost = 0;
  const N = ctx.N;

  const COST = {
    HARD: 20_000_000,
    MISSING_IWD: 20_000_000,
    MISSING_REQUIRED_TD: 8_000_000,
    SAME_PERSON: 20_000_000,

    BLOCK_URLAUB: 10_000_000,
    BLOCK_WF: 2_500_000,
    BLOCK_FREE0: 1_500_000,

    WISH_DAY: 8_000,
    WISH_SHIFT: 12_000,
    FORCED_URLAUB: 15_000_000,
    FORCED_WF: 2_000_000,
    FORCED_FREE0: 600_000,
  };

  for (let i = 0; i < N; i++){
    if (!schedule.iwd[i]) cost += COST.MISSING_IWD;
    if (ctx.tdRequiredByDay && ctx.tdRequiredByDay[i] && !schedule.td[i]) cost += COST.MISSING_REQUIRED_TD;
  }

  for (let i = 0; i < N; i++){
    const iwdEmpId = schedule.iwd[i];
    const tdEmpId  = schedule.td[i];

    if (iwdEmpId && tdEmpId && iwdEmpId === tdEmpId) cost += COST.SAME_PERSON;

    const checkOne = (empId, shift) => {
      if (!empId) return;
      const ed = ctx.empDataById[empId];
      if (!ed) { cost += COST.HARD; return; }

      const blk = ed.blockByDay[i];
      if (blk === BLOCK.FREEH) cost += COST.BLOCK_URLAUB;
      else if (blk === BLOCK.WF) cost += COST.BLOCK_WF;
      else if (blk === BLOCK.FREE0) cost += COST.BLOCK_FREE0;

      if (forcedOff[empId] && forcedOff[empId][i]) cost += COST.HARD;

      if (!ed.allowedByDay[i]) cost += COST.WISH_DAY;
      if (shift.key === SHIFT.IWD.key && ed.prefs.allowIWD === false) cost += COST.WISH_SHIFT;
      if (shift.key === SHIFT.TD.key && ed.prefs.allowTD === false) cost += COST.WISH_SHIFT;
    };

    checkOne(iwdEmpId, SHIFT.IWD);
    checkOne(tdEmpId, SHIFT.TD);
  }

  for (const emp of ctx.employees){
    const ed = ctx.empDataById[emp.id];
    if (!ed) continue;
    for (let i = 0; i < N; i++){
      if (!forcedOff[emp.id] || !forcedOff[emp.id][i]) continue;
      const blk = ed.blockByDay[i];
      if (blk === BLOCK.FREEH) cost += COST.FORCED_URLAUB;
      else if (blk === BLOCK.WF) cost += COST.FORCED_WF;
      else if (blk === BLOCK.FREE0) cost += COST.FORCED_FREE0;
    }
  }

  for (let si = 0; si < ctx.segments.length; si++){
    const seg = ctx.segments[si];
    const segIndices = seg.indices;

    const weekIwd = {};
    const weekTd = {};
    for (const emp of ctx.employees){
      weekIwd[emp.id] = 0;
      weekTd[emp.id] = 0;
    }

    for (const emp of ctx.employees){
      const ed = ctx.empDataById[emp.id];
      if (!ed) continue;

      const target = Number(ed.segDesiredTarget[si]) || 0;
      const credit = Number(ed.segCredit[si]) || 0;

      let work = 0;
      let iwdC = 0;
      let tdC = 0;
      let specialCredit = 0;

      for (const dayIdx of segIndices){
        if (schedule.iwd[dayIdx] === emp.id){ work += SHIFT.IWD.hours; iwdC++; }
        if (schedule.td[dayIdx] === emp.id){ work += SHIFT.TD.hours; tdC++; }

        const specialDay = ctx.specialDayByDay ? ctx.specialDayByDay[dayIdx] : SPECIAL_DAY.NONE;
        if (specialDay){
          if (schedule.iwd[dayIdx] !== emp.id && schedule.td[dayIdx] !== emp.id){
            if (ed.blockByDay[dayIdx] !== BLOCK.FREEH){
              const isForced = Boolean(forcedOff && forcedOff[emp.id] && forcedOff[emp.id][dayIdx]);
              specialCredit += getSpecialDayCredit(specialDay, { forcedOff: isForced });
            }
          }
        }
      }

      weekIwd[emp.id] = iwdC;
      weekTd[emp.id] = tdC;

      const total = work + credit + specialCredit;
      const delta = total - target;

      cost += Math.abs(delta) * 50 + (delta > 0 ? delta * 25 : 0);

      const p = ed.prefs;
      if (p.maxIwdPerWeek != null && iwdC > p.maxIwdPerWeek) cost += (iwdC - p.maxIwdPerWeek) * 600;
      if (p.maxTdPerWeek != null && tdC > p.maxTdPerWeek) cost += (tdC - p.maxTdPerWeek) * 450;
    }
  }

  const workHours = {};
  const iwdCount = {};
  const tdCount = {};
  for (const emp of ctx.employees){
    workHours[emp.id] = 0;
    iwdCount[emp.id] = 0;
    tdCount[emp.id] = 0;
  }

  for (let i = 0; i < N; i++){
    const iwdEmp = schedule.iwd[i];
    if (iwdEmp){
      workHours[iwdEmp] += SHIFT.IWD.hours;
      iwdCount[iwdEmp] += 1;
    }
    const tdEmp = schedule.td[i];
    if (tdEmp){
      workHours[tdEmp] += SHIFT.TD.hours;
      tdCount[tdEmp] += 1;
    }
  }

  const specialCreditByEmp = {};
  for (const emp of ctx.employees){
    specialCreditByEmp[emp.id] = 0;
  }

  for (let i = 0; i < N; i++){
    const specialDay = ctx.specialDayByDay ? ctx.specialDayByDay[i] : SPECIAL_DAY.NONE;
    if (!specialDay) continue;
    for (const emp of ctx.employees){
      if (schedule.iwd[i] === emp.id || schedule.td[i] === emp.id) continue;
      const ed = ctx.empDataById[emp.id];
      if (ed && ed.blockByDay[i] === BLOCK.FREEH) continue;
      const isForced = Boolean(forcedOff && forcedOff[emp.id] && forcedOff[emp.id][i]);
      specialCreditByEmp[emp.id] += getSpecialDayCredit(specialDay, { forcedOff: isForced });
    }
  }

  let maxDelta = -Infinity;
  let minDelta = Infinity;

  for (const emp of ctx.employees){
    const ed = ctx.empDataById[emp.id];
    if (!ed) { cost += 1_000_000; continue; }

    const total = (workHours[emp.id] || 0)
      + (ed.monthCredit || 0)
      + (specialCreditByEmp[emp.id] || 0);
    const delta = total - (ed.monthDesiredTarget || 0);
    maxDelta = Math.max(maxDelta, delta);
    minDelta = Math.min(minDelta, delta);

    if (delta >= -10 && delta <= 4){
      cost += Math.abs(delta) * 8;
      if (delta > 0) cost += delta * 12;
    } else if (delta >= -20 && delta <= 12){
      cost += Math.abs(delta) * 120;
      if (delta > 0) cost += delta * 50;
    } else {
      cost += Math.abs(delta) * 320;
      if (delta > 0) cost += delta * 200;
    }

    if (delta > 20){
      cost += (delta - 20) * 2000;
    }

    const p = ed.prefs;
    if (p.maxIwdPerMonth != null && (iwdCount[emp.id] || 0) > p.maxIwdPerMonth) cost += ((iwdCount[emp.id] || 0) - p.maxIwdPerMonth) * 900;
    if (p.maxTdPerMonth != null && (tdCount[emp.id] || 0) > p.maxTdPerMonth) cost += ((tdCount[emp.id] || 0) - p.maxTdPerMonth) * 650;
  }

  if (ctx.employees.length >= 2){
    cost += Math.max(0, (maxDelta - minDelta)) * 500;
  }

  for (const emp of ctx.employees){
    const ed = ctx.empDataById[emp.id];
    if (!ed) continue;

    let streak = 0;
    let lastWasWork = false;
    for (let i = 0; i < N; i++){
      const works = (schedule.iwd[i] === emp.id) || (schedule.td[i] === emp.id);
      if (works){
        streak = lastWasWork ? (streak + 1) : 1;
        if (streak >= 2) cost += 500 * (streak - 1);
        lastWasWork = true;
      } else {
        lastWasWork = false;
        streak = 0;
      }
    }

    let lastI = -999;
    const minGap = ed.prefs.iwdMinGap ?? 4;
    for (let i = 0; i < N; i++){
      if (schedule.iwd[i] === emp.id){
        const gap = i - lastI;
        if (gap < minGap) cost += 200 * (minGap - gap);
        lastI = i;
      }

      if ((ed.prefs.extraRestAfterIWD || 0) >= 1 && lastI > -900){
        if (i === lastI + 2){
          const works = (schedule.iwd[i] === emp.id) || (schedule.td[i] === emp.id);
          if (works) cost += 350;
        }
      }
    }
  }

  for (const emp of ctx.employees){
    const ed = ctx.empDataById[emp.id];
    if (!ed || !ed.prefs.preferWorkDows || ed.prefs.preferWorkDows.length === 0) continue;
    for (let i = 0; i < N; i++){
      if (!ed.preferWorkByDay[i]) continue;
      if (ed.blockByDay[i] !== BLOCK.NONE) continue;
      const hasMark = (schedule.iwd[i] === emp.id) || (schedule.td[i] === emp.id) || (forcedOff[emp.id] && forcedOff[emp.id][i]);
      if (!hasMark) cost += 120;
    }
  }

  return cost;
}

function buildMonthSummaryCtx(ctx, schedule, forcedOff){
  const summary = {};
  for (const emp of ctx.employees){
    const ed = ctx.empDataById[emp.id];
    summary[emp.id] = {
      targetHours: round1(ed ? ed.monthDesiredTarget : 0),
      contractTargetHours: round1(ed ? ed.monthContractTarget : 0),
      desiredTargetHours: round1(ed ? ed.monthDesiredTarget : 0),
      creditHours: ed ? ed.monthCredit : 0,
      iwdCount: 0,
      tdCount: 0,
      workHours: 0,
      totalHours: 0,

      balanceStart: round1(ed ? ed.balanceStart : 0),
      balanceAdjust: round1(ed ? ed.balanceAdjust : 0),
      deltaContract: 0,
      deltaDesired: 0,
      balanceEnd: 0,
    };
  }

  for (let i = 0; i < ctx.N; i++){
    const iwdEmp = schedule.iwd[i];
    if (iwdEmp && summary[iwdEmp]){
      summary[iwdEmp].iwdCount += 1;
      summary[iwdEmp].workHours += SHIFT.IWD.hours;
    }

    const tdEmp = schedule.td[i];
    if (tdEmp && summary[tdEmp]){
      summary[tdEmp].tdCount += 1;
      summary[tdEmp].workHours += SHIFT.TD.hours;
    }

    const specialDay = ctx.specialDayByDay ? ctx.specialDayByDay[i] : SPECIAL_DAY.NONE;
    if (specialDay){
      for (const emp of ctx.employees){
        if (schedule.iwd[i] === emp.id || schedule.td[i] === emp.id) continue;
        const ed = ctx.empDataById[emp.id];
        if (ed && ed.blockByDay && ed.blockByDay[i] === BLOCK.FREEH) continue;
        const isForced = Boolean(forcedOff && forcedOff[emp.id] && forcedOff[emp.id][i]);
        summary[emp.id].creditHours += getSpecialDayCredit(specialDay, { forcedOff: isForced });
      }
    }
  }

  for (const emp of ctx.employees){
    const row = summary[emp.id];
    row.creditHours = round1(row.creditHours);
    row.workHours = round1(row.workHours);
    row.totalHours = round1(row.workHours + row.creditHours);
    row.deltaContract = round1(row.totalHours - row.contractTargetHours);
    row.deltaDesired = round1(row.totalHours - row.desiredTargetHours);
    row.balanceEnd = round1(row.balanceStart + row.deltaContract);
  }

  const empById = Object.fromEntries(ctx.employees.map(e => [e.id, e]));
  return { summaryByEmpId: summary, empById };
}

function dedupeMessages(msgs){
  const seen = new Set();
  const out = [];
  for (const m of msgs){
    const key = `${m.type}|${m.title}|${m.details}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  const prio = { danger: 0, warn: 1, info: 2 };
  out.sort((a,b) => (prio[a.type] ?? 9) - (prio[b.type] ?? 9));
  return out;
}

function nowMs(){
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

function yieldToEventLoop(){
  return new Promise(resolve => {
    if (typeof setTimeout === 'function'){
      setTimeout(resolve, 0);
    } else {
      resolve();
    }
  });
}

function throwIfAborted(signal, shouldCancel){
  if (typeof shouldCancel === 'function' && shouldCancel()){
    if (typeof DOMException === 'function'){
      throw new DOMException('Aborted', 'AbortError');
    }
    const err = new Error('Abgebrochen');
    err.name = 'AbortError';
    throw err;
  }
  if (signal && signal.aborted){
    if (typeof DOMException === 'function'){
      throw new DOMException('Aborted', 'AbortError');
    }
    const err = new Error('Abgebrochen');
    err.name = 'AbortError';
    throw err;
  }
}

async function solve(payload, { onProgress, signal, shouldCancel } = {}){
  const { monthKey, days, segments, employees, settings, blocksByEmpId, tdRequiredByDay, specialDayByDay } = payload || {};

  if (!monthKey || !Array.isArray(days) || !Array.isArray(segments) || !Array.isArray(employees)){
    throw new Error('Ungültige Solver-Daten.');
  }

  throwIfAborted(signal, shouldCancel);

  const ctx = buildMonthContext({
    monthKey,
    days,
    segments,
    employees,
    settings: settings || {},
    blocksByEmpId: blocksByEmpId || {},
    tdRequiredByDay: tdRequiredByDay || [],
    specialDayByDay: specialDayByDay || [],
  });

  const messages = [];

  if (employees.length === 0){
    return {
      monthKey,
      days,
      employees,
      empById: {},
      segments,
      schedule: { iwd: Array(days.length).fill(null), td: Array(days.length).fill(null) },
      forcedOff: {},
      plannedTdDays: [],
      omittedTdDays: [],
      monthSummaryByEmpId: {},
      messages: [{ type: 'danger', title: 'Fehler', details: 'Bitte zuerst Mitarbeiter hinzufügen.' }],
    };
  }

  for (let si = 0; si < segments.length; si++){
    const seg = segments[si];
    const segIndices = seg.indices;
    const totalRequired = Number(ctx.segRequiredTotal[si] || 0);

    const baseIwd = segIndices.length * SHIFT.IWD.hours;
    const maxWithTd = baseIwd + segIndices.length * SHIFT.TD.hours;

    const first = days[segIndices[0]];
    const last = days[segIndices[segIndices.length - 1]];
    const label = `${first.label} – ${last.label}`;

    if (totalRequired < baseIwd){
      messages.push({
        type: 'warn',
        title: 'Hinweis (Woche hat zu wenig Soll-Stunden)',
        details: `${label}: Soll-Arbeit ${round1(totalRequired)}h < notwendige IWD-Stunden ${baseIwd}h → Überstunden sind in dieser Woche unvermeidbar.`,
      });
    }

    if (totalRequired > maxWithTd){
      messages.push({
        type: 'warn',
        title: 'Hinweis (Woche hat zu viele Soll-Stunden)',
        details: `${label}: Soll-Arbeit ${round1(totalRequired)}h > Maximum mit TD ${maxWithTd}h → Unterdeckung ist in dieser Woche unvermeidbar.`,
      });
    }
  }

  let bestAttempt = null;
  let bestCost = Infinity;

  const totalAttempts = clamp(Number(settings?.attempts || 10000), 10000, 1000000000);
  const progressEvery = Math.max(50, Math.round(totalAttempts / 200));
  const timeCheckEvery = 50;
  const yieldIntervalMs = 50;

  const t0 = nowMs();
  let lastYield = t0;

  if (typeof onProgress === 'function'){
    onProgress(0, totalAttempts, { bestCost, elapsedMs: 0 });
  }

  for (let i = 0; i < totalAttempts; i++){
    throwIfAborted(signal, shouldCancel);

    const attempt = buildScheduleAttemptCtx(ctx);
    const evCost = evaluateAttemptCtx(ctx, attempt);

    if (evCost < bestCost){
      bestCost = evCost;
      bestAttempt = attempt;
    }

    const shouldProgress = (((i + 1) % progressEvery) === 0 || (i + 1) === totalAttempts);
    let didProgress = false;

    if (typeof onProgress === 'function' && shouldProgress){
      const now = nowMs();
      onProgress(i + 1, totalAttempts, { bestCost, elapsedMs: (now - t0) });
      didProgress = true;
    }

    if (didProgress || ((i + 1) % timeCheckEvery) === 0){
      throwIfAborted(signal, shouldCancel);
      const now = nowMs();
      if (didProgress || (now - lastYield) >= yieldIntervalMs){
        await yieldToEventLoop();
        lastYield = now;
      }
    }
  }

  if (!bestAttempt){
    return {
      monthKey,
      days,
      employees,
      empById: Object.fromEntries(employees.map(e => [e.id, e])),
      segments,
      schedule: { iwd: Array(days.length).fill(null), td: Array(days.length).fill(null) },
      forcedOff: {},
      plannedTdDays: [],
      omittedTdDays: [],
      monthSummaryByEmpId: {},
      messages: [{ type: 'danger', title: 'Fehler', details: 'Konnte keinen Plan erstellen. Bitte Eingaben prüfen.' }],
    };
  }

  const missingIwd = bestAttempt.schedule.iwd.filter(x => !x).length;
  if (missingIwd > 0){
    messages.unshift({
      type: 'danger',
      title: 'IWD konnte nicht vollständig geplant werden',
      details: `${missingIwd} Tag(e) haben keinen IWD. Ursache: zu viele Sperren oder Zwangs-Frei durch vorherige IWD.`,
    });
  }

  const missingReqTd = [];
  for (let i = 0; i < days.length; i++){
    if (ctx.tdRequiredByDay && ctx.tdRequiredByDay[i] && !bestAttempt.schedule.td[i]){
      missingReqTd.push(days[i].label);
    }
  }
  if (missingReqTd.length > 0){
    messages.unshift({
      type: 'danger',
      title: 'Pflicht-TD konnte nicht vollständig geplant werden',
      details: `${missingReqTd.length} Tag(e) sind als „TD Pflicht“ markiert, aber konnten nicht besetzt werden. Prüfe Sperren/Urlaub/WF an diesen Tagen.`,
    });
  }

  const monthSummary = buildMonthSummaryCtx(ctx, bestAttempt.schedule, bestAttempt.forcedOff);

  return {
    monthKey,
    days,
    segments,
    employees,
    empById: monthSummary.empById,
    schedule: bestAttempt.schedule,
    forcedOff: bestAttempt.forcedOff,
    plannedTdDays: bestAttempt.plannedTdDays || [],
    omittedTdDays: bestAttempt.omittedTdDays || [],
    monthSummaryByEmpId: monthSummary.summaryByEmpId,
    messages: dedupeMessages(messages),
    generatedAt: new Date().toISOString(),
    bestCost,
    attemptsUsed: totalAttempts,
    settings: {
      attempts: totalAttempts,
      preferGaps: Boolean(settings?.preferGaps),
    },
  };
}

if (typeof self !== 'undefined'){
  const inlineHelperFns = [
    clamp,
    round1,
    normalizeSpecialDay,
    defaultEmpPrefs,
    sanitizePrefs,
    balanceMonthlyAdjustment,
    getBlockFromMap,
    buildMonthContext,
    blockStageAllows,
    isEmployeeAvailableCtx,
    countAvailableForDayCtx,
    selectTdDaysWithOmissionsCtx,
    scoreIwdCtx,
    scoreTdCtx,
    chooseEmployeeForShiftCtx,
    chooseTdCount,
    buildScheduleAttemptCtx,
    evaluateAttemptCtx,
    buildMonthSummaryCtx,
    dedupeMessages,
    nowMs,
    yieldToEventLoop,
    throwIfAborted,
  ];

  const getInlineWorkerSource = () => {
    const helpersSource = inlineHelperFns.map(fn => fn.toString()).join('\n\n');
    return [
      `const BLOCK = ${JSON.stringify(BLOCK)};`,
      `const SHIFT = ${JSON.stringify(SHIFT)};`,
      `const SPECIAL_DAY = ${JSON.stringify(SPECIAL_DAY)};`,
      '',
      helpersSource,
      '',
      solve.toString(),
    ].join('\n');
  };

  self.DienstplanSolver = { solve, getInlineWorkerSource };
  self.solve = solve;
}
