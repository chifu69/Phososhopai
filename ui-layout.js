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

  function initStudioLayout() {
    const main = document.querySelector('.app-shell > main');
    const workspace = main?.querySelector('.workspace');
    const tabs = document.querySelectorAll('[data-studio-tab]');
    const toggle = document.getElementById('studio-panel-toggle');
    if (!main || !workspace || !tabs.length) return;

    const allPanels = [...main.querySelectorAll(':scope > section.panel')];
    const toolPanels = allPanels.filter(panel => panel !== workspace);

    const editorColumn = document.createElement('div');
    editorColumn.className = 'studio-editor-column';
    const toolsColumn = document.createElement('div');
    toolsColumn.className = 'studio-tools-column';
    toolsColumn.id = 'studio-tools-column';

    main.classList.add('studio-layout');
    main.insertBefore(editorColumn, main.firstChild);
    main.appendChild(toolsColumn);
    editorColumn.appendChild(workspace);
    toolPanels.forEach(panel => toolsColumn.appendChild(panel));

    const categoriesByPanel = new Map();
    Object.entries(categoryMap).forEach(([category, selectors]) => {
      selectors.forEach(selector => {
        toolsColumn.querySelectorAll(selector).forEach(panel => {
          panel.dataset.studioCategory = category;
          categoriesByPanel.set(panel, category);
        });
      });
    });

    toolPanels.forEach(panel => {
      if (!categoriesByPanel.has(panel)) panel.dataset.studioCategory = 'home';
      panel.classList.add('studio-tool-panel');
    });

    function showCategory(category, scroll = false) {
      tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.studioTab === category));
      toolPanels.forEach(panel => {
        panel.hidden = panel.dataset.studioCategory !== category;
      });
      toolsColumn.dataset.activeCategory = category;
      toolsColumn.classList.remove('collapsed');
      toggle?.setAttribute('aria-pressed', 'false');
      if (toggle) toggle.querySelector('span').textContent = '⌄';
      localStorage.setItem('photoia-active-studio-tab', category);
      if (scroll && window.innerWidth < 760) {
        toolsColumn.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    tabs.forEach(tab => tab.addEventListener('click', () => showCategory(tab.dataset.studioTab, true)));

    toggle?.addEventListener('click', () => {
      const collapsed = toolsColumn.classList.toggle('collapsed');
      toggle.setAttribute('aria-pressed', String(collapsed));
      toggle.querySelector('span').textContent = collapsed ? '⌃' : '⌄';
      if (collapsed && window.innerWidth < 760) workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const saved = localStorage.getItem('photoia-active-studio-tab');
    showCategory(categoryMap[saved] ? saved : 'home');

    // Keep the canvas visible after a photo is opened or a tool is selected.
    document.addEventListener('photoia:image-loaded', () => workspace.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStudioLayout, { once: true });
  } else {
    initStudioLayout();
  }
})();
