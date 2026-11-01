/**
 * index.js
 * - Meet the devs section
 */

document.addEventListener('DOMContentLoaded', function () {

    // True whenever the devs section is a horizontal strip (matches the 950px CSS breakpoint)
    function isMobile() { return window.innerWidth <= 950; }

    // Two cards in view from 769px to 950px, one at 768px and below
    function cardsPerView() { return window.innerWidth > 768 ? 2 : 1; }

    // Mobile infinite scroll strip
    function setupInfiniteScroll() {
        const grid = document.querySelector('.devs-grid');
        if (!grid) return;

        grid.querySelectorAll('.dev-card--clone').forEach(c => c.remove());
        if (!isMobile()) return;

        const originals = Array.from(grid.querySelectorAll('.dev-card'));
        if (originals.length < 2) return;

        // Append clones at end, prepend in reverse at start
        originals.forEach(card => {
            const clone = card.cloneNode(true);
            clone.classList.add('dev-card--clone');
            grid.appendChild(clone);
        });

        originals.slice().reverse().forEach(card => {
            const clone = card.cloneNode(true);
            clone.classList.add('dev-card--clone');
            grid.insertBefore(clone, grid.firstChild);
        });

        let baseScroll = 0;
        let setWidth   = 0;
        let jumping    = false;

        // scrollLeft at which a card sits in its snap position:
        // centered when one card is in view, left-aligned (after grid padding) when two are
        function snapLeftFor(card) {
            const gridRect = grid.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            const cardX    = cardRect.left - gridRect.left + grid.scrollLeft; // position in scroll content

            if (cardsPerView() === 1) {
                return cardX + cardRect.width / 2 - grid.clientWidth / 2;
            }
            return cardX - parseFloat(getComputedStyle(grid).paddingLeft);
        }

        function measure() {
            const gap = originals.length > 1
                ? originals[1].offsetLeft - originals[0].offsetLeft - originals[0].offsetWidth
                : 12;
            setWidth   = originals.length * (originals[0].offsetWidth + gap);
            baseScroll = snapLeftFor(originals[0]);
        }

        function jumpToBase() {
            measure();
            grid.style.scrollBehavior = 'auto';
            grid.scrollLeft = baseScroll;
            requestAnimationFrame(() => { grid.style.scrollBehavior = ''; });
        }

        requestAnimationFrame(jumpToBase);

        // Jump to equivalent position after scrolling into the clone zone.
        // scrollend fires after css snap settles, eliminating the left-scroll pause.
        // Falls back to a short timeout on older browsers.
        function handleJump() {
            if (jumping) return;
            const sl       = grid.scrollLeft;
            const cardStep = setWidth / originals.length; // one card + one gap
            let target = null;
            // Fire only when scrolled into the clone zone:
            // left of card 1 center by more than half a card step,
            // or right of card 8 center by more than half a card step
            if (sl < baseScroll - cardStep * 0.5) target = sl + setWidth;
            else if (sl > baseScroll + setWidth - cardStep * 0.5) target = sl - setWidth;
            if (target !== null) {
                jumping = true;
                grid.style.scrollBehavior = 'auto';
                grid.scrollLeft = target;
                requestAnimationFrame(() => {
                    grid.style.scrollBehavior = '';
                    jumping = false;
                });
            }
        }

        if ('onscrollend' in grid) {
            grid.addEventListener('scrollend', handleJump);
        } else {
            let t;
            grid.addEventListener('scroll', () => {
                if (jumping) return;
                clearTimeout(t);
                t = setTimeout(handleJump, 50);
            });
        }

        // Mouse drag with manual snap on release
        let isDragging    = false;
        let dragStartX    = 0;
        let scrollAtDrag  = 0;

        grid.addEventListener('mousedown', e => {
            isDragging   = true;
            dragStartX   = e.clientX;
            scrollAtDrag = grid.scrollLeft;
            grid.style.userSelect  = 'none';
            grid.style.scrollSnapType = 'none'; // disable snap during drag
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            grid.scrollLeft = scrollAtDrag - (e.clientX - dragStartX);
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            grid.style.userSelect = '';
            grid.style.scrollSnapType = ''; // restore snap

            // Manually snap to nearest card center
            const allCards = Array.from(grid.querySelectorAll('.dev-card'));
            let closest = allCards[0];
            let closestDist = Infinity;
            allCards.forEach(card => {
                const dist = Math.abs(snapLeftFor(card) - grid.scrollLeft);
                if (dist < closestDist) { closestDist = dist; closest = card; }
            });

            grid.scrollTo({ left: snapLeftFor(closest), behavior: 'smooth' });
        });
    }

    // Height init
    function initDevCards() {
        // Only measure originals — clones are mobile-only and don't need expand logic
        document.querySelectorAll('.dev-card:not(.dev-card--clone)').forEach(card => {
            const panel = card.querySelector('.dev-card-panel');
            if (!panel) return;

            card.style.height  = '';
            panel.style.height = '';

            const body           = panel.querySelector('.dev-panel-body');
            const expandedHeight = panel.scrollHeight;
            let   collapsedHeight;

            if (body) {
                const saved        = body.style.display;
                body.style.display = 'none';
                collapsedHeight    = panel.scrollHeight;
                body.style.display = saved;
            } else {
                collapsedHeight = expandedHeight;
            }

            card._expandedHeight  = expandedHeight;
            card._collapsedHeight = collapsedHeight;

            if (!isMobile()) {
                card.style.height  = collapsedHeight + 'px';
                panel.style.height = collapsedHeight + 'px';
            }
        });
    }

    // Init and resize
    setupInfiniteScroll();
    initDevCards();

    let _resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            setupInfiniteScroll();
            initDevCards();
        }, 200);
    });

    // Desktop Hover Expand

    // Direct listeners on originals only, clones are mobile-only
    // and mobile hover is intentionally disabled.

    let openCard        = null;
    let pendingZRestore = null;

    function closeCard(card, immediate) {
        const panel = card.querySelector('.dev-card-panel');

        if (pendingZRestore && panel) {
            panel.removeEventListener('transitionend', pendingZRestore);
            pendingZRestore = null;
        }

        if (panel) panel.style.height = card._collapsedHeight + 'px';

        if (immediate) {
            card.classList.remove('is-open');
        } else {
            pendingZRestore = function restoreZ(e) {
                if (e.propertyName !== 'height') return;
                card.classList.remove('is-open');
                panel?.removeEventListener('transitionend', pendingZRestore);
                pendingZRestore = null;
            };
            panel?.addEventListener('transitionend', pendingZRestore);
        }
    }

    document.querySelectorAll('.dev-card:not(.dev-card--clone)').forEach(card => {

        card.addEventListener('mouseenter', () => {
            if (isMobile()) return;

            if (openCard && openCard !== card) closeCard(openCard, true);

            const panel = card.querySelector('.dev-card-panel');
            if (pendingZRestore && panel) {
                panel.removeEventListener('transitionend', pendingZRestore);
                pendingZRestore = null;
            }

            openCard = card;
            card.classList.add('is-open');
            if (panel && card._expandedHeight) panel.style.height = card._expandedHeight + 'px';
        });

        card.addEventListener('mouseleave', () => {
            if (isMobile()) return;
            if (openCard !== card) return;
            closeCard(card, false);
        });

        // Touch tap on larger screens, toggles the hover expand
        card.addEventListener('pointerup', (e) => {
            if (e.pointerType !== 'touch') return;
            if (isMobile()) return;

            // Tapping an open card closes it
            if (openCard === card) {
                closeCard(card, false);
                openCard = null;
                return;
            }

            // Close any other open card and open this one
            if (openCard && openCard !== card) closeCard(openCard, true);

            const panel = card.querySelector('.dev-card-panel');
            if (pendingZRestore && panel) {
                panel.removeEventListener('transitionend', pendingZRestore);
                pendingZRestore = null;
            }

            openCard = card;
            card.classList.add('is-open');
            if (panel && card._expandedHeight) panel.style.height = card._expandedHeight + 'px';
        });
    });
});