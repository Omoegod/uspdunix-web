(function () {
  function normalizePath(path) {
    if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
    return path;
  }

  function markActiveNav() {
    const path = normalizePath(window.location.pathname);
    const hash = window.location.hash.replace('#', '');
    document.querySelectorAll('.side-nav a[href]').forEach(function (link) {
      let url;
      try {
        url = new URL(link.getAttribute('href'), window.location.origin);
      } catch (_) {
        return;
      }
      const linkPath = normalizePath(url.pathname);
      const linkHash = url.hash.replace('#', '');
      const pathMatch = linkPath === path;
      const hashMatch = !linkHash || linkHash === hash;
      if (pathMatch && hashMatch) {
        link.classList.add('active');
        const section = link.closest('details.nav-section');
        if (section) section.open = true;
      }
    });
  }

  window.showRfPanel = function (name, pushHash) {
    if (pushHash !== false && window.location.pathname.indexOf('/expert/rf-config') !== -1) {
      const next = '#' + name;
      if (window.location.hash !== next) {
        history.replaceState(null, '', next);
      }
    }
    document.querySelectorAll('.rf-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + name);
    });
    document.querySelectorAll('.side-nav a[data-rf-panel]').forEach(function (a) {
      a.classList.toggle('active', a.dataset.rfPanel === name);
    });
    markActiveNav();
  };

  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[data-rf-panel]');
    if (!link) return;
    if (normalizePath(window.location.pathname) === '/expert/rf-config') {
      e.preventDefault();
      showRfPanel(link.dataset.rfPanel);
    }
  });

  window.addEventListener('hashchange', function () {
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById('panel-' + hash)) {
      showRfPanel(hash, false);
    }
    markActiveNav();
  });

  document.addEventListener('DOMContentLoaded', function () {
    const path = normalizePath(window.location.pathname);
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById('panel-' + hash) && !document.getElementById('panel-' + hash).classList.contains('rf-panel-hidden')) {
      showRfPanel(hash, false);
    } else if (path === '/expert/rf-config') {
      showRfPanel('conf', false);
    }
    markActiveNav();
  });
})();
