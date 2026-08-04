(() => {
  'use strict';

  const categoryMap = {
    home: ['.command-panel', '.quick-actions'],
    smart: ['.smart-core-panel', '.vision-panel'],
    adjust: ['.tools', '.transform'],
    create: ['.creative-panel', '#object-inspector', '.layers-panel'],
    ai: ['#ai-studio'],
    export: ['.export']
  };

  function initProMobileUI() {
    const main = document.querySelector('.app-shell > main');
    const workspace = main?.querySelector('.workspace');
    const oldTabs = document.getElementById('studio-tabs');
    const modeToolbar = document.getElementById('mode-toolbar');
    if (!main || !workspace || !oldTabs || !modeToolbar) return;

    document.body.classList.add('photoia-pro-ui');
    main.classList.add('pro-stage');

    const allPanels = [...main.querySelectorAll(':scope > section.panel')];
    const toolPanels = allPanels.filter(panel => panel !== workspace);

    const stage = document.createElement('div');
    stage.className = 'pro-editor-stage';
    main.insertBefore(stage, main.firstChild);
    stage.appendChild(workspace);

    const sheet = document.createElement('aside');
    sheet.className = 'pro-tool-sheet';
    sheet.id = 'pro-tool-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="pro-sheet-head">
        <div><small>PHOTO IA</small><strong id="pro-sheet-title">Herramientas</strong></div>
        <button id="pro-sheet-close" type="button" aria-label="Cerrar panel">×</button>
      </div>
      <div id="pro-sheet-content" class="pro-sheet-content"></div>`;
    document.body.appendChild(sheet);
    const sheetContent = sheet.querySelector('#pro-sheet-content');
    toolPanels.forEach(panel => {
      panel.classList.add('pro-tool-panel');
      sheetContent.appendChild(panel);
    });

    const leftDock = document.createElement('nav');
    leftDock.className = 'pro-dock pro-dock-left';
    leftDock.setAttribute('aria-label', 'Secciones de PHOTO IA');
    document.body.appendChild(leftDock);

    const rightDock = document.createElement('nav');
    rightDock.className = 'pro-dock pro-dock-right';
    rightDock.setAttribute('aria-label', 'Herramientas del lienzo');
    document.body.appendChild(rightDock);

    const navButtons = [...oldTabs.querySelectorAll('[data-studio-tab]')];
    const navTitle = {
      home: 'Inicio', smart: 'Smart', adjust: 'Ajustes', create: 'Crear', ai: 'Alienware', export: 'Guardar'
    };
    navButtons.forEach(button => {
      button.classList.remove('studio-tab');
      button.classList.add('pro-dock-item');
      button.querySelector('small')?.classList.add('pro-dock-label');
      leftDock.appendChild(button);
    });
    oldTabs.remove();

    const modeButtons = [...modeToolbar.querySelectorAll('[data-canvas-mode]')];
    modeButtons.forEach(button => {
      button.classList.remove('mode-tool');
      button.classList.add('pro-dock-item', 'pro-mode-item');
      button.querySelector('small')?.classList.add('pro-dock-label');
      rightDock.appendChild(button);
    });
    modeToolbar.remove();

    const utility = document.createElement('div');
    utility.className = 'pro-dock-utility';
    utility.innerHTML = `
      <button class="pro-dock-item" id="pro-compare" type="button" disabled><span>◐</span><small class="pro-dock-label">Antes/Después</small></button>
      <button class="pro-dock-item" id="pro-new-photo" type="button" disabled><span>📷</span><small class="pro-dock-label">Nueva foto</small></button>`;
    rightDock.appendChild(utility);

    const compareProxy = utility.querySelector('#pro-compare');
    const newPhotoProxy = utility.querySelector('#pro-new-photo');
    const originalCompare = document.getElementById('compare-btn');
    const originalNew = document.getElementById('new-photo-btn');
    compareProxy.addEventListener('click', () => originalCompare?.click());
    newPhotoProxy.addEventListener('click', () => originalNew?.click());
    const syncProxyState = () => {
      compareProxy.disabled = originalCompare?.disabled ?? true;
      newPhotoProxy.disabled = originalNew?.disabled ?? true;
    };
    new MutationObserver(syncProxyState).observe(originalCompare, { attributes: true, attributeFilter: ['disabled'] });
    new MutationObserver(syncProxyState).observe(originalNew, { attributes: true, attributeFilter: ['disabled'] });
    syncProxyState();

    const categoryByPanel = new Map();
    Object.entries(categoryMap).forEach(([category, selectors]) => {
      selectors.forEach(selector => {
        sheetContent.querySelectorAll(selector).forEach(panel => {
          panel.dataset.studioCategory = category;
          categoryByPanel.set(panel, category);
        });
      });
    });
    toolPanels.forEach(panel => {
      if (!categoryByPanel.has(panel)) panel.dataset.studioCategory = 'home';
    });

    let activeCategory = null;
    let collapseTimer = null;
    const expandTemporarily = button => {
      document.querySelectorAll('.pro-dock-item.expanded').forEach(item => item.classList.remove('expanded'));
      button.classList.add('expanded');
      clearTimeout(collapseTimer);
      collapseTimer = setTimeout(() => button.classList.remove('expanded'), 2600);
    };

    function openCategory(category, trigger) {
      activeCategory = category;
      const hasVisible = toolPanels.some(panel => panel.dataset.studioCategory === category);
      toolPanels.forEach(panel => { panel.hidden = panel.dataset.studioCategory !== category; });
      navButtons.forEach(button => button.classList.toggle('active', button.dataset.studioTab === category));
      const title = sheet.querySelector('#pro-sheet-title');
      if (title) title.textContent = navTitle[category] || 'Herramientas';
      sheet.hidden = !hasVisible;
      document.body.classList.toggle('pro-sheet-open', hasVisible);
      if (trigger) expandTemporarily(trigger);
      localStorage.setItem('photoia-active-studio-tab', category);
    }

    navButtons.forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        const category = button.dataset.studioTab;
        if (!sheet.hidden && activeCategory === category) {
          sheet.hidden = true;
          document.body.classList.remove('pro-sheet-open');
          button.classList.remove('active');
          expandTemporarily(button);
          return;
        }
        openCategory(category, button);
      });
    });

    modeButtons.forEach(button => {
      button.addEventListener('click', () => {
        modeButtons.forEach(item => item.classList.toggle('active', item === button));
        expandTemporarily(button);
      });
    });

    utility.querySelectorAll('.pro-dock-item').forEach(button => button.addEventListener('click', () => expandTemporarily(button)));

    sheet.querySelector('#pro-sheet-close')?.addEventListener('click', () => {
      sheet.hidden = true;
      document.body.classList.remove('pro-sheet-open');
      navButtons.forEach(button => button.classList.remove('active'));
    });

    document.addEventListener('pointerdown', event => {
      if (sheet.hidden || window.innerWidth > 900) return;
      if (sheet.contains(event.target) || leftDock.contains(event.target) || rightDock.contains(event.target)) return;
      sheet.hidden = true;
      document.body.classList.remove('pro-sheet-open');
      navButtons.forEach(button => button.classList.remove('active'));
    });

    document.addEventListener('photoia:image-loaded', () => {
      syncProxyState();
      sheet.hidden = true;
      document.body.classList.remove('pro-sheet-open');
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });

    const saved = localStorage.getItem('photoia-active-studio-tab');
    if (saved && categoryMap[saved]) activeCategory = saved;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProMobileUI, { once: true });
  } else {
    initProMobileUI();
  }
})();
