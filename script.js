// script.js
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
    setTimeout(() => {
        preloader.classList.add('fade-out');
        setTimeout(() => {
            preloader.style.display = 'none';
            player.style.display = 'block';
        }, 1000); // Match transition duration
    }, 2000); // Show preloader for 2 seconds
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
    console.log('Files detected:', files.map(f => f.webkitRelativePath));
    songs = organizeSongs(files);
    console.log('Organized songs:', [...songs]);
    localStorage.setItem('songs', JSON.stringify([...songs]));
    flatSongs = songsFlatWithStructure(songs);
    console.log('Flat songs:', flatSongs);
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
                path: URL.createObjectURL(file),
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
        console.log(`Playing folder ${key}:`, currentPlaylist);
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
    currentSongIndex = flatSongs.findIndex(s => s.path === song.path);
    audioPlayer.src = song.path;
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
            case 'off':
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
    progressFill.style.width = `${percentage}%`;
    progressHandle.style.left = `calc(${percentage}% - 7px)`;
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

    if (!song.file) {
        console.error('No file object available for metadata:', song);
        return;
    }

    if (typeof jsmediatags === 'undefined') {
        console.error('jsmediatags library not loaded.');
        return;
    }

    console.log('Attempting to read metadata for:', song.name);
    return new Promise((resolve) => {
        jsmediatags.read(song.file, {
            onSuccess: function(tag) {
                const { title, artist: artistName, album: albumName, picture } = tag.tags;
                console.log('Metadata fetched:', { title, artistName, albumName, hasPicture: !!picture });
                
                songTitle.textContent = title || song.name.split('.').slice(0, -1).join('.');
                artist.textContent = artistName || 'Unknown Artist';
                album.textContent = albumName || 'Unknown Album';
                
                if (picture) {
                    const base64String = btoa(
                        String.fromCharCode.apply(null, new Uint8Array(picture.data))
                    );
                    const imageUrl = `data:${picture.format};base64,${base64String}`;
                    albumArt.style.backgroundImage = `url(${imageUrl})`;
                    console.log('Album art set:', imageUrl.substring(0, 50) + '...');
                }
                resolve();
            },
            onError: function(error) {
                console.error('Metadata error:', error);
                resolve();
            }
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
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        source = audioContext.createMediaElementSource(audioPlayer);

        // Initialize equalizer filters
        const freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        eqFilters = freqs.map(freq => {
            const filter = audioContext.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.gain.value = 0;
            filter.Q.value = 1.0;
            return filter;
        });

        // Chain filters
        source.connect(eqFilters[0]);
        for (let i = 0; i < eqFilters.length - 1; i++) {
            eqFilters[i].connect(eqFilters[i + 1]);
        }
        eqFilters[eqFilters.length - 1].connect(analyser);
        analyser.connect(audioContext.destination);

        analyser.fftSize = 512;
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        visualizerScene = new THREE.Scene();
        visualizerCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        visualizerRenderer = new THREE.WebGLRenderer({ canvas: visualizerContainer, alpha: true });
        visualizerRenderer.setSize(window.innerWidth, window.innerHeight);

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        visualizerScene.add(ambientLight);
        const pointLight = new THREE.PointLight(0xffffff, 1, 500);
        pointLight.position.set(0, 50, 50);
        visualizerScene.add(pointLight);

        // Circular bars lying flat, growing upward
        const bars = [];
        const barCount = analyser.frequencyBinCount / 2;
        const radius = 100;
        for (let i = 0; i < barCount; i++) {
            const angle = (i / barCount) * Math.PI * 2;
            const geometry = new THREE.CylinderGeometry(1, 1, 1, 32);
            const material = new THREE.MeshPhongMaterial({ color: 0x1db954 });
            const bar = new THREE.Mesh(geometry, material);
            bar.position.x = Math.cos(angle) * radius;
            bar.position.z = Math.sin(angle) * radius;
            bars.push(bar);
            visualizerScene.add(bar);
        }

        // Color bleed glow (radial gradient sprite)
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 256);
        const texture = new THREE.CanvasTexture(canvas);
        const glowMaterial = new THREE.SpriteMaterial({
            map: texture,
            color: 0x1db954,
            transparent: true,
            opacity: 0.5
        });
        const glowSprite = new THREE.Sprite(glowMaterial);
        glowSprite.scale.set(300, 300, 1);
        glowSprite.position.y = -1; // Just below bars
        visualizerScene.add(glowSprite);

        // White spheres flying in the background
        const particles = new THREE.Group();
        const particleCount = 200;
        const particleGeometry = new THREE.SphereGeometry(0.5, 16, 16);
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

        visualizerCamera.position.set(0, 200, 0); // Above the circle
        visualizerCamera.lookAt(visualizerScene.position);

        function animate() {
            requestAnimationFrame(animate);
            analyser.getByteFrequencyData(dataArray);

            const bass = Math.min(255, dataArray.slice(0, 32).reduce((sum, val) => sum + val, 0) / 32);
            const mids = Math.min(255, dataArray.slice(32, 128).reduce((sum, val) => sum + val, 0) / 96);
            const highs = Math.min(255, dataArray.slice(128, 256).reduce((sum, val) => sum + val, 0) / 128);
            const volume = audioPlayer.volume * 255;

            document.body.style.background = `radial-gradient(circle, rgba(${bass * 0.5}, ${mids * 0.5}, ${highs * 0.5}, 0.8), #0a0a0a)`;
            document.querySelectorAll('.control-btn, .play-btn, .volume-btn').forEach(btn => {
                btn.style.background = `rgba(${bass * 0.7}, ${mids * 0.7}, ${highs * 0.7}, 0.9)`;
            });

            const dynamicColor = `rgb(${bass}, ${mids}, ${highs})`;
            progressFill.style.background = dynamicColor;
            volumeFill.style.background = dynamicColor;

            // Animate bars
            bars.forEach((bar, i) => {
                const height = Math.max(1, dataArray[i] / 5);
                bar.scale.y = height;
                bar.position.y = height / 2;
                bar.material.color.setRGB(bass / 255, mids / 255, highs / 255);
            });

            // Animate glow
            glowMaterial.color.setRGB(bass / 255, mids / 255, highs / 255);
            glowMaterial.opacity = 0.3 + bass / 255 * 0.3;

            // Animate white spheres
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
    const tooltips = [
        'No playback mode',
        'Loop current song',
        'Play next song',
        'Shuffle playlist'
    ];
    const currentIndex = modes.indexOf(playbackMode);
    playbackMode = modes[(currentIndex + 1) % modes.length];
    playbackModeBtn.textContent = icons[modes.indexOf(playbackMode)];
    playbackModeBtn.setAttribute('data-tooltip', tooltips[modes.indexOf(playbackMode)]);
    console.log('Playback mode set to:', playbackMode);
}

function toggleEqualizerModal() {
    equalizerModal.style.display = equalizerModal.style.display === 'flex' ? 'none' : 'flex';
}

// Equalizer Presets
const equalizerPresets = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bass: [6, 4, 2, 0, 0, 0, 0, 0, 0, 0],
    treble: [0, 0, 0, 0, 0, 0, 2, 4, 6, 8],
    pop: [0, 2, 4, 6, 4, 2, 0, -2, -4, -6],
    rock: [4, 3, 2, 0, -2, -3, -2, 0, 2, 4]
};

function applyEqualizerPreset(preset) {
    const gains = equalizerPresets[preset] || equalizerPresets.flat;
    const sliders = document.querySelectorAll('.eq-sliders input');
    sliders.forEach((slider, index) => {
        slider.value = gains[index];
        eqFilters[index].gain.value = gains[index];
        slider.parentElement.querySelector('.gain-value').textContent = `${gains[index]} dB`;
    });
}

function setupEqualizer() {
    const presetButtons = document.querySelectorAll('.preset-btn');
    const sliders = document.querySelectorAll('.eq-sliders input');

    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const preset = btn.dataset.preset;
            if (preset === 'custom') {
                sliders.forEach(slider => slider.disabled = false);
            } else {
                sliders.forEach(slider => slider.disabled = true);
                applyEqualizerPreset(preset);
            }
        });
    });

    sliders.forEach((slider, index) => {
        slider.addEventListener('input', () => {
            const gain = parseFloat(slider.value);
            eqFilters[index].gain.value = gain;
            slider.parentElement.querySelector('.gain-value').textContent = `${gain} dB`;
            presetButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelector('.preset-btn[data-preset="custom"]').classList.add('active');
            sliders.forEach(s => s.disabled = false);
        });
    });

    // Default to Flat preset
    applyEqualizerPreset('flat');
    document.querySelector('.preset-btn[data-preset="flat"]').classList.add('active');
    sliders.forEach(slider => slider.disabled = true);
}

// Keyboard controls
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

document.body.style.background = 'radial-gradient(circle, rgba(20, 20, 20, 0.8), #0a0a0a)';
flatSongs = songsFlatWithStructure(songs);
displaySongs();
setVolume();
cyclePlaybackMode();
setupEqualizer();