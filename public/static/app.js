// Relative date formatting
function relativeDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = target - today;
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 6) return d.toLocaleDateString('en-US', { weekday: 'long' });
  if (diffDays < 0 && diffDays >= -6) return Math.abs(diffDays) + 'd ago';
  if (diffDays < -6 && diffDays >= -30) return Math.abs(Math.round(diffDays / 7)) + 'w ago';
  if (diffDays > 6 && diffDays <= 30) return 'In ' + Math.round(diffDays / 7) + 'w';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Color-code and format dates
function formatDates() {
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('.ep-date[data-date]').forEach(el => {
    const d = el.dataset.date;
    el.textContent = relativeDate(d);
    el.title = d; // tooltip shows actual date
    el.classList.remove('text-base-content/50', 'text-primary', 'font-semibold', 'text-warning');
    if (d === today) {
      el.classList.add('text-primary', 'font-semibold');
    } else if (d > today) {
      el.classList.add('text-warning');
    } else {
      el.classList.add('text-base-content/50');
    }
  });
}
formatDates();

// Watch/unwatch via fetch (no page reload, no history entry)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.watch-btn');
  if (!btn) return;
  e.preventDefault();

  const showId = parseInt(btn.dataset.show);
  const season = parseInt(btn.dataset.season);
  const episode = parseInt(btn.dataset.episode);
  const currentlyWatched = btn.dataset.watched === '1';
  const newWatched = !currentlyWatched;

  btn.disabled = true;
  btn.textContent = '…';

  try {
    const res = await fetch('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_id: showId, season, episode, watched: newWatched }),
    });

    if (res.ok) {
      const item = btn.closest('.episode-item');
      if (newWatched) {
        item.classList.add('watched');
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-ghost');
        btn.textContent = '✕';
        btn.dataset.watched = '1';
      } else {
        item.classList.remove('watched');
        btn.classList.remove('btn-ghost');
        btn.classList.add('btn-primary');
        btn.textContent = '✓';
        btn.dataset.watched = '0';
      }

      // Update season watched count if on show page
      const card = item.closest('.card');
      if (card) {
        const countEl = card.querySelector('.watched-count');
        if (countEl) {
          const watched = card.querySelectorAll('.episode-item.watched').length;
          const total = card.querySelectorAll('.episode-item').length;
          countEl.textContent = watched + '/' + total + ' watched';
        }
      }
    } else {
      btn.textContent = '!';
    }
  } catch {
    btn.textContent = '!';
  }
  btn.disabled = false;
});

// Mark all episodes in a season watched/unwatched
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.season-watch-all-btn');
  if (!btn) return;
  e.preventDefault();

  const showId = parseInt(btn.dataset.show);
  const season = parseInt(btn.dataset.season);
  const currentlyAllWatched = btn.dataset.watched === '1';
  const newWatched = !currentlyAllWatched;

  btn.disabled = true;
  btn.textContent = '…';

  const card = btn.closest('.card');
  const episodeBtns = card ? card.querySelectorAll('.watch-btn') : [];
  const requests = Array.from(episodeBtns).map(epBtn => {
    const ep = parseInt(epBtn.dataset.episode);
    return fetch('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_id: showId, season, episode: ep, watched: newWatched }),
    });
  });

  try {
    await Promise.all(requests);
    // Update each episode row
    episodeBtns.forEach(epBtn => {
      const item = epBtn.closest('.episode-item');
      if (newWatched) {
        item.classList.add('watched');
        epBtn.classList.remove('btn-primary');
        epBtn.classList.add('btn-ghost');
        epBtn.textContent = '✕';
        epBtn.dataset.watched = '1';
      } else {
        item.classList.remove('watched');
        epBtn.classList.remove('btn-ghost');
        epBtn.classList.add('btn-primary');
        epBtn.textContent = '✓';
        epBtn.dataset.watched = '0';
      }
    });
    // Update count and button state
    const countEl = card ? card.querySelector('.watched-count') : null;
    if (countEl) {
      const total = episodeBtns.length;
      countEl.textContent = (newWatched ? total : 0) + '/' + total + ' watched';
    }
    btn.textContent = newWatched ? 'Unmark all' : 'Mark all';
    btn.dataset.watched = newWatched ? '1' : '0';
    btn.classList.toggle('btn-outline', !newWatched);
    btn.classList.toggle('btn-primary', !newWatched);
    btn.classList.toggle('btn-ghost', newWatched);
  } catch {
    btn.textContent = '!';
  }
  btn.disabled = false;
});

// Delete-show confirmation: intercept the .delete-form submit (kept out of an
// inline handler since the ui renderer escapes inline scripts).
document.addEventListener('submit', (e) => {
  const form = e.target.closest('.delete-form');
  if (form && !confirm('Delete this show and all its episodes? This cannot be undone.')) {
    e.preventDefault();
  }
});

// /shows client-side title filter: hide rows whose data-title doesn't match.
(function () {
  const filter = document.getElementById('shows-filter');
  if (!filter) return;
  const empty = document.getElementById('shows-empty');
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.show-row').forEach((row) => {
      const match = (row.dataset.title || '').includes(q);
      row.classList.toggle('hidden', !match);
      if (match) visible++;
    });
    if (empty) empty.classList.toggle('hidden', visible > 0);
  });
})();

// Refresh-all progress banner: when a background refresh is running (the banner
// is server-rendered visible after the POST redirect), poll /api/refresh-status
// and update the count. When the run finishes, reload once to show fresh data.
(function () {
  const banner = document.getElementById('refresh-banner');
  if (!banner || banner.classList.contains('hidden')) return; // nothing running
  const text = document.getElementById('refresh-banner-text');

  const timer = setInterval(async () => {
    try {
      const res = await fetch('/api/refresh-status', { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const s = await res.json();
      if (s.running) {
        if (text) text.textContent = 'Refreshing ' + s.refreshed + '/' + (s.total || '…');
      } else {
        clearInterval(timer);
        location.reload(); // show the freshly-refreshed data
      }
    } catch {
      /* transient — keep polling */
    }
  }, 1500);
})();
