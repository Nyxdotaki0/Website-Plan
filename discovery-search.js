(() => {
    'use strict';

    const configs = {
        explore: { selector: '.explore-search-panel', label: 'Search & filters', title: 'Explore Nullverse', hint: 'Search creations, choose a type, or refine discovery filters.' },
        gallery: { selector: '.gallery-controls', label: 'Search Gallery', title: 'Search Gallery', hint: 'Find artwork or narrow results by sort, rating, and item type.' },
        creators: { selector: '.creators-controls', label: 'Find creators', title: 'Find creators', hint: 'Search people, change discovery mode, or refine creator filters.' }
    };

    let lastFocus = null;

    function init() {
        const page = document.body?.dataset.page;
        const config = configs[page];
        if (!config) return;
        const controls = document.querySelector(config.selector);
        if (!controls || controls.dataset.nvDiscoveryEnhanced === 'true') return;

        controls.dataset.nvDiscoveryEnhanced = 'true';
        controls.classList.add('nv-discovery-controls-source');

        const launcher = document.createElement('div');
        launcher.className = 'nv-discovery-launcher';
        launcher.innerHTML = `<button type="button" aria-haspopup="dialog" aria-expanded="false">${config.label}</button>`;
        controls.parentNode.insertBefore(launcher, controls);

        const modal = document.createElement('div');
        modal.className = 'nv-discovery-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <section class="nv-discovery-dialog" role="dialog" aria-modal="true" aria-label="${config.title}">
                <header class="nv-discovery-modal-head">
                    <div><strong>${config.title}</strong><span>${config.hint}</span></div>
                    <button class="nv-discovery-close" type="button" aria-label="Close search">×</button>
                </header>
                <div class="nv-discovery-dialog-body"></div>
            </section>`;
        document.body.append(modal);
        modal.querySelector('.nv-discovery-dialog-body').append(controls);
        document.body.classList.add('nv-discovery-enhanced');

        const button = launcher.querySelector('button');
        const closeButton = modal.querySelector('.nv-discovery-close');

        const open = () => {
            lastFocus = document.activeElement;
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
            button.setAttribute('aria-expanded', 'true');
            document.body.classList.add('nv-discovery-open');
            requestAnimationFrame(() => {
                const input = controls.querySelector('input[type="search"], input:not([type]), input[type="text"]');
                (input || controls.querySelector('select,button'))?.focus({ preventScroll: true });
            });
        };

        const close = () => {
            if (!modal.classList.contains('open')) return;
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
            button.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('nv-discovery-open');
            try { (lastFocus?.isConnected ? lastFocus : button).focus({ preventScroll: true }); } catch {}
        };

        button.addEventListener('click', open);
        closeButton.addEventListener('click', close);
        modal.addEventListener('pointerdown', event => { if (event.target === modal) close(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('open')) close(); });

        const form = controls.querySelector('form');
        form?.addEventListener('submit', () => setTimeout(close, 0));
    }

    window.addEventListener('load', init, { once: true });
})();
