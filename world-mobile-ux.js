(() => {
    'use strict';

    const root = document.documentElement;
    let raf = 0;
    let baselineHeight = 0;
    let lastKeyboardState = false;

    const isEditable = el => !!el && (
        el.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]')
    );

    function isTouchLayout() {
        const coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
        return coarse && Math.min(window.screen?.width || innerWidth, window.screen?.height || innerHeight) <= 1366;
    }

    function updateViewport() {
        raf = 0;
        const vv = window.visualViewport;
        const visibleHeight = Math.max(280, Math.round(vv?.height || innerHeight || document.documentElement.clientHeight || 0));
        const visibleWidth = Math.max(280, Math.round(vv?.width || innerWidth || document.documentElement.clientWidth || 0));
        const top = Math.max(0, Math.round(vv?.offsetTop || 0));
        const left = Math.max(0, Math.round(vv?.offsetLeft || 0));
        const layoutHeight = Math.max(innerHeight || 0, document.documentElement.clientHeight || 0, visibleHeight);

        if (!baselineHeight || visibleHeight > baselineHeight || !isEditable(document.activeElement)) {
            baselineHeight = Math.max(baselineHeight, visibleHeight);
            if (!isEditable(document.activeElement)) baselineHeight = layoutHeight;
        }

        const referenceHeight = Math.max(layoutHeight, baselineHeight || layoutHeight);
        const keyboardHeight = Math.max(0, referenceHeight - visibleHeight - top);
        const focusedEditable = isEditable(document.activeElement);
        const keyboardOpen = focusedEditable && keyboardHeight > 110;

        root.style.setProperty('--nv-mobile-vh', `${visibleHeight}px`);
        root.style.setProperty('--nv-mobile-vw', `${visibleWidth}px`);
        root.style.setProperty('--nv-mobile-vv-top', `${top}px`);
        root.style.setProperty('--nv-mobile-vv-left', `${left}px`);
        root.style.setProperty('--nv-mobile-keyboard', `${keyboardHeight}px`);
        root.classList.toggle('nv-mobile-keyboard-open', keyboardOpen);

        if (document.body?.classList.contains('nv-world-editor-modern')) {
            document.body.classList.toggle('nv-touch-layout', isTouchLayout());
            if (keyboardOpen) document.body.classList.remove('nv-sidebar-open', 'nv-mobile-actions-open');
        }

        if (keyboardOpen && !lastKeyboardState) ensureFocusedControlVisible();
        lastKeyboardState = keyboardOpen;
    }

    function queueViewportUpdate() {
        if (raf) return;
        raf = requestAnimationFrame(updateViewport);
    }

    function ensureFocusedControlVisible() {
        const active = document.activeElement;
        if (!isEditable(active)) return;
        setTimeout(() => {
            try { active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch {}
        }, 90);
    }

    function onFocusIn(event) {
        if (!isEditable(event.target)) return;
        queueViewportUpdate();
        setTimeout(queueViewportUpdate, 80);
        setTimeout(queueViewportUpdate, 260);
        setTimeout(ensureFocusedControlVisible, 320);
    }

    function onFocusOut() {
        setTimeout(() => {
            baselineHeight = 0;
            queueViewportUpdate();
        }, 100);
    }

    function init() {
        updateViewport();
        window.addEventListener('resize', queueViewportUpdate, { passive: true });
        window.addEventListener('orientationchange', () => {
            baselineHeight = 0;
            queueViewportUpdate();
            setTimeout(queueViewportUpdate, 120);
            setTimeout(queueViewportUpdate, 420);
        }, { passive: true });
        window.visualViewport?.addEventListener('resize', queueViewportUpdate, { passive: true });
        window.visualViewport?.addEventListener('scroll', queueViewportUpdate, { passive: true });
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('focusout', onFocusOut, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
