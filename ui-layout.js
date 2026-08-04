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

    document.body.classList.add('photoia-pro-ui', 'photoia-modern-ui');
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
        <div><small>PHOTO IA 12.3</small><strong id="pro-sheet-title">Herramientas</strong></div>
        <button id="pro-sheet-close" type="button" aria-label="Cerrar panel">×</button>
      </div>
      <div id="pro-create-tools" class="pro-create-tools" hidden>
        <span>Herramientas</span>
      </div>
      <div id="pro-sheet-content" class="pro-sheet-content"></div>`;
    document.body.appendChild(sheet);

    const sheetContent = sheet.querySelector('#pro-sheet-content');
    const createTools = sheet.querySelector('#pro-create-tools');
    toolPanels.forEach(panel => {
      panel.classList.add('pro-tool-panel');
      sheetContent.appendChild(panel);
    });

    const leftDock = document.createElement('nav');
    leftDock.className = 'pro-dock pro-dock-left';
    leftDock.setAttribute('aria-label', 'Herramientas principales de PHOTO IA');
    document.body.appendChild(leftDock);

    const navButtons = [...oldTabs.querySelectorAll('[data-studio-tab]')];
    const navTitle = {
      home: 'Inicio', smart: 'Smart', adjust: 'Ajustes', create: 'Crear', ai: 'Alienware', export: 'Guardar'
    };
    navButtons.forEach(button => {
      button.classList.remove('studio-tab');
      button.classList.add('pro-dock-item', 'pro-nav-item');
      const label = button.querySelector('small');
      label?.classList.add('pro-dock-label');
      button.setAttribute('aria-label', label?.textContent?.trim() || 'Herramienta');
      leftDock.appendChild(button);
    });
    oldTabs.remove();

    const modeButtons = [...modeToolbar.querySelectorAll('[data-canvas-mode]')];
    const eraseButton = modeButtons.find(button => button.dataset.canvasMode === 'erase');
    const createModeButtons = modeButtons.filter(button => button !== eraseButton);

    // Las herramientas manuales aparecen dentro de Crear, debajo de la foto.
    createModeButtons.forEach(button => {
      button.classList.remove('mode-tool', 'active');
      button.classList.add('pro-create-tool');
      const label = button.querySelector('small');
      button.setAttribute('aria-label', label?.textContent?.trim() || 'Herramienta de Crear');
      createTools.appendChild(button);
    });
    modeToolbar.remove();

    // Borrar y Antes/Después viven en el dock izquierdo.
    if (eraseButton) {
      eraseButton.classList.remove('mode-tool');
      eraseButton.classList.add('pro-dock-item', 'pro-erase-item');
      eraseButton.querySelector('small')?.classList.add('pro-dock-label');
      eraseButton.setAttribute('aria-label', 'Borrar');
      leftDock.appendChild(eraseButton);
    }

    const utilities = document.createElement('div');
    utilities.className = 'pro-dock-utility';
    utilities.innerHTML = `
      <button class="pro-dock-item" id="pro-compare" type="button" disabled aria-label="Antes y después">
        <span>◐</span><small class="pro-dock-label">Antes/Después</small>
      </button>`;
    leftDock.appendChild(utilities);

    const compareProxy = utilities.querySelector('#pro-compare');
    const originalCompare = document.getElementById('compare-btn');
    compareProxy.addEventListener('click', () => originalCompare?.click());
    const syncProxyState = () => { compareProxy.disabled = originalCompare?.disabled ?? true; };
    if (originalCompare) {
      new MutationObserver(syncProxyState).observe(originalCompare, { attributes: true, attributeFilter: ['disabled'] });
    }
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
    let tooltipTimer = null;

    const pulseItem = button => {
      document.querySelectorAll('.pro-dock-item.peek').forEach(item => item.classList.remove('peek'));
      button.classList.add('peek');
      clearTimeout(tooltipTimer);
      tooltipTimer = setTimeout(() => button.classList.remove('peek'), 1800);
    };

    const setActiveMode = selected => {
      [...createModeButtons, eraseButton].filter(Boolean).forEach(item => {
        item.classList.toggle('active', item === selected);
      });
    };

    function openCategory(category, trigger) {
      activeCategory = category;
      const hasVisible = toolPanels.some(panel => panel.dataset.studioCategory === category);
      toolPanels.forEach(panel => { panel.hidden = panel.dataset.studioCategory !== category; });
      navButtons.forEach(button => button.classList.toggle('active', button.dataset.studioTab === category));
      createTools.hidden = category !== 'create';
      const title = sheet.querySelector('#pro-sheet-title');
      if (title) title.textContent = navTitle[category] || 'Herramientas';
      sheet.hidden = !hasVisible;
      document.body.classList.toggle('pro-sheet-open', hasVisible);
      if (trigger) pulseItem(trigger);
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
          pulseItem(button);
          return;
        }
        openCategory(category, button);
      });
    });

    createModeButtons.forEach(button => {
      button.addEventListener('click', () => setActiveMode(button));
    });
    eraseButton?.addEventListener('click', () => {
      setActiveMode(eraseButton);
      pulseItem(eraseButton);
    });
    compareProxy.addEventListener('click', () => pulseItem(compareProxy));

    sheet.querySelector('#pro-sheet-close')?.addEventListener('click', () => {
      sheet.hidden = true;
      document.body.classList.remove('pro-sheet-open');
      navButtons.forEach(button => button.classList.remove('active'));
    });

    document.addEventListener('pointerdown', event => {
      if (sheet.hidden || window.innerWidth > 900) return;
      if (sheet.contains(event.target) || leftDock.contains(event.target)) return;
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
