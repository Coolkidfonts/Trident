const audioPlayer = document.getElementById('audioPlayer');
const songInput = document.getElementById('songInput');
const playlist = document.getElementById('playlist');
const search = document.getElementById('search');
const playPauseBtn = document.getElementById('play-pause');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const rewindBtn = document.getElementById('rewind');
const fastForwardBtn = document.getElementById('fast-forward');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const progressHandle = document.getElementById('progress-handle');
const progressTooltip = document.getElementById('progress-tooltip');
const volume = document.getElementById('volume');
const volumeFill = document.getElementById('volume-fill');
const volumeHandle = document.getElementById('volume-handle');
const volumeDown = document.getElementById('volume-down');
const volumeUp = document.getElementById('volume-up');
const songTitle = document.querySelector('.song-title');
const artist = document.querySelector('.artist');
const album = document.querySelector('.album');
const albumArt = document.querySelector('.album-art');
const currentTime = document.querySelector('.current-time');
const duration = document.querySelector('.duration');
const playbackModeBtn = document.getElementById('playback-mode');
const equalizerBtn = document.getElementById('equalizer-btn');
const equalizerModal = document.getElementById('equalizer-modal');
const equalizerClose = document.getElementById('equalizer-close');
const visualizerContainer = document.getElementById('visualizer');
const collapseSidebarBtn = document.getElementById('collapse-sidebar');
const expandSidebarBtn = document.getElementById('expand-sidebar');
const sidebar = document.querySelector('.sidebar');
const player = document.getElementById('player');
const preloader = document.getElementById('preloader');

let songs = JSON.parse(localStorage.getItem('songs')) || new Map();
let flatSongs = [];
let currentSongIndex = -1;
let isPlaying = false;
let currentPlaylist = [];
let isFolderPlayback = false;
let currentPlayingButton = null;
let playbackMode = 'off'; // 'off', 'loop', 'next', 'shuffle'

let audioContext, analyser, source, dataArray;
let visualizerScene, visualizerCamera, visualizerRenderer;
let eqFilters = [];

const validExtensions = ['.mp3', '.flac', '.m4a', '.wav'];

// Preloader
window.addEventListener('load', () => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)(); // Init early
    setTimeout(() => {
        preloader.classList.add('fade-out');
        setTimeout(() => {
            preloader.style.display = 'none';
            player.style.display = 'block';
        }, 1000);
    }, 2000);
});

songInput.addEventListener('change', handleFiles);
playPauseBtn.addEventListener('click', togglePlayPause);
prevBtn.addEventListener('click', prevSong);
nextBtn.addEventListener('click', nextSong);
rewindBtn.addEventListener('click', () => {
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
    updateProgress();
});
fastForwardBtn.addEventListener('click', () => {
    audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 10);
    updateProgress();
});
audioPlayer.addEventListener('timeupdate', updateProgress);
audioPlayer.addEventListener('ended', handleSongEnd);
volume.addEventListener('input', setVolume);
volumeDown.addEventListener('click', () => adjustVolume(-0.1));
volumeUp.addEventListener('click', () => adjustVolume(0.1));
search.addEventListener('input', filterSongs);
audioPlayer.addEventListener('loadedmetadata', updateDuration);
progressBar.addEventListener('click', setProgress);
progressBar.addEventListener('mousemove', showTooltip);
progressBar.addEventListener('mouseleave', () => progressTooltip.style.display = 'none');
audioPlayer.addEventListener('play', initVisualizer);
collapseSidebarBtn.addEventListener('click', toggleSidebar);
expandSidebarBtn.addEventListener('click', toggleSidebar);
playbackModeBtn.addEventListener('click', cyclePlaybackMode);
equalizerBtn.addEventListener('click', toggleEqualizerModal);
equalizerClose.addEventListener('click', toggleEqualizerModal);

function handleFiles(e) {
    const files = Array.from(e.target.files).filter(file => 
        validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    );
    songs = organizeSongs(files);
    localStorage.setItem('songs', JSON.stringify([...songs]));
    flatSongs = songsFlatWithStructure(songs);
    displaySongs();
}

function organizeSongs(files) {
    const songMap = new Map();
    files.forEach(file => {
        const pathParts = file.webkitRelativePath.split('/');
        let current = songMap;
        for (let i = 0; i < pathParts.length - 1; i++) {
            if (!current.has(pathParts[i])) {
                current.set(pathParts[i], new Map());
            }
            current = current.get(pathParts[i]);
        }
        const fileName = pathParts[pathParts.length - 1];
        if (validExtensions.some(ext => fileName.toLowerCase().endsWith(ext))) {
            current.set(fileName, {
                path: URL.createObjectURL(file), // For static hosting, replace with direct URLs
                name: fileName,
                relativePath: file.webkitRelativePath,
                file: file
            });
        }
    });
    return songMap;
}

function songsFlatWithStructure(map = songs, result = []) {
    const sortedEntries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    sortedEntries.forEach(([key, value]) => {
        if (value instanceof Map) {
            const songsInFolder = Array.from(value.entries())
                .filter(([_, v]) => !(v instanceof Map))
                .sort((a, b) => a[0].localeCompare(b[0]));
            songsInFolder.forEach(([_, song]) => result.push(song));
            songsFlatWithStructure(value, result);
        }
    });
    return result;
}

function displaySongs(map = songs, container = playlist) {
    container.innerHTML = '';
    if (map.size === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.textContent = 'Add songs';
        emptyMessage.style.padding = '15px';
        emptyMessage.style.color = '#b0b0b0';
        emptyMessage.style.textAlign = 'center';
        container.appendChild(emptyMessage);
        return;
    }

    const sortedEntries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    sortedEntries.forEach(([key, value]) => {
        if (value instanceof Map) {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder collapsed';
            const folderText = document.createElement('span');
            folderText.textContent = key;
            const playBtn = document.createElement('button');
            playBtn.className = 'play-btn';
            playBtn.textContent = '⏵️';
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFolderPlayback(key, value, playBtn, folderDiv);
            });
            folderDiv.appendChild(folderText);
            folderDiv.appendChild(playBtn);
            folderDiv.addEventListener('click', (e) => {
                if (e.target !== playBtn) {
                    folderDiv.classList.toggle('collapsed');
                    folderDiv.classList.toggle('expanded');
                    folderContent.style.display = folderDiv.classList.contains('expanded') ? 'block' : 'none';
                }
            });

            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content';
            folderContent.style.display = 'none';

            displaySongs(value, folderContent);

            container.appendChild(folderDiv);
            container.appendChild(folderContent);
        }
    });

    sortedEntries.forEach(([key, value]) => {
        if (!(value instanceof Map)) {
            const songDiv = document.createElement('div');
            songDiv.className = 'song';
            songDiv.dataset.path = value.path;
            songDiv.textContent = value.name;
            songDiv.addEventListener('click', () => playSong(value));
            container.appendChild(songDiv);
        }
    });

    highlightCurrentSong();
}

function toggleFolderPlayback(key, map, button, folderDiv) {
    if (button.textContent === '⏵️') {
        currentPlaylist = Array.from(map.entries())
            .filter(([_, v]) => !(v instanceof Map))
            .map(([_, song]) => song)
            .sort((a, b) => a.name.localeCompare(b.name));
        isFolderPlayback = true;
        if (currentPlaylist.length > 0) {
            currentPlayingButton = button;
            playSong(currentPlaylist[0]);
            button.textContent = '⏸';
            button.classList.add('playing');
            folderDiv.classList.remove('collapsed');
            folderDiv.classList.add('expanded');
            folderDiv.nextElementSibling.style.display = 'block';
        }
    } else {
        audioPlayer.pause();
        isPlaying = false;
        button.textContent = '⏵️';
        button.classList.remove('playing');
        isFolderPlayback = false;
        currentPlaylist = [];
        currentPlayingButton = null;
    }
}

function filterSongs() {
    const query = search.value.toLowerCase();
    const filtered = filterMap(songs, query);
    displaySongs(filtered);
}

function filterMap(map, query) {
    const result = new Map();
    for (let [key, value] of map) {
        if (value instanceof Map) {
            const filteredSub = filterMap(value, query);
            if (filteredSub.size > 0) result.set(key, filteredSub);
        } else if (key.toLowerCase().includes(query)) {
            result.set(key, value);
        }
    }
    return result;
}

async function playSong(song) {
    if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioPlayer.src); // Clean up old blob URLs
    }
    currentSongIndex = flatSongs.findIndex(s => s.path === song.path);
    audioPlayer.src = song.path;
    audioPlayer.preload = 'auto'; // Preload for faster playback
    await new Promise(resolve => {
        audioPlayer.addEventListener('canplay', resolve, { once: true });
    });
    await audioPlayer.play().catch(err => console.error('Play error:', err));
    isPlaying = true;
    playPauseBtn.textContent = '⏸';
    playPauseBtn.classList.add('playing');
    await fetchMetadata(song);
    highlightCurrentSong();
    updateFolderPlayButton();
}

function highlightCurrentSong() {
    const allSongs = document.querySelectorAll('.song');
    allSongs.forEach(song => {
        song.classList.remove('playing');
        if (song.dataset.path === audioPlayer.src) {
            song.classList.add('playing');
        }
    });
}

function updateFolderPlayButton() {
    const playButtons = document.querySelectorAll('.play-btn');
    playButtons.forEach(btn => {
        if (btn === currentPlayingButton) {
            btn.textContent = isPlaying ? '⏸' : '⏵️';
            btn.classList.toggle('playing', isPlaying);
        } else if (btn.textContent !== '⏵️' || btn.classList.contains('playing')) {
            btn.textContent = '⏵️';
            btn.classList.remove('playing');
        }
    });
}

function togglePlayPause() {
    if (isPlaying) {
        audioPlayer.pause();
        playPauseBtn.textContent = '⏵️';
        playPauseBtn.classList.remove('playing');
    } else {
        audioPlayer.play().catch(err => console.error('Play error:', err));
        playPauseBtn.textContent = '⏸';
        playPauseBtn.classList.add('playing');
    }
    isPlaying = !isPlaying;
    updateFolderPlayButton();
}

function prevSong() {
    if (isFolderPlayback && currentPlaylist.length > 0) {
        const folderIndex = currentPlaylist.findIndex(s => s.path === flatSongs[currentSongIndex].path);
        if (folderIndex > 0) playSong(currentPlaylist[folderIndex - 1]);
    } else if (currentSongIndex > 0) {
        playSong(flatSongs[currentSongIndex - 1]);
    }
}

function nextSong() {
    if (isFolderPlayback && currentPlaylist.length > 0) {
        const folderIndex = currentPlaylist.findIndex(s => s.path === flatSongs[currentSongIndex].path);
        if (folderIndex < currentPlaylist.length - 1) playSong(currentPlaylist[folderIndex + 1]);
    } else if (currentSongIndex < flatSongs.length - 1) {
        playSong(flatSongs[currentSongIndex + 1]);
    }
}

function handleSongEnd() {
    if (isFolderPlayback && currentPlaylist.length > 0) {
        const folderIndex = currentPlaylist.findIndex(s => s.path === flatSongs[currentSongIndex].path);
        if (folderIndex < currentPlaylist.length - 1) {
            playSong(currentPlaylist[folderIndex + 1]);
        } else {
            isFolderPlayback = false;
            currentPlayingButton.textContent = '⏵️';
            currentPlayingButton.classList.remove('playing');
            currentPlayingButton = null;
        }
    } else {
        switch (playbackMode) {
            case 'loop':
                playSong(flatSongs[currentSongIndex]);
                break;
            case 'next':
                if (currentSongIndex < flatSongs.length - 1) {
                    playSong(flatSongs[currentSongIndex + 1]);
                }
                break;
            case 'shuffle':
                const randomIndex = Math.floor(Math.random() * flatSongs.length);
                playSong(flatSongs[randomIndex]);
                break;
            default:
                break;
        }
    }
}

function updateProgress() {
    const percentage = (audioPlayer.currentTime / audioPlayer.duration) * 100 || 0;
    progressFill.style.width = `${percentage}%`;
    progressHandle.style.left = `calc(${percentage}% - 7px)`;
    currentTime.textContent = formatTime(audioPlayer.currentTime);
}

function setProgress(e) {
    const rect = progressBar.getBoundingClientRect();
    const percentage = ((e.clientX - rect.left) / rect.width) * 100;
    const time = (percentage / 100) * audioPlayer.duration;
    audioPlayer.currentTime = time;
    updateProgress();
}

function showTooltip(e) {
    const rect = progressBar.getBoundingClientRect();
    const percentage = ((e.clientX - rect.left) / rect.width) * 100;
    const time = (percentage / 100) * audioPlayer.duration;
    progressTooltip.textContent = formatTime(time);
    progressTooltip.style.left = `${percentage}%`;
    progressTooltip.style.display = 'block';
}

function updateDuration() {
    duration.textContent = formatTime(audioPlayer.duration);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function setVolume() {
    audioPlayer.volume = volume.value;
    volumeFill.style.width = `${audioPlayer.volume * 100}%`;
    volumeHandle.style.left = `calc(${audioPlayer.volume * 100}% - 7px)`;
}

function adjustVolume(change) {
    let newVolume = audioPlayer.volume + change;
    newVolume = Math.max(0, Math.min(1, newVolume));
    audioPlayer.volume = newVolume;
    volume.value = newVolume;
    volumeFill.style.width = `${newVolume * 100}%`;
    volumeHandle.style.left = `calc(${newVolume * 100}% - 7px)`;
}

async function fetchMetadata(song) {
    songTitle.textContent = song.name.split('.').slice(0, -1).join('.');
    artist.textContent = 'Unknown Artist';
    album.textContent = 'Unknown Album';
    albumArt.style.backgroundImage = '';

    if (!song.file || typeof jsmediatags === 'undefined') return;

    return new Promise((resolve) => {
        jsmediatags.read(song.file, {
            onSuccess: function(tag) {
                const { title, artist: artistName, album: albumName, picture } = tag.tags;
                songTitle.textContent = title || song.name.split('.').slice(0, -1).join('.');
                artist.textContent = artistName || 'Unknown Artist';
                album.textContent = albumName || 'Unknown Album';
                if (picture) {
                    const base64String = btoa(String.fromCharCode.apply(null, new Uint8Array(picture.data)));
                    albumArt.style.backgroundImage = `url(data:${picture.format};base64,${base64String})`;
                }
                resolve();
            },
            onError: () => resolve()
        });
    });
}

function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    player.classList.toggle('sidebar-collapsed');
    updateVisualizerPosition();
}

function updateVisualizerPosition() {
    if (visualizerScene && visualizerCamera) {
        const isCollapsed = player.classList.contains('sidebar-collapsed');
        const offsetX = isCollapsed ? 0 : 175;
        visualizerScene.position.x = offsetX;
        visualizerCamera.lookAt(visualizerScene.position);
    }
}

function initVisualizer() {
    if (!analyser) {
        analyser = audioContext.createAnalyser();
        source = audioContext.createMediaElementSource(audioPlayer);
        analyser.fftSize = 256; // Reduced from 512 for better performance
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        visualizerScene = new THREE.Scene();
        visualizerCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        visualizerRenderer = new THREE.WebGLRenderer({ canvas: visualizerContainer, alpha: true });
        visualizerRenderer.setSize(window.innerWidth, window.innerHeight);

        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        visualizerScene.add(ambientLight);
        const pointLight = new THREE.PointLight(0xffffff, 1, 500);
        pointLight.position.set(0, 50, 50);
        visualizerScene.add(pointLight);

        // Simplified bars (fewer, less detailed)
        const bars = [];
        const barCount = analyser.frequencyBinCount / 4; // 64 bars instead of 128
        const radius = 100;
        for (let i = 0; i < barCount; i++) {
            const angle = (i / barCount) * Math.PI * 2;
            const geometry = new THREE.CylinderGeometry(1, 1, 1, 16); // Lower poly count
            const material = new THREE.MeshPhongMaterial({ color: 0x1db954 });
            const bar = new THREE.Mesh(geometry, material);
            bar.position.x = Math.cos(angle) * radius;
            bar.position.z = Math.sin(angle) * radius;
            bars.push(bar);
            visualizerScene.add(bar);
        }

        // Simplified particles (fewer, less detailed)
        const particles = new THREE.Group();
        const particleCount = 50; // Reduced from 200
        const particleGeometry = new THREE.SphereGeometry(0.3, 8, 8); // Lower detail
        const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.set(
                (Math.random() - 0.5) * 300,
                (Math.random() - 0.5) * 300,
                (Math.random() - 0.5) * 300
            );
            particles.add(particle);
        }
        visualizerScene.add(particles);

        visualizerCamera.position.set(0, 200, 0);
        visualizerCamera.lookAt(visualizerScene.position);

        let frameCount = 0;
        let lastBass = 0;
        function animate() {
            requestAnimationFrame(animate);
            frameCount++;
            if (frameCount % 3 !== 0) return; // Throttle to ~20 FPS

            analyser.getByteFrequencyData(dataArray);
            const bass = Math.min(255, dataArray.slice(0, 16).reduce((sum, val) => sum + val, 0) / 16);
            const mids = Math.min(255, dataArray.slice(16, 64).reduce((sum, val) => sum + val, 0) / 48);
            const highs = Math.min(255, dataArray.slice(64, 128).reduce((sum, val) => sum + val, 0) / 64);

            // Update styles only on significant change
            if (Math.abs(bass - lastBass) > 10) {
                document.body.style.setProperty('--bg-color', `rgba(${bass * 0.5}, ${mids * 0.5}, ${highs * 0.5}, 0.8)`);
                lastBass = bass;
            }

            bars.forEach((bar, i) => {
                const height = Math.max(1, dataArray[i] / 5);
                bar.scale.y = height;
                bar.position.y = height / 2;
                bar.material.color.setRGB(bass / 255, mids / 255, highs / 255);
            });

            particles.children.forEach(p => {
                p.position.y += bass / 100;
                if (p.position.y > 150) p.position.y = -150;
            });
            particles.rotation.y += 0.01;

            pointLight.intensity = 1 + bass / 255;
            visualizerRenderer.render(visualizerScene, visualizerCamera);
        }
        animate();
    }
}

function cyclePlaybackMode() {
    const modes = ['off', 'loop', 'next', 'shuffle'];
    const icons = ['🚫', '♾️', '➡️', '🎲'];
    const tooltips = ['No playback mode', 'Loop current song', 'Play next song', 'Shuffle playlist'];
    const currentIndex = modes.indexOf(playbackMode);
    playbackMode = modes[(currentIndex + 1) % modes.length];
    playbackModeBtn.textContent = icons[modes.indexOf(playbackMode)];
    playbackModeBtn.setAttribute('data-tooltip', tooltips[modes.indexOf(playbackMode)]);
}

function toggleEqualizerModal() {
    equalizerModal.style.display = equalizerModal.style.display === 'flex' ? 'none' : 'flex';
}

document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case ' ':
            e.preventDefault();
            togglePlayPause();
            break;
        case 'ArrowRight':
            audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 10);
            updateProgress();
            break;
        case 'ArrowLeft':
            audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
            updateProgress();
            break;
    }
});

document.body.style.background = 'radial-gradient(circle, var(--bg-color, rgba(20, 20, 20, 0.8)), #0a0a0a)';
flatSongs = songsFlatWithStructure(songs);
displaySongs();
setVolume();
cyclePlaybackMode();
