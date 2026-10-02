// NHL Forge media for the selected team.
let teamInterviewsLoaded = false;
let teamPhotosLoaded = false;
const teamPhotoItems = [];
let teamPhotoIndex = 0;
let teamPlayerIDs = new Set();
let teamRosterPromise = null;

function teamMediaImage(image, ratio = '4_3', size = 20) {
    const raw = image?.templateUrl?.replace('{formatInstructions}', `t_ratio${ratio}-size${size}`) || image?.thumbnailUrl || '';
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' && url.hostname === 'media.d3.nhle.com' ? url.href : '';
    } catch (_) { return ''; }
}

function hasTeamPlayer(item) {
    return (item.tags || []).some(tag => {
        const match = /^playerid-(\d+)$/.exec(tag.slug || '');
        return match && (!teamPlayerIDs.size || teamPlayerIDs.has(match[1]));
    });
}

function isTeamPlayerInterview(item) {
    if (!hasTeamPlayer(item)) return false;
    const title = (item.title || item.fields?.headline || '').toLowerCase();
    const tags = (item.tags || []).map(tag => (tag.slug || '').toLowerCase());
    return tags.includes('locker-room') || tags.some(tag => tag.includes('interview')) ||
        /(?:^|\W)(?:pre-raw|post-raw|raw|interview|media op|media availability|press conference|scrum)(?:\W|$)/.test(title);
}

async function loadTeamMedia() {
    if (!currentTeamId) return;
    if (!teamRosterPromise) {
        teamRosterPromise = (async () => {
            const players = allPlayers.length ? allPlayers :
                (await (await hockeyFetch(`/api/roster/${currentTeamId}`)).json()).players || [];
            teamPlayerIDs = new Set(players.map(player => String(player.id)));
        })().catch(() => {});
    }
    await teamRosterPromise;
    if (!teamInterviewsLoaded) loadTeamInterviews();
    if (!teamPhotosLoaded) loadTeamPhotos();
}

async function loadTeamInterviews() {
    const root = document.getElementById('teamInterviews');
    try {
        const data = await (await hockeyFetch(`/api/team-media/${currentTeamId}/videos`)).json();
        const items = (data.items || []).filter(isTeamPlayerInterview)
            .filter(item => item.slug && item.fields?.brightcoveId)
            .sort((a, b) => String(b.contentDate || '').localeCompare(String(a.contentDate || ''))).slice(0, 6);
        root.replaceChildren();
        if (!items.length) { root.textContent = 'No recent player interviews available.'; teamInterviewsLoaded = true; return; }
        root.className = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
        for (const item of items) {
            const link = document.createElement('a');
            link.href = `https://www.nhl.com/video/${encodeURIComponent(item.slug)}`;
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.className = 'block rounded-lg border border-gray-200 overflow-hidden hover:ring-2 hover:ring-accent';
            const image = teamMediaImage(item.thumbnail, '16_9');
            if (image) {
                const img = document.createElement('img');
                img.src = image; img.alt = ''; img.loading = 'lazy';
                img.className = 'w-full object-contain bg-gray-100';
                img.style.aspectRatio = '16 / 9';
                link.append(img);
            }
            const label = document.createElement('div'); label.className = 'p-3';
            const title = document.createElement('strong'); title.textContent = item.fields?.headline || item.title || 'Interview';
            const date = document.createElement('small'); date.className = 'block text-gray-500 mt-1';
            if (item.contentDate) date.textContent = new Date(item.contentDate).toLocaleDateString();
            label.append(title, date); link.append(label); root.append(link);
        }
        teamInterviewsLoaded = true;
    } catch (_) { root.textContent = 'Interviews are temporarily unavailable. Reopen Media to retry.'; }
}

function showTeamPhoto(index) {
    if (!teamPhotoItems.length) return;
    teamPhotoIndex = (index + teamPhotoItems.length) % teamPhotoItems.length;
    const item = teamPhotoItems[teamPhotoIndex];
    const image = document.getElementById('teamPhotoLarge');
    image.src = teamMediaImage(item.image, '4_3', 50);
    image.alt = item.fields?.altText || item.fields?.headline || item.title || 'Team player photo';
    document.getElementById('teamPhotoCaption').textContent =
        [item.fields?.headline || item.title, item.fields?.credit ? `Photo: ${item.fields.credit}` : ''].filter(Boolean).join(' · ');
    const assetId = item.image?.templateUrl?.match(/\/prd\/([a-z0-9]+)(?:$|\?)/i)?.[1];
    document.getElementById('teamPhotoDownloads').classList.toggle('hidden', !assetId);
    if (assetId) {
        for (const link of document.querySelectorAll('#teamPhotoDownloads a[data-size]')) {
            link.href = `/api/player-photo/${assetId}?size=${link.dataset.size}`;
            link.download = `team-photo-${assetId}-${link.dataset.size}.jpg`;
        }
    }
    const dialog = document.getElementById('teamPhotoDialog');
    if (!dialog.open) dialog.showModal();
}

async function loadTeamPhotos(skip = 0) {
    const root = document.getElementById('teamPhotos');
    const more = document.getElementById('teamMorePhotos');
    more.disabled = true;
    try {
        const data = await (await hockeyFetch(`/api/team-media/${currentTeamId}/photos?skip=${skip}`)).json();
        if (skip === 0) { root.replaceChildren(); teamPhotoItems.length = 0; }
        for (const item of data.items || []) {
            if (!hasTeamPlayer(item)) continue;
            const image = teamMediaImage(item.image);
            if (!image) continue;
            const index = teamPhotoItems.push(item) - 1;
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'rounded-lg overflow-hidden border border-gray-200';
            button.setAttribute('aria-label', `View photo: ${item.fields?.altText || item.fields?.headline || item.title || `Photo ${index + 1}`}`);
            const img = document.createElement('img'); img.src = image; img.alt = ''; img.loading = 'lazy';
            img.className = 'w-full object-contain bg-gray-100'; img.style.aspectRatio = '4 / 3';
            button.append(img); button.addEventListener('click', () => showTeamPhoto(index)); root.append(button);
        }
        if (!teamPhotoItems.length) root.textContent = 'No player photos available.';
        more.classList.toggle('hidden', !data.pagination?.nextUrl || skip >= 240);
        more.onclick = () => loadTeamPhotos(skip + 24);
        teamPhotosLoaded = true;
    } catch (_) { if (!skip) root.textContent = 'Photos are temporarily unavailable. Reopen Media to retry.'; }
    finally { more.disabled = false; }
}

document.getElementById('teamPhotoClose')?.addEventListener('click', () => document.getElementById('teamPhotoDialog').close());
document.getElementById('teamPhotoPrev')?.addEventListener('click', () => showTeamPhoto(teamPhotoIndex - 1));
document.getElementById('teamPhotoNext')?.addEventListener('click', () => showTeamPhoto(teamPhotoIndex + 1));
document.getElementById('teamPhotoDialog')?.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') showTeamPhoto(teamPhotoIndex - 1);
    if (event.key === 'ArrowRight') showTeamPhoto(teamPhotoIndex + 1);
});
