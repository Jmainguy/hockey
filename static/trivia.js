// Get team ID from URL
const params = new URLSearchParams(window.location.search);
const teamId = params.get('team');

let roster = [];
let currentPlayerIndex = 0;
let revealStep = 0; // 0=nothing, 1=name, 2=number, 3=position, 4=birthplace
let teamAbbrev = '';
let teamObj = null; // populated from /api/team response

// Position mapping
const positionMap = {
    'C': 'Center',
    'L': 'Left Wing',
    'R': 'Right Wing',
    'D': 'Defenseman',
    'G': 'Goalie'
};

async function loadTrivia() {
    if (!teamId) {
        showError('No team specified');
        return;
    }

    try {
        // Fetch team details to get abbreviation and name
        const teamResponse = await fetch(`/api/team/${teamId}`);
        if (teamResponse.ok) {
            const teamData = await teamResponse.json();
            if (teamData.teams && teamData.teams.length > 0) {
                const team = teamData.teams[0];
                teamObj = team;
                teamAbbrev = team.abbreviation;
                // Set page title and use shared header
                try { document.title = `${team.name} — Trivia`; } catch (e) {}
                if (window.populateSharedHeader) window.populateSharedHeader(team);
            }
        }

        // Fetch roster data - same as team page
        const response = await fetch(`/api/roster/${teamId}`);
        if (!response.ok) {
            throw new Error('Failed to load roster');
        }
        
        const data = await response.json();
        
        // Extract all players - matches team.js structure
        if (data.players && data.players.length > 0) {
            roster = data.players.filter(player => player.photo); // Only players with photos
            
            // Shuffle roster for random order
            roster = roster.sort(() => Math.random() - 0.5);

            if (roster.length === 0) {
                showError('No players with photos found for trivia');
                return;
            }

            // Update total questions count
            document.getElementById('totalQuestions').textContent = roster.length;

            // Hide loading, show trivia
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('triviaSection').classList.remove('hidden');

            // Load first player
            loadPlayer();
                if (window.populateSharedHeader && teamObj) window.populateSharedHeader(teamObj)
        } else {
            showError('No players found in roster');
        }
    } catch (error) {
        showError(error.message);
    }
}

function loadPlayer() {
    if (currentPlayerIndex >= roster.length) {
        showCompletion();
        return;
    }

    const player = roster[currentPlayerIndex];
    revealStep = 0;

    // Update progress
    document.getElementById('currentQuestion').textContent = currentPlayerIndex + 1;
    const progress = ((currentPlayerIndex + 1) / roster.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;

    // Set player image - use 'photo' field from roster data
    document.getElementById('playerImage').src = player.photo || '/static/img/placeholder-player.png';

    // Set player data (hidden initially)
    document.getElementById('playerName').textContent = player.name || 'Unknown';
    document.getElementById('playerNumber').textContent = `#${player.number || 'N/A'}`;
    document.getElementById('playerPosition').textContent = player.fullPosition || player.position || 'Unknown';
    
    // Birth place from player stats/info if available
    const birthplace = player.birthPlace || 'Unknown';
    document.getElementById('playerBirthplace').textContent = birthplace;

    // Reset all boxes to show questions
    const nameBox = document.getElementById('nameQuestion');
    const numberBox = document.getElementById('numberQuestion');
    const positionBox = document.getElementById('positionQuestion');
    const birthplaceBox = document.getElementById('birthplaceQuestion');
    
    nameBox.classList.remove('hidden');
    numberBox.classList.add('hidden');
    positionBox.classList.add('hidden');
    birthplaceBox.classList.add('hidden');

    // Show first question
    document.getElementById('nameLabel').textContent = 'What is their name?';
    document.getElementById('playerName').classList.add('hidden');

    // Reset buttons
    document.getElementById('revealBtn').classList.remove('hidden');
    document.getElementById('nextBtn').classList.add('hidden');
}

function reveal() {
    revealStep++;

    switch(revealStep) {
        case 1:
            // Reveal name answer and show number question
            document.getElementById('nameLabel').textContent = 'Name';
            document.getElementById('playerName').classList.remove('hidden');
            document.getElementById('numberQuestion').classList.remove('hidden');
            document.getElementById('numberLabel').textContent = 'What is their number?';
            document.getElementById('playerNumber').classList.add('hidden');
            break;
        case 2:
            // Reveal number answer and show position question
            document.getElementById('numberLabel').textContent = 'Number';
            document.getElementById('playerNumber').classList.remove('hidden');
            document.getElementById('positionQuestion').classList.remove('hidden');
            document.getElementById('positionLabel').textContent = 'What position do they play?';
            document.getElementById('playerPosition').classList.add('hidden');
            break;
        case 3:
            // Reveal position answer and show birthplace question
            document.getElementById('positionLabel').textContent = 'Position';
            document.getElementById('playerPosition').classList.remove('hidden');
            document.getElementById('birthplaceQuestion').classList.remove('hidden');
            document.getElementById('birthplaceLabel').textContent = 'Where were they born?';
            document.getElementById('playerBirthplace').classList.add('hidden');
            break;
        case 4:
            // Reveal birthplace answer
            document.getElementById('birthplaceLabel').textContent = 'Birth Place';
            document.getElementById('playerBirthplace').classList.remove('hidden');
            // Show next button, hide reveal
            document.getElementById('revealBtn').classList.add('hidden');
            document.getElementById('nextBtn').classList.remove('hidden');
            break;
    }
}

function nextPlayer() {
    currentPlayerIndex++;
    loadPlayer();
}

function showCompletion() {
    document.getElementById('triviaSection').querySelector('.bg-white.rounded-2xl.shadow-md.p-8').classList.add('hidden');
    document.getElementById('triviaSection').querySelector('.bg-white.rounded-2xl.shadow-md.p-6').classList.add('hidden');
    document.getElementById('completionSection').classList.remove('hidden');
}

function restartTrivia() {
    currentPlayerIndex = 0;
    roster = roster.sort(() => Math.random() - 0.5);
    document.getElementById('completionSection').classList.add('hidden');
    document.getElementById('triviaSection').querySelector('.bg-white.rounded-2xl.shadow-md.p-8').classList.remove('hidden');
    document.getElementById('triviaSection').querySelector('.bg-white.rounded-2xl.shadow-md.p-6').classList.remove('hidden');
    loadPlayer();
}

function showError(message) {
    document.getElementById('loading').classList.add('hidden');
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function goBackToTeam() {
    window.location.href = `/team/${teamId}`;
}

// Event listeners
document.getElementById('revealBtn')?.addEventListener('click', reveal);
document.getElementById('nextBtn')?.addEventListener('click', nextPlayer);
document.getElementById('backToTeam')?.addEventListener('click', goBackToTeam);
document.getElementById('restartBtn')?.addEventListener('click', restartTrivia);
document.getElementById('backToTeamBtn')?.addEventListener('click', goBackToTeam);

// Load trivia on page load
loadTrivia();

// Header navigation buttons
// Header navigation is handled centrally by team-header.js
