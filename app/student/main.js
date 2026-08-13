function renderStudentView(student, materials, profile){
  lastStudent = student; lastMaterials = materials || []; lastProfile = profile;
  const root = document.getElementById('appRoot');
  document.getElementById('loadingScreen').style.display = 'none';
  if(!student){
    root.style.display = 'none';
    document.getElementById('notFoundOverlay').style.display = 'flex';
    return;
  }
  document.getElementById('notFoundOverlay').style.display = 'none';
  root.style.display = 'block';
  document.getElementById('headerGreeting').textContent = `👋 Привет, ${student.name}!`;
  renderTutorSwitcher();
  const count = student.completedLessonsCount || 0;
  document.getElementById('lessonCounterPill').innerHTML = count > 0
    ? `<span style="font-size:0.75rem; font-weight:600; background:var(--success-soft); color:var(--success-text); padding:0.2rem 0.5rem; border-radius:999px;">🎉 Уже ${count} занят${count===1?'ие':(count<5?'ия':'ий')} вместе</span>`
    : '';

  const mainArea = document.getElementById('mainArea');
  if(viewSection === 'trainers') mainArea.innerHTML = stubCard('🧠', 'Тренажёры');
  else if(viewSection === 'calendar') mainArea.innerHTML = stubCard('📅', 'Мои занятия');
  else if(viewSection === 'tutorInfo') mainArea.innerHTML = renderTutorSection(profile);
  else if(viewSection === 'settings') mainArea.innerHTML = renderSettingsSection();
  else mainArea.innerHTML = renderLessonSection(student, materials, profile);

  applyTheme();
}
