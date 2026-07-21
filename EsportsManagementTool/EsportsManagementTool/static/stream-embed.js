/**
 * Initialises the Twitch embed on the landing page.
 */

async function initTwitchEmbed() {
    const container = document.getElementById('twitchContainer');
    const indicator = document.getElementById('twitchLiveIndicator');
    if (!container) return;

    try {
        const response = await fetch('/api/twitch-status');
        const data     = await response.json();

        if (!data.embed_type) {
            container.style.display = 'none';
            document.querySelector('.hero-content')?.classList.remove('has-embed');
            return;
        }

        const host   = window.location.hostname;
        const parent = (host === 'localhost' || host === '127.0.0.1')
            ? ['localhost', '127.0.0.1']
            : [host];

        const opts = { width: '100%', height: '100%', parent };

        if (data.is_live) {
            opts.channel = data.embed_id;
            if (indicator) {
                indicator.textContent = '';
                indicator.style.display = 'block';
            }
        } else if (data.embed_type === 'video') {
            opts.video = data.embed_id;
            if (indicator) {
                indicator.textContent = '';
                indicator.style.display = 'block';
            }
        } else {
            opts.channel = data.embed_id;
            if (indicator) {
                indicator.textContent = 'Stockton Esports on Twitch';
                indicator.style.display = 'block';
            }
        }

        new Twitch.Embed('twitchEmbed', opts);
        container.style.display = 'block';
        document.querySelector('.hero-content')?.classList.add('has-embed');

    } catch (err) {
        console.error('Twitch embed error:', err);
        container.style.display = 'none';
    }
}

function waitForTwitchSDK(callback, attempts = 0) {
    if (window.Twitch?.Embed) {
        callback();
    } else if (attempts < 20) {
        setTimeout(() => waitForTwitchSDK(callback, attempts + 1), 250);
    } else {
        console.error('Twitch SDK failed to load');
    }
}

waitForTwitchSDK(initTwitchEmbed);