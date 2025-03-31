import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from './config.js';
// Import visualization modules
import * as Bars from './visualizations/bars.js';
import * as Sphere from './visualizations/sphere.js';
import * as Terrain from './visualizations/terrain.js';
import * as Galaxy from './visualizations/galaxy.js';
// Import the new AI Generator module
import { AiGenerator } from './aiGenerator.js';

// Main variables
let scene, camera, renderer, analyser, dataArray;
let audioContext, mediaStreamSource;
let activeVisualization = null; // This will now hold the group/object returned by the create function
let activeVisualizationModule = null; // This will hold the imported module (Bars, Sphere, etc.) or the dynamic AI module
let controls, visualizationType = 'bars';
let lastUserSelectedVizType = 'bars'; // Keep track of user's choice before AI takes over

// AI related variables
let aiGenerator = null; // Instance of the AiGenerator class
let isAiModeActive = false;

// DOM elements
const startButton = document.getElementById('startButton');
const statusElement = document.getElementById('status');
const sensitivitySlider = document.getElementById('sensitivity');
const smoothingSlider = document.getElementById('smoothing');
const visualizationTypeSelector = document.getElementById('visualizationType');
const aiToggle = document.getElementById('aiToggle'); // The AI toggle checkbox
const aiStatusElement = document.getElementById('aiStatus'); // For AI status messages

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add point light for more dynamic lighting
    const pointLight = new THREE.PointLight(0xffffff, 1.5, 500);
    pointLight.position.set(50, 100, 150);
    scene.add(pointLight);

    // Add controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = config.camera.autoRotateSpeed;
    controls.listenToKeyEvents(window);

    // Initialize AI Generator
    aiGenerator = new AiGenerator(config, aiStatusElement, onAiModuleReady, onAiError);

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
            video: true, // Need video temporarily to get audio permissions sometimes
            audio: true,
            preferCurrentTab: false,
            selfBrowserSurface: "exclude",
            systemAudio: "include"
        });

        // Check if audio track exists
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
             // Stop the dummy video track if one exists
            stream.getVideoTracks().forEach(track => track.stop());
            throw new Error('No audio track found. Share a tab/window with audio.');
        }

        // Stop video tracks as we only need audio
        stream.getVideoTracks().forEach(track => track.stop());

        statusElement.textContent = 'Audio capture started';
        startButton.textContent = 'Change Tab Source';

        // Close existing audio context if present
        if (audioContext) {
            await audioContext.close();
        }

        // Create audio context and analyzer
        audioContext = new AudioContext();
        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();

        analyser.fftSize = config.audio.fftSize;
        analyser.minDecibels = config.audio.minDecibels;
        analyser.maxDecibels = config.audio.maxDecibels;
        analyser.smoothingTimeConstant = parseFloat(smoothingSlider.value);

        mediaStreamSource.connect(analyser);

        // Create data array for frequency analysis
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Create the currently selected visualization (or AI if active)
        const typeToCreate = isAiModeActive ? 'ai' : visualizationType;
        if (isAiModeActive && aiGenerator) {
            aiGenerator.start(analyser); // Start AI generation if active
        } else {
            await createVisualization(typeToCreate); // Otherwise create selected viz
        }

        // Start animation loop if not already running
        if (!renderer) return;
        if (renderer.info.render.frame === 0) {
            animate();
        }

        // Handle stream ending (user stops sharing)
        stream.getAudioTracks()[0].onended = () => {
            statusElement.textContent = 'Audio capture stopped';
            startButton.textContent = 'Start Visualizer';
            stopAiMode(); // Turn off AI mode if stream stops
            aiToggle.checked = false;
            aiStatusElement.textContent = '';
            if (activeVisualization) {
                scene.remove(activeVisualization);
                activeVisualization = null;
                activeVisualizationModule = null;
            }
            // Clean up audio resources
            if (mediaStreamSource) mediaStreamSource.disconnect();
            if (audioContext) audioContext.close().catch(e => console.error("Error closing audio context:", e));
            analyser = null;
            audioContext = null;
            mediaStreamSource = null;
            dataArray = null;
        };

    } catch (error) {
        console.error('Error capturing audio:', error);
        statusElement.textContent = 'Error: ' + error.message;
        startButton.textContent = 'Try Again';
        stopAiMode(); // Ensure AI mode is off if setup fails
        aiToggle.checked = false;
        aiStatusElement.textContent = '';
    }
}

// Create the selected visualization by calling the appropriate module
async function createVisualization(type, aiModule = null) { // Optional aiModule parameter
    // Remove existing visualization if any
    if (activeVisualization) {
        scene.remove(activeVisualization);
        // Maybe call a cleanup function if the module provided one? (Future enhancement)
        activeVisualization = null;
        activeVisualizationModule = null;
    }

    statusElement.textContent = `Loading ${type === 'ai' ? 'AI' : type}...`;

    // Select the correct module based on type
    try {
        if (type === 'ai') {
            if (aiModule) {
                activeVisualizationModule = aiModule;
                // Ensure config namespace exists, default if not
                config.aiGeneratedViz = config.aiGeneratedViz || {};
            } else {
                console.warn("Attempted to create AI visualization without a loaded module.");
                 // Fallback to user's last selected type or default
                 await createVisualization(lastUserSelectedVizType);
                 return; // Exit early
            }
        } else {
            switch (type) {
                case 'bars':
                    activeVisualizationModule = Bars;
                    break;
                case 'sphere':
                    activeVisualizationModule = Sphere;
                    break;
                case 'terrain':
                    activeVisualizationModule = Terrain;
                    break;
                case 'galaxy':
                    activeVisualizationModule = Galaxy;
                    break;
                default:
                    console.warn(`Unknown visualization type: ${type}. Defaulting to '${lastUserSelectedVizType}'.`);
                    await createVisualization(lastUserSelectedVizType);
                    return; // Exit early
            }
        }


        // Call the create function from the selected module
        if (activeVisualizationModule && typeof activeVisualizationModule.createVisualization === 'function') {
            // Provide the specific config namespace for AI
            const vizConfig = type === 'ai' ? config.aiGeneratedViz : config[type];
            const currentConfig = { ...config, [type === 'ai' ? 'aiGeneratedViz' : type]: vizConfig }; // Merge namespace into config copy

            activeVisualization = activeVisualizationModule.createVisualization(scene, currentConfig); // Pass potentially specific config
            if (activeVisualization instanceof THREE.Object3D) { // Check if it returned a valid object
                scene.add(activeVisualization);
                statusElement.textContent = `Visualizer: ${type === 'ai' ? 'AI Generated' : type}`;
                visualizationType = type; // Update the active type
            } else {
                 throw new Error(`Create function for ${type} did not return a valid THREE.Object3D.`);
            }
        } else {
             throw new Error(`Module for ${type} does not have a valid createVisualization function.`);
        }
    } catch (error) {
        console.error(`Error creating visualization '${type}':`, error);
        statusElement.textContent = `Error creating ${type}.`;
        // Attempt to fallback safely
        activeVisualization = null;
        activeVisualizationModule = null;
        if (type !== lastUserSelectedVizType) { // Avoid infinite loop if default fails
             console.log(`Falling back to visualizer: ${lastUserSelectedVizType}`);
             await createVisualization(lastUserSelectedVizType);
        } else {
            console.error("Fallback visualizer also failed.");
             statusElement.textContent = `Error creating ${type}. Cannot load fallback.`;
        }
    }
}

// Update visualizations based on audio data
function updateVisualization() {
    if (!analyser || !activeVisualization || !activeVisualizationModule || !dataArray) return;

    analyser.getByteFrequencyData(dataArray);
    const sensitivity = parseFloat(sensitivitySlider.value);

    if (typeof activeVisualizationModule.updateVisualization === 'function') {
        try {
             // Provide the specific config namespace for AI
             const vizConfig = visualizationType === 'ai' ? config.aiGeneratedViz : config[visualizationType];
             const currentConfig = { ...config, [visualizationType === 'ai' ? 'aiGeneratedViz' : visualizationType]: vizConfig }; // Merge namespace into config copy

            activeVisualizationModule.updateVisualization(activeVisualization, dataArray, analyser, sensitivity, currentConfig); // Pass config
        } catch (error) {
            console.error(`Error updating visualization '${visualizationType}':`, error);
            statusElement.textContent = `Error updating ${visualizationType}. Stopping updates for this viz.`;
            // Disable updates for this broken viz
            const failedVizType = visualizationType; // Store before clearing
            activeVisualizationModule = null; // Stop trying to update

            // If AI mode is active, signal the generator to try again sooner
            if (isAiModeActive && aiGenerator) {
                aiStatusElement.textContent = `Error in AI viz. Generating new one...`;
                aiGenerator.regenerateNow(); // Ask generator to retry
            } else if (!isAiModeActive && failedVizType !== lastUserSelectedVizType) {
                // If not AI mode, maybe switch back to default non-AI
                 console.log(`Falling back to visualizer: ${lastUserSelectedVizType} after update error.`);
                 createVisualization(lastUserSelectedVizType);
            } else if (!isAiModeActive) {
                console.error(`Update error in default visualizer: ${lastUserSelectedVizType}. Stopping updates.`);
                // Stop trying to update the default viz too if it errors
            }
        }
    }
}

// --- AI Mode Control ---

// Callback when AI generator has a new module ready
function onAiModuleReady(aiModule) {
    if (!isAiModeActive) return; // Ignore if AI mode was turned off

    console.log("AI module loaded successfully. Switching...");
    aiStatusElement.textContent = "Switching to new AI visualizer...";

    // Make the 'AI Generated' option selectable and select it
    const aiOption = visualizationTypeSelector.querySelector('option[value="ai"]');
    if (aiOption) aiOption.disabled = false;
    visualizationTypeSelector.value = 'ai';
    visualizationTypeSelector.disabled = true; // Disable selector while AI is active

    // Switch to the new visualization
    createVisualization('ai', aiModule).then(() => {
         if (isAiModeActive) { // Check again in case it was toggled off during async load
             aiStatusElement.textContent = "AI Visualizer Active";
         }
    });
}

// Callback when AI generator encounters an error
function onAiError(errorMessage) {
     // Log the error, status already updated by generator
     console.error("AI Generation Error:", errorMessage);
     // We could potentially try to switch back to default here,
     // but the generator will keep trying, so let's allow that for now.
     // If it consistently fails, the user can toggle AI off.
}

function startAiMode() {
    if (isAiModeActive) return;
    if (!analyser) {
        aiStatusElement.textContent = "Start audio first.";
        aiToggle.checked = false; // Uncheck the toggle
        return;
    }
    isAiModeActive = true;
    console.log("Starting AI Mode");
    aiStatusElement.textContent = "AI Mode Starting...";

    // Store the currently selected user visualizer
    if (visualizationType !== 'ai') {
       lastUserSelectedVizType = visualizationType;
    }

    // Start the AI generator (it will generate the first one immediately)
    aiGenerator.start(analyser);

    visualizationTypeSelector.disabled = true; // Disable manual selection
    const aiOption = visualizationTypeSelector.querySelector('option[value="ai"]');
     if (aiOption) aiOption.disabled = false; // Ensure AI option is enabled
}

function stopAiMode() {
    if (!isAiModeActive) return;
    isAiModeActive = false;
    console.log("Stopping AI Mode");

    // Stop the AI generator
    aiGenerator.stop();

    visualizationTypeSelector.disabled = false; // Re-enable selector
    const aiOption = visualizationTypeSelector.querySelector('option[value="ai"]');
    if (aiOption) aiOption.disabled = true; // Disable AI option
    aiStatusElement.textContent = ""; // Clear AI status

    // Switch back to the user's last selected visualizer if needed and possible
    if (visualizationType === 'ai' && scene && analyser) {
         visualizationTypeSelector.value = lastUserSelectedVizType;
         createVisualization(lastUserSelectedVizType);
    } else if (visualizationType === 'ai' && !analyser) {
        // If audio stopped, just reset the type, don't create
        visualizationType = lastUserSelectedVizType;
        visualizationTypeSelector.value = lastUserSelectedVizType;
        if (activeVisualization) { // Clear the orphaned AI viz
            scene.remove(activeVisualization);
            activeVisualization = null;
            activeVisualizationModule = null;
        }
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (analyser && dataArray) {
        updateVisualization();
    }

    controls.update();
    renderer.render(scene, camera);
}

// --- Event listeners ---
startButton.addEventListener('click', setupAudioCapture);

smoothingSlider.addEventListener('input', (e) => {
    if (analyser) {
        analyser.smoothingTimeConstant = parseFloat(e.target.value);
    }
});

visualizationTypeSelector.addEventListener('change', async (e) => {
    const newType = e.target.value;
    // Only change if AI mode is not active and audio is running
    if (!isAiModeActive && newType !== 'ai' && scene && analyser && audioContext && audioContext.state === 'running') {
        lastUserSelectedVizType = newType; // Store user choice
        await createVisualization(newType);
    } else if (!isAiModeActive && newType !== 'ai') {
        // If audio isn't running, just store the type for later
        lastUserSelectedVizType = newType;
        visualizationType = newType;
    } else if (newType === 'ai' && !isAiModeActive) {
         // Prevent manual selection of disabled AI option
         e.target.value = lastUserSelectedVizType;
    }
});

aiToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        startAiMode();
    } else {
        stopAiMode();
    }
});

// Initialize everything
initScene();