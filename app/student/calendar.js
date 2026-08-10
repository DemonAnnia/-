// ---- Календарь: чистое вычислительное ядро (без побочных эффектов, без базы) ----
// Ничего не хранится как готовый список занятий — расписание на любой период
// всегда вычисляется из правил (scheduleRules) + каникул (scheduleBreaks) +
// исключений (scheduleExceptions). См. calendar-architecture.md.

function fmtDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
/** ISO-строку "2026-08-15" превращает в привычный вид "15.08.2026" — только для отображения. */
function fmtDateRu(dateStr){
  if(!dateStr) return '';
  const parts = dateStr.split('-');
  if(parts.length !== 3) return dateStr;
  const [y,m,d] = parts;
  return `${d}.${m}.${y}`;
}

/**
 * rules:      [{ id, dayOfWeek(0-6), time:"16:00", startDate:"YYYY-MM-DD", endDate: string|null, subjectId }]
 * exceptions: [{ date:"YYYY-MM-DD", type:'cancelled'|'moved'|'breakResolution', newDate?, newTime?, occurs? }]
 * breaks:     [{ id, from:"YYYY-MM-DD", to:"YYYY-MM-DD", label? }]
 * dateFrom/dateTo: "YYYY-MM-DD" (включительно)
 *
 * Возвращает массив { date, time, subjectId, source: 'rule'|'moved', originalDate?, status: 'confirmed'|'pending'|'skipped', breakLabel? }
 * status='skipped' — решённое отсутствие внутри каникул (occurs:false), status='pending' — «уточняется».
 * Отменённые (cancelled) занятия вне каникул в результат вообще не попадают — их как будто не было.
 */
function getLessons(rules, exceptions, breaks, dateFrom, dateTo){
  const exceptionByDate = {};
  const movedInto = {};
  (exceptions||[]).forEach(ex => {
    exceptionByDate[ex.date] = ex;
    if(ex.type === 'moved' && ex.newDate){
      movedInto[ex.newDate] = { ...ex, originalDate: ex.date };
    }
  });

  const results = [];
  const cur = new Date(dateFrom + 'T00:00:00');
  const end = new Date(dateTo + 'T00:00:00');

  while(cur <= end){
    const dateStr = fmtDate(cur);
    const dow = cur.getDay();

    let candidate = null;
    const rule = (rules||[]).find(r => r.dayOfWeek === dow
      && dateStr >= r.startDate
      && (!r.endDate || dateStr <= r.endDate));
    if(rule){
      candidate = { date: dateStr, time: rule.time, subjectId: rule.subjectId || null, ruleId: rule.id, source: 'rule' };
    }
    if(movedInto[dateStr]){
      const mv = movedInto[dateStr];
      candidate = { date: dateStr, time: mv.newTime, subjectId: mv.subjectId || null, source: 'moved', originalDate: mv.originalDate };
    }

    if(!candidate){ cur.setDate(cur.getDate()+1); continue; }

    const activeBreak = (breaks||[]).find(b => dateStr >= b.from && dateStr <= b.to);
    if(activeBreak){
      const ex = exceptionByDate[dateStr];
      if(ex && ex.type === 'breakResolution' && ex.occurs === true){
        candidate.status = 'confirmed';
      } else if(ex && ex.type === 'breakResolution' && ex.occurs === false){
        candidate.status = 'skipped';
      } else {
        candidate.status = 'pending';
      }
      candidate.breakLabel = activeBreak.label || null;
    } else {
      const ex = exceptionByDate[dateStr];
      if(ex && (ex.type === 'cancelled' || ex.type === 'moved')){
        cur.setDate(cur.getDate()+1);
        continue;
      }
      candidate.status = 'confirmed';
    }

    results.push(candidate);
    cur.setDate(cur.getDate()+1);
  }
  return results;
}

/** Ближайшее занятие от сегодняшней даты включительно (со статусом как есть, включая 'pending'). */
function getNextLesson(rules, exceptions, breaks, fromDateStr, daysAhead){
  daysAhead = daysAhead || 60;
  const from = new Date(fromDateStr + 'T00:00:00');
  const to = new Date(from);
  to.setDate(to.getDate() + daysAhead);
  const list = getLessons(rules, exceptions, breaks, fmtDate(from), fmtDate(to));
  return list.length ? list[0] : null;
}

/**
 * Все нерешённые вопросы (статус 'pending') на диапазон дат — для одного ученика.
 * Для экрана "Нерешённые вопросы" у тьютора эта функция вызывается на каждого ученика по очереди.
 */
function getUnresolvedQuestions(rules, exceptions, breaks, dateFrom, dateTo){
  return getLessons(rules, exceptions, breaks, dateFrom, dateTo).filter(l => l.status === 'pending');
}

/** Считает, сколько НОВЫХ вопросов появилось между двумя срезами (для тоста после сохранения каникул). */
function countNewPendingQuestions(beforeList, afterList){
  const beforePendingDates = new Set(beforeList.filter(l => l.status === 'pending').map(l => l.date));
  return afterList.filter(l => l.status === 'pending' && !beforePendingDates.has(l.date)).length;
}
