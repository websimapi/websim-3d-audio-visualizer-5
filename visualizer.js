import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from 'config';

// Import visualization modules
import { createBarVisualization, updateBarVisualization } from './visualizers/barVisualizer.js';
import { createSphereVisualization, updateSphereVisualization } from './visualizers/sphereVisualizer.js';
import { createTerrainVisualization, updateTerrainVisualization } from './visualizers/terrainVisualizer.js';
import { createGalaxyVisualization, updateGalaxyVisualization } from './visualizers/galaxyVisualizer.js';
import { createWaveformVisualization, updateWaveformVisualization } from './visualizers/waveformVisualizer.js';

// Main variables
let scene, camera, renderer, analyser, dataArray, timeDataArray;
let audioContext, mediaStreamSource;
let activeVisualization = null;
let controls, visualizationType = 'bars';

// DOM elements
const startButton = document.getElementById('startButton');
const statusElement = document.getElementById('status');
const sensitivitySlider = document.getElementById('sensitivity');
const smoothingSlider = document.getElementById('smoothing');
const visualizationTypeSelector = document.getElementById('visualizationType');

// Initialize the scene
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(
        config.camera.fov, 
        window.innerWidth / window.innerHeight, 
        config.camera.near, 
        config.camera.far
    );
    camera.position.set(
        config.camera.initialPosition.x,
        config.camera.initialPosition.y,
        config.camera.initialPosition.z
    );
    
    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('visualizer-container').appendChild(renderer.domElement);
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 50, 100);
    scene.add(directionalLight);
    
    // Add controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = config.camera.autoRotateSpeed;

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Audio capture and analysis setup
async function setupAudioCapture() {
    try {
        // Request user to select a tab to capture
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,  
            audio: true,
            preferCurrentTab: false, 
            selfBrowserSurface: "exclude", 
            systemAudio: "include" 
        });
        
        // Check if audio track exists
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error('No audio track found. Please select a tab with audio.');
        }
        
        // Stop video tracks as we only need audio
        stream.getVideoTracks().forEach(track => track.stop());
        
        statusElement.textContent = 'Audio capture started';
        startButton.textContent = 'Change Tab Source';
        
        // Create audio context and analyzer
        audioContext = new AudioContext();
        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        
        analyser.fftSize = config.audio.fftSize;
        analyser.minDecibels = config.audio.minDecibels;
        analyser.maxDecibels = config.audio.maxDecibels;
        analyser.smoothingTimeConstant = config.audio.defaultSmoothing;
        
        mediaStreamSource.connect(analyser);
        
        // Create data array for frequency analysis
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        // Create array for time domain data (waveform)
        timeDataArray = new Uint8Array(analyser.fftSize);
        
        // Create the currently selected visualization
        createVisualization(visualizationType);
        
        // Start animation loop if not already running
        if (!renderer) return;
        animate();
        
        // Handle stream ending (user stops sharing)
        stream.getAudioTracks()[0].onended = () => {
            statusElement.textContent = 'Audio capture stopped';
            startButton.textContent = 'Start Visualizer';
            if (activeVisualization) {
                scene.remove(activeVisualization);
                activeVisualization = null;
            }
        };
        
    } catch (error) {
        console.error('Error capturing audio:', error);
        statusElement.textContent = 'Error: ' + error.message;
        startButton.textContent = 'Try Again';
    }
}

// Create the selected visualization
function createVisualization(type) {
    // Remove existing visualization if any
    if (activeVisualization) {
        scene.remove(activeVisualization);
    }
    
    switch (type) {
        case 'bars':
            activeVisualization = createBarVisualization();
            break;
        case 'sphere':
            activeVisualization = createSphereVisualization();
            break;
        case 'terrain':
            activeVisualization = createTerrainVisualization();
            break;
        case 'galaxy':
            activeVisualization = createGalaxyVisualization();
            break;
        case 'waveform':
            activeVisualization = createWaveformVisualization();
            break;
    }
    
    scene.add(activeVisualization);
}

// Update visualizations based on audio data
function updateVisualization() {
    if (!analyser || !activeVisualization) return;
    
    // Get audio data
    analyser.getByteFrequencyData(dataArray);
    // Get time domain data for waveform visualizers
    analyser.getByteTimeDomainData(timeDataArray);
    
    // Get sensitivity value from slider
    const sensitivity = parseFloat(sensitivitySlider.value);
    
    switch (visualizationType) {
        case 'bars':
            updateBarVisualization(activeVisualization, dataArray, sensitivity);
            break;
        case 'sphere':
            updateSphereVisualization(activeVisualization, dataArray, sensitivity);
            break;
        case 'terrain':
            updateTerrainVisualization(activeVisualization, dataArray, sensitivity);
            break;
        case 'galaxy':
            updateGalaxyVisualization(activeVisualization, dataArray, sensitivity);
            break;
        case 'waveform':
            updateWaveformVisualization(activeVisualization, dataArray, timeDataArray, sensitivity);
            break;
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    updateVisualization();
    
    controls.update();
    renderer.render(scene, camera);
}

// Event listeners
startButton.addEventListener('click', setupAudioCapture);

smoothingSlider.addEventListener('input', (e) => {
    if (analyser) {
        analyser.smoothingTimeConstant = parseFloat(e.target.value);
    }
});

visualizationTypeSelector.addEventListener('change', (e) => {
    visualizationType = e.target.value;
    if (scene && analyser) {
        createVisualization(visualizationType);
    }
});

// Initialize everything
initScene();